import { Hono } from "hono";
import { encrypt, decrypt } from "../services/crypto.js";
import { getUser, getPremiumRequestUsage, getBillingUsage, parseUsageData, verifyPat, getUserOrgs } from "../services/github.js";
import { getClaudeCodeMonthUsage, parseClaudeCodeData, verifyAdminKey } from "../services/anthropic.js";
import { verifyAccessToken, getClaudeWebUsage, getValidToken, readLocalCredentials, refreshAccessToken } from "../services/claudeWeb.js";
import { formatDateNow } from "../views/layout.js";
import { icon } from "../views/icons.js";
import {
  requestDeviceCode, pollForToken, getClientId,
  startFlow, getFlow, completeFlow, failFlow, removeFlow,
} from "../services/oauth.js";
import {
  getAllAccounts, getAccountById, getAccountByUsername,
  createAccount, updateAccount, deleteAccount, toggleFavorite, togglePause,
  upsertUsageHistory, getLatestUsage, getUsageDetails,
  clearUsageDetails, insertUsageDetail,
  PLAN_LIMITS, CLAUDE_CODE_BUDGETS, setSetting, getAllData,
} from "../db/sqlite.js";
import { syncToMysql } from "../db/mysql.js";
import { accountCard, alertBox, oauthDeviceCode, editAccountForm } from "../views/components.js";
import { escapeHtml, parseId, validatePlan, validateClaudePlan } from "../utils.js";
import { startAutoRefresh } from "../index.js";

const api = new Hono();

// --- Simple rate limiter for sensitive endpoints ---
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX = 30; // max requests per window

function rateLimit(c, key) {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now - entry.start > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(key, { start: now, count: 1 });
    return false;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) return true;
  return false;
}

// Clean up rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now - entry.start > RATE_LIMIT_WINDOW * 2) rateLimitMap.delete(key);
  }
}, 5 * 60_000);

// Rate limit middleware for mutation endpoints
api.use("*", async (c, next) => {
  const method = c.req.method;
  if (method === "GET") return next();
  const ip = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown";
  if (rateLimit(c, ip)) {
    return c.html(alertBox("error", "Too many requests. Please wait a moment."), 429);
  }
  return next();
});

// --- Helper: render account card with latest usage data ---
function renderCard(id, error = null) {
  const acc = getAccountById(id);
  if (!acc) return "";
  const usage = getLatestUsage(id);
  const details = usage ? getUsageDetails(usage.id) : [];
  return accountCard({ ...acc, pat_token: !!acc.pat_token }, usage, details, error);
}

// ===================== Account Management =====================

// Add account via PAT
api.post("/account/add-pat", async (c) => {
  try {
    const body = await c.req.parseBody();
    const pat = body.pat?.trim();
    const plan = validatePlan(body.plan) || "pro";
    const note = (body.note || "").trim().slice(0, 200);

    if (!pat) return c.html(alertBox("error", "Token is required"));

    // Verify PAT - get user info
    let user;
    try {
      user = await getUser(pat);
    } catch {
      return c.html(alertBox("error", "Invalid token. Make sure it's a valid Fine-grained PAT."));
    }

    // Verify billing access
    const verification = await verifyPat(pat, user.login);
    if (!verification.valid) {
      return c.html(alertBox("error", `Token works but cannot access billing data. Make sure the PAT has <strong>Plan: Read</strong> permission.<br><small>${verification.error}</small>`));
    }

    // Check if account exists
    const existing = getAccountByUsername(user.login);
    if (existing) {
      // Fetch orgs
      const orgs = await getUserOrgs(pat);

      // Update PAT and plan
      updateAccount(existing.id, {
        pat_token: encrypt(pat),
        copilot_plan: plan,
        avatar_url: user.avatar_url,
        display_name: user.name || user.login,
        github_orgs: orgs.join(","),
        login_method: "pat",
        note,
      });

      // Fetch fresh usage
      await fetchAndStoreUsage(existing.id, user.login, pat, plan);

      return c.html(alertBox("success", `Updated PAT for <strong>@${escapeHtml(user.login)}</strong>. <a href="/" class="underline">Go to Dashboard</a>`));
    }

    // Fetch orgs for new account
    const orgs = await getUserOrgs(pat);

    // Create new account
    createAccount({
      github_username: user.login,
      avatar_url: user.avatar_url,
      display_name: user.name || user.login,
      oauth_token: "",
      pat_token: encrypt(pat),
      copilot_plan: plan,
    });

    const newAcc = getAccountByUsername(user.login);
    if (newAcc) {
      if (orgs.length > 0) {
        updateAccount(newAcc.id, { github_orgs: orgs.join(","), login_method: "pat", note });
      } else {
        updateAccount(newAcc.id, { login_method: "pat", note });
      }
      await fetchAndStoreUsage(newAcc.id, user.login, pat, plan);
    }

    return c.html(alertBox("success", `Added <strong>@${escapeHtml(user.login)}</strong> successfully! <a href="/" class="underline">Go to Dashboard</a>`));
  } catch (err) {
    return c.html(alertBox("error", `Error: ${escapeHtml(err.message)}`));
  }
});

// ===================== Claude Code Account =====================

// Add Claude Code account via Admin API Key
api.post("/account/add-claude", async (c) => {
  try {
    const body = await c.req.parseBody();
    const name = body.name?.trim();
    const apiKey = body.api_key?.trim();
    const userEmail = body.user_email?.trim() || "";
    const plan = validateClaudePlan(body.plan) || "api";
    const budget = parseFloat(body.budget) || CLAUDE_CODE_BUDGETS[plan] || 100;
    const noteClaudeCode = (body.note || "").trim().slice(0, 200);

    if (!name) return c.html(alertBox("error", "Display name is required"));
    if (!apiKey) return c.html(alertBox("error", "Admin API Key is required"));

    // Verify Admin API Key
    const verification = await verifyAdminKey(apiKey);
    if (!verification.valid) {
      return c.html(alertBox("error", `Invalid Admin API Key. ${escapeHtml(verification.error || "")}`));
    }

    // Check if name already exists
    const existing = getAccountByUsername(name);
    if (existing) {
      // Update existing
      updateAccount(existing.id, {
        pat_token: encrypt(apiKey),
        claude_plan: plan,
        monthly_budget: budget,
        claude_user_email: userEmail,
        account_type: "claude_code",
        login_method: "claude_api",
        note: noteClaudeCode,
      });

      await fetchAndStoreClaudeUsage(existing.id, apiKey, userEmail, budget);

      return c.html(alertBox("success", `Updated <strong>${escapeHtml(name)}</strong>. <a href="/" class="underline">Go to Dashboard</a>`));
    }

    // Create new
    createAccount({
      github_username: name,
      avatar_url: "",
      display_name: name,
      oauth_token: "",
      pat_token: encrypt(apiKey),
      copilot_plan: "pro", // default, ignored for Claude Code
    });

    const newAcc = getAccountByUsername(name);
    if (newAcc) {
      updateAccount(newAcc.id, {
        account_type: "claude_code",
        claude_plan: plan,
        monthly_budget: budget,
        claude_user_email: userEmail,
        login_method: "claude_api",
        note: noteClaudeCode,
      });

      await fetchAndStoreClaudeUsage(newAcc.id, apiKey, userEmail, budget);
    }

    return c.html(alertBox("success", `Added <strong>${escapeHtml(name)}</strong> successfully! <a href="/" class="underline">Go to Dashboard</a>`));
  } catch (err) {
    return c.html(alertBox("error", `Error: ${escapeHtml(err.message)}`));
  }
});

// ===================== Claude Web (Pro/Max) Account =====================

api.post("/account/add-claude-web", async (c) => {
  try {
    const body = await c.req.parseBody();
    const name = body.name?.trim();
    let accessToken = body.access_token?.trim();
    let refreshToken = body.refresh_token?.trim();
    const plan = validateClaudePlan(body.plan) || "pro";
    const autoDetect = body.auto_detect === "1";
    const noteClaudeWeb = (body.note || "").trim().slice(0, 200);

    if (!name) return c.html(alertBox("error", "Display name is required"));

    // Auto-detect from ~/.claude/.credentials.json
    if (autoDetect) {
      const local = readLocalCredentials();
      if (!local) {
        return c.html(alertBox("error", "Could not find Claude Code credentials. Make sure Claude Code CLI is installed and you are logged in (<code>claude</code>)."));
      }
      accessToken = local.accessToken;
      refreshToken = local.refreshToken;
    }

    if (!accessToken) return c.html(alertBox("error", "Access Token is required"));

    // Try to refresh if we have a refresh token (in case access token is expired)
    let expiresAt = 0;
    if (refreshToken) {
      try {
        const refreshed = await refreshAccessToken(refreshToken);
        accessToken = refreshed.accessToken;
        refreshToken = refreshed.refreshToken;
        expiresAt = Date.now() + refreshed.expiresIn * 1000;
      } catch (e) {
        // If refresh fails, try the access token directly
        console.warn("Token refresh failed, trying access token directly:", e.message);
      }
    }

    // Verify the token works
    const verification = await verifyAccessToken(accessToken);
    if (!verification.valid) {
      return c.html(alertBox("error", `Invalid or expired token. ${escapeHtml(verification.error || "")}. Run <code>claude</code> to re-login.`));
    }

    // Check if name already exists
    const existing = getAccountByUsername(name);
    if (existing) {
      updateAccount(existing.id, {
        pat_token: encrypt(accessToken),
        claude_plan: plan,
        account_type: "claude_web",
        claude_cf_clearance: refreshToken ? encrypt(refreshToken) : "",
        claude_token_expires_at: expiresAt,
        login_method: "claude_cli",
        note: noteClaudeWeb,
      });

      await fetchAndStoreClaudeWebUsage(existing.id, accessToken);

      return c.html(alertBox("success", `Updated <strong>${escapeHtml(name)}</strong>. <a href="/" class="underline">Go to Dashboard</a>`));
    }

    // Create new
    createAccount({
      github_username: name,
      avatar_url: "",
      display_name: name,
      oauth_token: "",
      pat_token: encrypt(accessToken),
      copilot_plan: "pro",
    });

    const newAcc = getAccountByUsername(name);
    if (newAcc) {
      updateAccount(newAcc.id, {
        account_type: "claude_web",
        claude_plan: plan,
        claude_cf_clearance: refreshToken ? encrypt(refreshToken) : "",
        claude_token_expires_at: expiresAt,
        login_method: "claude_cli",
        note: noteClaudeWeb,
      });

      await fetchAndStoreClaudeWebUsage(newAcc.id, accessToken);
    }

    return c.html(alertBox("success", `Added <strong>${escapeHtml(name)}</strong> successfully! <a href="/" class="underline">Go to Dashboard</a>`));
  } catch (err) {
    return c.html(alertBox("error", `Error: ${escapeHtml(err.message)}`));
  }
});

// Show edit form for account
api.get("/account/:id/edit", (c) => {
  const id = parseId(c.req.param("id"));
  if (!id) return c.html(alertBox("error", "Invalid account ID"), 400);
  const acc = getAccountById(id);
  if (!acc) return c.html(alertBox("error", "Account not found"));
  return c.html(editAccountForm({ ...acc, pat_token: !!acc.pat_token }));
});

// Cancel edit - return to normal card
api.get("/account/:id/cancel", (c) => {
  const id = parseId(c.req.param("id"));
  if (!id) return c.html("");
  const acc = getAccountById(id);
  if (!acc) return c.html("");
  return c.html(renderCard(id));
});

// Update account (PAT + plan, or Claude Code API key + plan + budget)
api.put("/account/:id", async (c) => {
  const id = parseId(c.req.param("id"));
  if (!id) return c.html(alertBox("error", "Invalid account ID"), 400);
  const acc = getAccountById(id);
  if (!acc) return c.html(alertBox("error", "Account not found"));

  const body = await c.req.parseBody();
  const editNote = (body.note || "").trim().slice(0, 200);

  if (acc.account_type === "claude_code") {
    // Claude Code account edit
    const newApiKey = body.api_key?.trim();
    const newPlan = validateClaudePlan(body.plan) || acc.claude_plan || "api";
    const newBudget = parseFloat(body.budget) || acc.monthly_budget || 100;
    const newEmail = body.user_email?.trim() ?? acc.claude_user_email;

    const updates = { claude_plan: newPlan, monthly_budget: newBudget, claude_user_email: newEmail, note: editNote };

    if (newApiKey) {
      const verification = await verifyAdminKey(newApiKey);
      if (!verification.valid) {
        return c.html(alertBox("error", "Invalid Admin API Key. Please check and try again."));
      }
      updates.pat_token = encrypt(newApiKey);
    }

    updateAccount(id, updates);

    const updatedAcc = getAccountById(id);
    const key = decrypt(updatedAcc.pat_token);
    if (key) {
      try {
        await fetchAndStoreClaudeUsage(id, key, updatedAcc.claude_user_email, newBudget);
      } catch (err) {
        console.error(`Refresh after edit failed: ${err.message}`);
      }
    }

    return c.html(renderCard(id));
  }

  if (acc.account_type === "claude_web") {
    // Claude Web (Pro/Max) account edit - OAuth approach
    const newAccessToken = body.access_token?.trim();
    const newRefreshToken = body.refresh_token?.trim();
    const newPlan = validateClaudePlan(body.plan) || acc.claude_plan || "pro";
    const autoDetect = body.auto_detect === "1";

    const updates = { claude_plan: newPlan, note: editNote };

    let accessToken = null;
    let refreshToken = null;

    if (autoDetect) {
      const local = readLocalCredentials();
      if (local) {
        accessToken = local.accessToken;
        refreshToken = local.refreshToken;
      }
    } else {
      accessToken = newAccessToken || null;
      refreshToken = newRefreshToken || null;
    }

    if (accessToken) {
      // Try refresh first
      if (refreshToken) {
        try {
          const refreshed = await refreshAccessToken(refreshToken);
          accessToken = refreshed.accessToken;
          refreshToken = refreshed.refreshToken;
          updates.claude_token_expires_at = Date.now() + refreshed.expiresIn * 1000;
        } catch { /* use direct token */ }
      }

      const verification = await verifyAccessToken(accessToken);
      if (!verification.valid) {
        return c.html(alertBox("error", `Invalid or expired token. Run <code>claude</code> to re-login.`));
      }
      updates.pat_token = encrypt(accessToken);
      if (refreshToken) updates.claude_cf_clearance = encrypt(refreshToken);
    }

    updateAccount(id, updates);

    const updatedAcc = getAccountById(id);
    const key = decrypt(updatedAcc.pat_token);
    if (key) {
      try {
        // Get valid token (auto-refresh)
        const rt = updatedAcc.claude_cf_clearance ? decrypt(updatedAcc.claude_cf_clearance) : null;
        const tkn = await getValidToken(key, rt, updatedAcc.claude_token_expires_at || 0);
        if (tkn.refreshed) {
          updateAccount(id, {
            pat_token: encrypt(tkn.accessToken),
            claude_cf_clearance: encrypt(tkn.refreshToken),
            claude_token_expires_at: tkn.expiresAt,
          });
        }
        await fetchAndStoreClaudeWebUsage(id, tkn.accessToken);
      } catch (err) {
        console.error(`Refresh after edit failed: ${err.message}`);
      }
    }

    return c.html(renderCard(id));
  }

  // Copilot account edit
  const newPat = body.pat?.trim();
  const newPlan = validatePlan(body.plan) || acc.copilot_plan;

  const updates = { copilot_plan: newPlan, note: editNote };

  if (newPat) {
    // Verify new token
    let user;
    try {
      user = await getUser(newPat);
    } catch {
      return c.html(alertBox("error", "Invalid token. Please check and try again."));
    }

    const verification = await verifyPat(newPat, user.login);
    if (!verification.valid) {
      return c.html(alertBox("error", "Token valid but no billing access. Ensure PAT has Plan: Read permission."));
    }

    updates.pat_token = encrypt(newPat);
    updates.avatar_url = user.avatar_url;
    updates.display_name = user.name || user.login;

    // Refresh orgs with new token
    const orgs = await getUserOrgs(newPat);
    updates.github_orgs = orgs.join(",");
  }

  updateAccount(id, updates);

  // Refresh usage data
  const updatedAcc = getAccountById(id);
  const pat = decrypt(updatedAcc.pat_token);
  if (pat) {
    try {
      await fetchAndStoreUsage(id, updatedAcc.github_username, pat, newPlan);
    } catch (err) {
      console.error(`Refresh after edit failed: ${err.message}`);
    }
  }

  return c.html(renderCard(id));
});

// Delete account
api.delete("/account/:id", (c) => {
  const id = parseId(c.req.param("id"));
  if (!id) return c.html("", 400);
  deleteAccount(id);
  return c.html(""); // Remove card from DOM
});

// ===================== Usage Refresh =====================

// Refresh single account
api.post("/refresh/:id", async (c) => {
  const id = parseId(c.req.param("id"));
  if (!id) return c.html(alertBox("error", "Invalid account ID"), 400);
  const acc = getAccountById(id);
  if (!acc) return c.html(alertBox("error", "Account not found"));

  const key = decrypt(acc.pat_token);
  if (!key) {
    return c.html(renderCard(id));
  }

  try {
    await refreshAccount(acc);
    // Refresh orgs for copilot accounts
    if (acc.account_type !== "claude_code" && acc.account_type !== "claude_web") {
      const orgs = await getUserOrgs(key);
      updateAccount(id, { github_orgs: orgs.join(",") });
    }
    return c.html(renderCard(id));
  } catch (err) {
    console.error(`Refresh failed for ${acc.github_username}:`, err.message);
    return c.html(renderCard(id, err.message));
  }
});

// Refresh all accounts
api.post("/refresh-all", async (c) => {
  const accounts = getAllAccounts();
  for (const acc of accounts) {
    if (acc.is_paused) continue;
    try {
      await refreshAccount(acc);
    } catch (err) {
      console.error(`Refresh failed for ${acc.github_username}:`, err.message);
    }
  }
  // Redirect to dashboard to show fresh data
  c.header("HX-Redirect", "/");
  return c.text("ok");
});

// Copy token (returns decrypted token as JSON - POST for security)
api.post("/account/:id/token", (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) return c.json({ error: "Invalid ID" }, 400);
  const acc = getAccountById(id);
  if (!acc) return c.json({ error: "Account not found" }, 404);
  const pat = decrypt(acc.pat_token);
  if (!pat) return c.json({ error: "No token stored" }, 404);
  return c.json({ token: pat });
});

// Toggle favorite
api.post("/account/:id/favorite", (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) return c.html(alertBox("error", "Invalid ID"), 400);
  const acc = getAccountById(id);
  if (!acc) return c.html(alertBox("error", "Account not found"), 404);
  toggleFavorite(id);
  return c.html(renderCard(id));
});

// Toggle pause (skip auto-refresh)
api.post("/account/:id/pause", (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) return c.html(alertBox("error", "Invalid ID"), 400);
  const acc = getAccountById(id);
  if (!acc) return c.html(alertBox("error", "Account not found"), 404);
  togglePause(id);
  return c.html(renderCard(id));
});

// ===================== OAuth Device Flow =====================

let flowCounter = 0;

api.post("/oauth/start", async (c) => {
  const clientId = getClientId();
  if (!clientId) {
    return c.html(alertBox("error", "OAuth not configured. Set GITHUB_OAUTH_CLIENT_ID in .env"));
  }

  try {
    const data = await requestDeviceCode(clientId);
    const flowId = `flow_${++flowCounter}_${Date.now()}`;
    startFlow(flowId, {
      device_code: data.device_code,
      user_code: data.user_code,
      verification_uri: data.verification_uri,
      expires_in: data.expires_in,
      interval: data.interval || 5,
    });

    return c.html(oauthDeviceCode(data.user_code, data.verification_uri, flowId));
  } catch (err) {
    return c.html(alertBox("error", `OAuth error: ${escapeHtml(err.message)}`));
  }
});

api.get("/oauth/poll/:flowId", async (c) => {
  const flowId = c.req.param("flowId");
  const flow = getFlow(flowId);
  if (!flow) return c.html(alertBox("error", "Flow expired. Try again."));

  if (flow.status === "complete") {
    removeFlow(flowId);
    return c.html(alertBox("success", `Logged in as <strong>@${flow.username}</strong>! Now add a PAT below for billing data.`));
  }
  if (flow.status === "error") {
    removeFlow(flowId);
    return c.html(alertBox("error", `Auth failed: ${flow.error}`));
  }

  const clientId = getClientId();
  try {
    const result = await pollForToken(clientId, flow.device_code);

    if (result.access_token) {
      // Success - get user info
      const user = await getUser(result.access_token);

      // Try using OAuth token for billing data too
      let billingWorks = false;
      try {
        const verification = await verifyPat(result.access_token, user.login);
        billingWorks = verification.valid;
      } catch {}

      // Save or update account with OAuth token (and as PAT if billing works)
      const existing = getAccountByUsername(user.login);
      const orgs = await getUserOrgs(result.access_token);

      if (existing) {
        const updates = {
          oauth_token: encrypt(result.access_token),
          avatar_url: user.avatar_url,
          display_name: user.name || user.login,
          github_orgs: orgs.join(","),
          login_method: "oauth",
        };
        if (billingWorks) {
          updates.pat_token = encrypt(result.access_token);
        }
        updateAccount(existing.id, updates);

        if (billingWorks) {
          try {
            await fetchAndStoreUsage(existing.id, existing.github_username, result.access_token, existing.copilot_plan);
          } catch {}
        }
      } else {
        createAccount({
          github_username: user.login,
          avatar_url: user.avatar_url,
          display_name: user.name || user.login,
          oauth_token: encrypt(result.access_token),
          pat_token: billingWorks ? encrypt(result.access_token) : "",
          copilot_plan: "pro",
        });

        const newAcc = getAccountByUsername(user.login);
        if (newAcc) {
          updateAccount(newAcc.id, { github_orgs: orgs.join(","), login_method: "oauth" });
          if (billingWorks) {
            try {
              await fetchAndStoreUsage(newAcc.id, user.login, result.access_token, "pro");
            } catch {}
          }
        }
      }

      completeFlow(flowId, result.access_token);
      flow.username = user.login;
      flow.billingWorks = billingWorks;

      if (billingWorks) {
        return c.html(alertBox("success",
          `Logged in as <strong>@${escapeHtml(user.login)}</strong> - billing data loaded! <a href="/" class="underline font-medium">Go to Dashboard</a>`
        ));
      }
      return c.html(alertBox("warning",
        `Logged in as <strong>@${escapeHtml(user.login)}</strong>, but this token cannot access billing data. Please also add a <strong>Classic PAT</strong> or <strong>Fine-grained PAT</strong> (Plan: Read) below.`
      ));
    }

    if (result.error === "authorization_pending") {
      return c.html(`
        <div class="text-center text-sm text-github-muted fade-in"
             hx-get="/api/oauth/poll/${flowId}" hx-trigger="every ${flow.interval || 5}s" hx-target="#oauth-status" hx-swap="innerHTML">
          ${icon("spinner", 16, "inline animate-spin mr-1")}
          Waiting for authorization...
        </div>
      `);
    }

    if (result.error === "slow_down") {
      flow.interval = (flow.interval || 5) + 5;
      return c.html(`
        <div class="text-center text-sm text-github-yellow"
             hx-get="/api/oauth/poll/${flowId}" hx-trigger="every ${flow.interval}s" hx-target="#oauth-status" hx-swap="innerHTML">
          Rate limited, slowing down...
        </div>
      `);
    }

    // expired_token or access_denied
    failFlow(flowId, result.error || "Unknown error");
    return c.html(alertBox("error", `Authorization failed: ${escapeHtml(result.error || "Unknown error")}`));
  } catch (err) {
    return c.html(`
      <div class="text-center text-sm text-github-muted"
           hx-get="/api/oauth/poll/${flowId}" hx-trigger="every ${flow.interval || 5}s" hx-target="#oauth-status" hx-swap="innerHTML">
        ${icon("spinner", 16, "inline animate-spin mr-1")}
        Waiting for authorization...
      </div>
    `);
  }
});

// ===================== Settings =====================

// Save OAuth Client ID
api.post("/settings/oauth-client", async (c) => {
  try {
    const body = await c.req.parseBody();
    const clientId = body.client_id?.trim();
    if (!clientId) return c.html(alertBox("error", "Client ID is required"));
    setSetting("github_oauth_client_id", clientId);
    return c.html(alertBox("success", 'OAuth App saved! <a href="/add" class="underline font-medium">Reload page to use Device Login →</a>'));
  } catch (err) {
    return c.html(alertBox("error", `Error: ${escapeHtml(err.message)}`));
  }
});
// Save Auto-Refresh interval
api.post("/settings/auto-refresh", async (c) => {
  try {
    const body = await c.req.parseBody();
    const minutes = Math.max(1, Math.min(1440, parseInt(body.minutes) || 60));
    setSetting("auto_refresh_minutes", String(minutes));
    startAutoRefresh();
    return c.html(alertBox("success", `Auto-refresh interval set to ${minutes} minute${minutes !== 1 ? "s" : ""}. Applied immediately.`));
  } catch (err) {
    return c.html(alertBox("error", `Error: ${escapeHtml(err.message)}`));
  }
});
api.post("/settings/mysql", async (c) => {
  try {
    const body = await c.req.parseBody();
    setSetting("mysql_host", body.host || "127.0.0.1");
    setSetting("mysql_port", body.port || "3306");
    setSetting("mysql_user", body.user || "root");
    // Preserve existing encrypted password if field is empty (placeholder shown instead)
    if (body.password) {
      setSetting("mysql_password", encrypt(body.password));
    }
    setSetting("mysql_database", body.database || "copilot_quota");
    return c.html(alertBox("success", "MySQL configuration saved!"));
  } catch (err) {
    return c.html(alertBox("error", `Error: ${escapeHtml(err.message)}`));
  }
});

// Sync to MySQL
api.post("/sync", async (c) => {
  try {
    const data = getAllData();
    await syncToMysql(data);
    return c.html(alertBox("success", `Synced ${data.accounts.length} accounts, ${data.usage_history.length} usage records to MySQL.`));
  } catch (err) {
    return c.html(alertBox("error", `Sync failed: ${escapeHtml(err.message)}`));
  }
});

// Time endpoint for auto-update
api.get("/time", (c) => {
  return c.text(formatDateNow());
});

// ===================== Helpers =====================

async function fetchAndStoreUsage(accountId, username, pat, plan) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const planLimit = PLAN_LIMITS[plan] || 300;

  try {
    const data = await getPremiumRequestUsage(pat, username, year, month);
    const parsed = parseUsageData(data, planLimit);

    upsertUsageHistory({
      account_id: accountId,
      year,
      month,
      gross_quantity: parsed.grossQuantity,
      included_quantity: parsed.includedQuantity,
      net_amount: parsed.netAmount,
      plan_limit: planLimit,
      percentage: parsed.percentage,
    });

    // Get the history ID
    const usage = getLatestUsage(accountId);
    if (usage && parsed.models.length > 0) {
      clearUsageDetails(usage.id);
      for (const model of parsed.models) {
        insertUsageDetail({
          history_id: usage.id,
          model: model.model,
          quantity: model.quantity,
          price_per_unit: model.price_per_unit,
          net_amount: model.net_amount,
        });
      }
    }

    return parsed;
  } catch (err) {
    console.error(`Failed to fetch usage for ${username}:`, err.message);
    
    // Try fallback to general billing endpoint
    try {
      const data = await getBillingUsage(pat, username, year, month);
      const items = (data.usageItems || []).filter(
        (i) => i.product && i.product.toLowerCase() === "copilot"
      );
      
      let grossQuantity = 0;
      let netAmount = 0;
      for (const item of items) {
        grossQuantity += item.quantity || 0;
        netAmount += item.netAmount || 0;
      }
      
      const percentage = planLimit > 0 ? (grossQuantity / planLimit) * 100 : 0;
      
      upsertUsageHistory({
        account_id: accountId,
        year,
        month,
        gross_quantity: grossQuantity,
        included_quantity: 0,
        net_amount: netAmount,
        plan_limit: planLimit,
        percentage: Math.round(percentage * 10) / 10,
      });
    } catch (fallbackErr) {
      console.error(`Fallback also failed for ${username}:`, fallbackErr.message);
    }
  }
}

// Export for use in scheduled refresh
export { fetchAndStoreUsage };

// ===================== Claude Code Helpers =====================

async function fetchAndStoreClaudeUsage(accountId, adminKey, userEmail, budget) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  try {
    const dailyData = await getClaudeCodeMonthUsage(adminKey, year, month);
    const parsed = parseClaudeCodeData(dailyData, userEmail || null);

    const percentage = budget > 0 ? (parsed.totalCostUSD / budget) * 100 : 0;

    upsertUsageHistory({
      account_id: accountId,
      year,
      month,
      gross_quantity: parsed.totalCostUSD,
      included_quantity: 0,
      net_amount: parsed.totalCostUSD,
      plan_limit: budget,
      percentage: Math.round(percentage * 10) / 10,
      sessions: parsed.sessions,
      lines_added: parsed.linesAdded,
      lines_removed: parsed.linesRemoved,
      commits: parsed.commits,
      pull_requests: parsed.pullRequests,
    });

    // Store model breakdown
    const usage = getLatestUsage(accountId);
    if (usage && parsed.models.length > 0) {
      clearUsageDetails(usage.id);
      for (const m of parsed.models) {
        insertUsageDetail({
          history_id: usage.id,
          model: m.model,
          quantity: m.input_tokens + m.output_tokens,
          price_per_unit: 0,
          net_amount: m.estimated_cost_cents / 100,
          input_tokens: m.input_tokens,
          output_tokens: m.output_tokens,
          cache_read_tokens: m.cache_read_tokens,
          cache_creation_tokens: m.cache_creation_tokens,
        });
      }
    }

    return parsed;
  } catch (err) {
    console.error(`Failed to fetch Claude Code usage for account ${accountId}:`, err.message);
  }
}

// ===================== Claude Web (Pro/Max) Helper =====================

async function fetchAndStoreClaudeWebUsage(accountId, accessToken) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  try {
    const data = await getClaudeWebUsage(accessToken);

    upsertUsageHistory({
      account_id: accountId,
      year,
      month,
      gross_quantity: 0,
      included_quantity: 0,
      net_amount: data.extraUsageSpent || 0,
      plan_limit: 0,
      percentage: data.weeklyUsagePct || 0,
      sessions: 0,
      lines_added: 0,
      lines_removed: 0,
      commits: 0,
      pull_requests: 0,
      session_usage_pct: data.sessionUsagePct || 0,
      weekly_usage_pct: data.weeklyUsagePct || 0,
      weekly_reset_at: data.weeklyResetAt || "",
      extra_usage_enabled: data.extraUsageEnabled ? 1 : 0,
      extra_usage_spent: data.extraUsageSpent || 0,
      extra_usage_limit: data.extraUsageLimit || 0,
      extra_usage_balance: data.extraUsageBalance || 0,
      extra_usage_reset_at: data.extraUsageResetAt || "",
    });

    return data;
  } catch (err) {
    console.error(`Failed to fetch Claude Web usage for account ${accountId}:`, err.message);
  }
}

export { fetchAndStoreClaudeUsage, fetchAndStoreClaudeWebUsage };

/**
 * Refresh usage for a single account (shared between routes and auto-refresh).
 * Handles all account types: copilot, claude_code, claude_web.
 */
export async function refreshAccount(acc) {
  const key = decrypt(acc.pat_token);
  if (!key) return;

  if (acc.account_type === "claude_code") {
    const budget = acc.monthly_budget || CLAUDE_CODE_BUDGETS[acc.claude_plan] || 100;
    await fetchAndStoreClaudeUsage(acc.id, key, acc.claude_user_email, budget);
  } else if (acc.account_type === "claude_web") {
    const rt = acc.claude_cf_clearance ? decrypt(acc.claude_cf_clearance) : null;
    const tkn = await getValidToken(key, rt, acc.claude_token_expires_at || 0);
    if (tkn.refreshed) {
      updateAccount(acc.id, {
        pat_token: encrypt(tkn.accessToken),
        claude_cf_clearance: encrypt(tkn.refreshToken),
        claude_token_expires_at: tkn.expiresAt,
      });
    }
    await fetchAndStoreClaudeWebUsage(acc.id, tkn.accessToken);
  } else {
    await fetchAndStoreUsage(acc.id, acc.github_username, key, acc.copilot_plan);
  }
}

export default api;
