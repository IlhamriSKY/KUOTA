import { Hono } from "hono";
import { encrypt, decrypt } from "../services/crypto.js";
import { getUser, getUserEmails, getPremiumRequestUsage, getBillingUsage, parseUsageData, verifyPat, getUserOrgs, getOrgPremiumRequestUsage, getOrgBillingUsage, detectCopilotPlan, getCopilotSeatActivity } from "../services/github.js";
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
import { escapeHtml, parseId, validatePlan, validateClaudePlan, validateEmail, validateOrgName, validateNote } from "../utils.js";
import { startAutoRefresh } from "../index.js";

const api = new Hono();

// Rate limiter for sensitive endpoints
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX = 30; // max requests per window
const MAX_MAP_SIZE = 10_000; // Maximum entries to prevent memory exhaustion
const CLEANUP_INTERVAL = 2 * 60_000; // Cleanup every 2 minutes

function rateLimit(c, key) {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  // If no entry or window expired, create new entry
  if (!entry || now - entry.start > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(key, { start: now, count: 1 });
    return false;
  }

  // Increment count
  entry.count++;

  // Check if limit exceeded
  if (entry.count > RATE_LIMIT_MAX) {
    return true;
  }

  return false;
}

// Clean up expired rate limit entries
function cleanupRateLimits() {
  const now = Date.now();
  let deleted = 0;

  for (const [key, entry] of rateLimitMap) {
    // Delete entries older than 2x window to allow for clock skew
    if (now - entry.start > RATE_LIMIT_WINDOW * 2) {
      rateLimitMap.delete(key);
      deleted++;
    }
  }

  // Log cleanup activity if entries were deleted
  if (deleted > 0) {
    console.log(`[Rate Limit] Cleaned up ${deleted} expired entries (${rateLimitMap.size} remaining)`);
  }

  // Safety check: if map is too large, force cleanup of oldest entries
  if (rateLimitMap.size > MAX_MAP_SIZE) {
    const excess = rateLimitMap.size - MAX_MAP_SIZE;
    console.warn(`[Rate Limit] Map size exceeded ${MAX_MAP_SIZE}, force-cleaning ${excess} entries`);

    // Convert to array, sort by start time, and delete oldest
    const entries = Array.from(rateLimitMap.entries())
      .sort((a, b) => a[1].start - b[1].start);

    for (let i = 0; i < excess; i++) {
      rateLimitMap.delete(entries[i][0]);
    }
  }
}

// Run cleanup periodically
setInterval(cleanupRateLimits, CLEANUP_INTERVAL);

// Rate limit middleware for mutation endpoints
api.use("*", async (c, next) => {
  const method = c.req.method;
  if (method === "GET") return next();

  // Get client IP with fallback chain
  const forwarded = c.req.header("x-forwarded-for");
  const realIp = c.req.header("x-real-ip");
  const ip = forwarded ? forwarded.split(',')[0].trim() : realIp || "unknown";

  if (rateLimit(c, ip)) {
    console.warn(`[Rate Limit] Blocked request from ${ip} (exceeded ${RATE_LIMIT_MAX} req/min)`);
    return c.html(alertBox("error", "Too many requests. Please wait a moment."), 429);
  }

  return next();
});

// Render account card HTML with latest usage data
function renderCard(id, error = null) {
  const acc = getAccountById(id);
  if (!acc) return "";
  const usage = getLatestUsage(id);
  const details = usage ? getUsageDetails(usage.id) : [];
  return accountCard({ ...acc, pat_token: !!acc.pat_token }, usage, details, error);
}

// Account Management =====================

// Detect orgs and plan for a given PAT (used by the add form dynamically)
api.post("/account/detect-orgs", async (c) => {
  try {
    const body = await c.req.parseBody();
    const pat = body.pat?.trim();
    if (!pat) return c.html(alertBox("error", "Token is required"));

    let user;
    try {
      user = await getUser(pat);
    } catch {
      return c.html(alertBox("error", "Invalid token."));
    }

    const orgs = await getUserOrgs(pat);

    // Auto-detect Copilot plan
    const detected = await detectCopilotPlan(pat, user.login, orgs);

    const planLabels = { free: "Free", pro: "Pro", pro_plus: "Pro+", business: "Business", enterprise: "Enterprise" };
    const planLimits = { free: 50, pro: 300, pro_plus: 1500, business: 300, enterprise: 1000 };

    // Build org selector HTML
    const orgOptions = [`<option value=""${detected.source !== "org" ? " selected" : ""}>Personal (${escapeHtml(user.login)})</option>`];
    for (const org of orgs) {
      const isDetected = detected.source === "org" && detected.org === org;
      orgOptions.push(`<option value="${escapeHtml(org)}"${isDetected ? " selected" : ""}>${escapeHtml(org)}${isDetected ? " (detected)" : ""}</option>`);
    }

    // Build plan selector HTML
    const plans = ["free", "pro", "pro_plus", "business", "enterprise"];
    const planOptions = plans.map(p => {
      const isDetected = detected.plan === p;
      return `<option value="${p}"${isDetected ? " selected" : ""}>${planLabels[p]} (${planLimits[p]} req/month)${isDetected ? " ✓ detected" : ""}</option>`;
    }).join("");

    // Plan detection status message
    let planStatus = "";
    if (detected.plan) {
      if (detected.source === "org") {
        planStatus = `<div class="flex items-center gap-1.5 text-xs text-emerald-500 mt-1">${icon("check-circle", 12)} Copilot <strong>${planLabels[detected.plan]}</strong> detected via org <strong class="censor-target">${escapeHtml(detected.org)}</strong></div>`;
      } else {
        planStatus = `<div class="flex items-center gap-1.5 text-xs text-emerald-500 mt-1">${icon("check-circle", 12)} Copilot <strong>${planLabels[detected.plan]}</strong> detected</div>`;
      }
    } else {
      planStatus = `<div class="flex items-center gap-1.5 text-xs text-amber-500 mt-1">${icon("alert-triangle", 12)} Could not detect Copilot plan. Select manually.</div>`;
    }

    return c.html(`
      <div class="fade-in space-y-2">
        <div class="flex items-center gap-2 text-xs text-emerald-500">
          ${icon("check-circle", 14)}
          <span>Token valid for <strong class="censor-target">@${escapeHtml(user.login)}</strong></span>
        </div>
        <div>
          <label class="block text-xs font-medium mb-1">Billing Source</label>
          <select name="billing_org" class="input-field w-full px-2.5 py-1.5 bg-background border rounded text-foreground text-xs">
            ${orgOptions.join("")}
          </select>
          <p class="text-[11px] text-muted-foreground mt-1">${orgs.length > 0 ? `Found ${orgs.length} org(s). Select the org that manages your Copilot seat, or "Personal" if self-managed.` : "No organizations found. Usage will be fetched from personal billing."}</p>
        </div>
        <div>
          <label class="block text-xs font-medium mb-1">Detected Plan</label>
          <select name="detected_plan" class="input-field w-full px-2.5 py-1.5 bg-background border rounded text-foreground text-xs" onchange="this.closest('form').querySelector('select[name=plan]').value = this.value">
            ${planOptions}
          </select>
          ${planStatus}
        </div>
      </div>
    `);
  } catch (err) {
    return c.html(alertBox("error", `Error: ${escapeHtml(err.message)}`));
  }
});

// Add account via PAT
api.post("/account/add-pat", async (c) => {
  try {
    const body = await c.req.parseBody();
    const pat = body.pat?.trim();
    // Prefer detected_plan from auto-detect, fallback to manual plan selection
    let plan = validatePlan(body.detected_plan) || validatePlan(body.plan) || "pro";
    const note = validateNote(body.note);
    let billingOrg = body.billing_org ? validateOrgName(body.billing_org) || "" : "";

    if (!pat) return c.html(alertBox("error", "Token is required"));
    if (body.billing_org && !billingOrg) {
      return c.html(alertBox("error", "Invalid organization name format"));
    }

    // Verify PAT - get user info
    let user;
    try {
      user = await getUser(pat);
    } catch {
      return c.html(alertBox("error", "Invalid token. Make sure it's a valid Fine-grained PAT."));
    }

    // Fetch orgs and emails
    const orgs = await getUserOrgs(pat);
    const emails = await getUserEmails(pat);
    const primaryEmail = emails.find(e => e.primary)?.email || user.email || "";

    // Auto-detect Copilot plan
    const detected = await detectCopilotPlan(pat, user.login, orgs);
    if (detected.plan) {
      // Use detected plan, override user selection
      plan = detected.plan;
      // Set billing org if detected from org
      if (detected.source === "org" && detected.org && !billingOrg) {
        billingOrg = detected.org;
      }
    } else if (!billingOrg && (plan === "business" || plan === "enterprise") && orgs.length > 0) {
      // Fallback: auto-detect billing org for business/enterprise plans
      const verification = await verifyPat(pat, user.login);
      if (verification.valid && verification.source === "org" && verification.org) {
        billingOrg = verification.org;
      } else if (orgs.length === 1) {
        billingOrg = orgs[0];
      }
    }

    const planLabels = { free: "Free", pro: "Pro", pro_plus: "Pro+", business: "Business", enterprise: "Enterprise" };

    // Check if account already exists
    const existing = getAccountByUsername(user.login);
    if (existing) {
      return c.html(alertBox("error", `Account <strong>@${escapeHtml(user.login)}</strong> already exists. Edit it from the dashboard instead.`));
    }

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
      updateAccount(newAcc.id, {
        github_orgs: orgs.join(","),
        github_email: primaryEmail,
        billing_org: billingOrg,
        login_method: "pat",
        note,
        reset_date: "",
      });
      await fetchAndStoreUsage(newAcc.id, user.login, pat, plan, billingOrg);
    }

    const detectedInfo = [];
    if (detected.plan) detectedInfo.push(`Plan: <strong>${planLabels[detected.plan]}</strong>`);
    if (billingOrg) detectedInfo.push(`Org: <strong class="censor-target">${escapeHtml(billingOrg)}</strong>`);
    const infoStr = detectedInfo.length > 0 ? ` (${detectedInfo.join(", ")})` : "";

    return c.html(alertBox("success", `Added <strong class="censor-target">@${escapeHtml(user.login)}</strong>${infoStr} successfully! <a href="/" class="underline">Go to Dashboard</a>`));
  } catch (err) {
    return c.html(alertBox("error", `Error: ${escapeHtml(err.message)}`));
  }
});

// Claude Code Account =====================

// Add Claude Code account via Admin API Key
api.post("/account/add-claude", async (c) => {
  try {
    const body = await c.req.parseBody();
    const name = body.name?.trim();
    const apiKey = body.api_key?.trim();
    const userEmail = body.user_email ? validateEmail(body.user_email) : "";
    const plan = validateClaudePlan(body.plan) || "api";
    const budget = parseFloat(body.budget) || CLAUDE_CODE_BUDGETS[plan] || 100;
    const noteClaudeCode = validateNote(body.note);

    if (!name) return c.html(alertBox("error", "Display name is required"));
    if (!apiKey) return c.html(alertBox("error", "Admin API Key is required"));
    if (body.user_email && !userEmail) {
      return c.html(alertBox("error", "Invalid email format"));
    }

    // Verify Admin API Key
    const verification = await verifyAdminKey(apiKey);
    if (!verification.valid) {
      return c.html(alertBox("error", `Invalid Admin API Key. ${escapeHtml(verification.error || "")}`));
    }

    // Check if name already exists
    const existing = getAccountByUsername(name);
    if (existing) {
      return c.html(alertBox("error", `Account <strong>${escapeHtml(name)}</strong> already exists. Edit it from the dashboard instead.`));
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

// Claude Web (Pro/Max) Account =====================

api.post("/account/add-claude-web", async (c) => {
  try {
    const body = await c.req.parseBody();
    const name = body.name?.trim();
    let accessToken = body.access_token?.trim();
    let refreshToken = body.refresh_token?.trim();
    const plan = validateClaudePlan(body.plan) || "pro";
    const autoDetect = body.auto_detect === "1";
    const noteClaudeWeb = validateNote(body.note);

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
      return c.html(alertBox("error", `Account <strong>${escapeHtml(name)}</strong> already exists. Edit it from the dashboard instead.`));
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
  const editNote = validateNote(body.note);

  if (acc.account_type === "claude_code") {
    // Claude Code account edit
    const newApiKey = body.api_key?.trim();
    const newPlan = validateClaudePlan(body.plan) || acc.claude_plan || "api";
    const newBudget = parseFloat(body.budget) || acc.monthly_budget || 100;
    const newEmail = body.user_email ? (validateEmail(body.user_email) || acc.claude_user_email) : acc.claude_user_email;

    if (body.user_email && !validateEmail(body.user_email)) {
      return c.html(alertBox("error", "Invalid email format"));
    }

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
  let newPlan = validatePlan(body.plan) || acc.copilot_plan;
  const newBillingOrg = body.billing_org !== undefined ? (validateOrgName(body.billing_org) || "") : acc.billing_org;

  // Validate billing org if provided
  if (body.billing_org && body.billing_org.trim() && !newBillingOrg) {
    return c.html(alertBox("error", "Invalid organization name format"));
  }

  // Handle reset_date
  const newResetDate = body.reset_date !== undefined ? (body.reset_date || "").trim() : acc.reset_date;

  const updates = { copilot_plan: newPlan, note: editNote, billing_org: newBillingOrg, reset_date: newResetDate };

  if (newPat) {
    // Verify new token
    let user;
    try {
      user = await getUser(newPat);
    } catch {
      return c.html(alertBox("error", "Invalid token. Please check and try again."));
    }

    updates.pat_token = encrypt(newPat);
    updates.avatar_url = user.avatar_url;
    updates.display_name = user.name || user.login;

    // Refresh orgs with new token
    const orgs = await getUserOrgs(newPat);
    updates.github_orgs = orgs.join(",");

    // Re-detect plan with new token
    const detected = await detectCopilotPlan(newPat, user.login, orgs);
    if (detected.plan) {
      newPlan = detected.plan;
      updates.copilot_plan = newPlan;
      if (detected.source === "org" && detected.org && !newBillingOrg) {
        updates.billing_org = detected.org;
      }
    }
  }

  updateAccount(id, updates);

  // Refresh usage data
  const updatedAcc = getAccountById(id);
  const pat = decrypt(updatedAcc.pat_token);
  if (pat) {
    try {
      await fetchAndStoreUsage(id, updatedAcc.github_username, pat, newPlan, newBillingOrg);
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

// Usage Refresh =====================

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
    // Always update GitHub username, display name, avatar_url, and email for Copilot accounts
    if (acc.account_type !== "claude_code" && acc.account_type !== "claude_web") {
      try {
        const user = await getUser(key);
        const emails = await getUserEmails(key);
        const primaryEmail = emails.find(e => e.primary)?.email || user.email || "";
        updateAccount(id, {
          github_username: user.login,
          display_name: user.name || user.login,
          avatar_url: user.avatar_url,
          github_email: primaryEmail,
        });
      } catch (err) {
        console.warn(`Failed to update GitHub user info for ${acc.github_username}:`, err.message);
      }
    }
    await refreshAccount(getAccountById(id));
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

// Refresh all accounts (returns list of IDs so client can refresh each individually)
api.post("/refresh-all", async (c) => {
  const accounts = getAllAccounts();
  const activeIds = accounts.filter(a => !a.is_paused).map(a => a.id);
  return c.json({ ids: activeIds });
});

// Copy token - uses custom header to avoid logging exposure (POST for security)
api.post("/account/:id/token", (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) return c.json({ error: "Invalid ID" }, 400);
  const acc = getAccountById(id);
  if (!acc) return c.json({ error: "Account not found" }, 404);
  const pat = decrypt(acc.pat_token);
  if (!pat) return c.json({ error: "No token stored" }, 404);

  // Return token via custom header instead of JSON body to prevent logging exposure
  // Client-side JavaScript will read from header and copy to clipboard
  c.header('X-Token-Value', pat);
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');

  return c.json({
    success: true,
    message: "Token available in X-Token-Value header"
  });
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

// OAuth Device Flow =====================

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
      const orgs = await getUserOrgs(result.access_token);
      const emails = await getUserEmails(result.access_token);
      const primaryEmail = emails.find(e => e.primary)?.email || user.email || "";

      // Try using OAuth token for billing data too
      let billingWorks = false;
      let verification = { valid: false, source: "unknown" };
      try {
        verification = await verifyPat(result.access_token, user.login);
        billingWorks = verification.valid;
      } catch {}

      // Auto-detect plan and billing org
      const detected = await detectCopilotPlan(result.access_token, user.login, orgs);
      const detectedPlan = detected.plan || "pro";
      const detectedBillingOrg = (detected.source === "org" && detected.org) ? detected.org
        : (verification.source === "org" && verification.org) ? verification.org : "";

      const existing = getAccountByUsername(user.login);

      if (existing) {
        const updates = {
          oauth_token: encrypt(result.access_token),
          avatar_url: user.avatar_url,
          display_name: user.name || user.login,
          github_orgs: orgs.join(","),
          github_email: primaryEmail,
          login_method: "oauth",
          copilot_plan: detectedPlan,
        };
        if (billingWorks) {
          updates.pat_token = encrypt(result.access_token);
        }
        if (detectedBillingOrg && !existing.billing_org) {
          updates.billing_org = detectedBillingOrg;
        }
        updateAccount(existing.id, updates);

        if (billingWorks) {
          try {
            await fetchAndStoreUsage(existing.id, existing.github_username, result.access_token, detectedPlan, existing.billing_org || detectedBillingOrg);
          } catch {}
        }
      } else {
        createAccount({
          github_username: user.login,
          avatar_url: user.avatar_url,
          display_name: user.name || user.login,
          oauth_token: encrypt(result.access_token),
          pat_token: billingWorks ? encrypt(result.access_token) : "",
          copilot_plan: detectedPlan,
        });

        const newAcc = getAccountByUsername(user.login);
        if (newAcc) {
          updateAccount(newAcc.id, {
            github_orgs: orgs.join(","),
            github_email: primaryEmail,
            login_method: "oauth",
            billing_org: detectedBillingOrg,
          });
          if (billingWorks) {
            try {
              await fetchAndStoreUsage(newAcc.id, user.login, result.access_token, detectedPlan, detectedBillingOrg);
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

// Settings =====================

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

// Helpers =====================

async function fetchAndStoreUsage(accountId, username, pat, plan, billingOrg = null) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const planLimit = PLAN_LIMITS[plan] || 300;

  // Helper to save parsed usage data
  function saveUsage(parsed) {
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
  }

  // Helper to try org-level endpoints
  async function tryOrgEndpoints(org) {
    // Try org premium request endpoint (with user filter)
    try {
      const data = await getOrgPremiumRequestUsage(pat, org, year, month, username);
      const parsed = parseUsageData(data, planLimit);
      if (parsed.grossQuantity > 0) {
        console.log(`Got usage for ${username} from org ${org} premium request endpoint (user-filtered)`);
        return saveUsage(parsed);
      }
    } catch (err) {
      console.log(`Org ${org} premium request (user-filtered) failed: ${err.message}`);
    }

    // Try org premium request endpoint without user filter (enterprise orgs may block user filter)
    try {
      const data = await getOrgPremiumRequestUsage(pat, org, year, month);
      const parsed = parseUsageData(data, planLimit);
      if (parsed.grossQuantity > 0) {
        console.log(`Got usage for ${username} from org ${org} premium request endpoint (unfiltered)`);
        return saveUsage(parsed);
      }
    } catch (err) {
      console.log(`Org ${org} premium request (unfiltered) failed: ${err.message}`);
    }

    // Try org general billing endpoint
    try {
      const data = await getOrgBillingUsage(pat, org, year, month);
      const items = (data.usageItems || []).filter(
        (i) => i.product && i.product.toLowerCase() === "copilot"
      );
      let grossQuantity = 0;
      let netAmount = 0;
      for (const item of items) {
        grossQuantity += item.grossQuantity || item.quantity || 0;
        netAmount += item.netAmount || 0;
      }
      if (grossQuantity > 0) {
        const percentage = planLimit > 0 ? (grossQuantity / planLimit) * 100 : 0;
        console.log(`Got usage for ${username} from org ${org} general billing endpoint`);
        return saveUsage({ grossQuantity, includedQuantity: 0, netAmount, percentage: Math.round(percentage * 10) / 10, models: [] });
      }
    } catch (err) {
      console.log(`Org ${org} general billing failed: ${err.message}`);
    }

    return null;
  }

  // Resolve billingOrg from parameter or stored account data
  const account = getAccountById(accountId);
  if (!billingOrg) {
    billingOrg = account?.billing_org || "";
  }

  // Collect orgs list for fallback scanning
  let allOrgs = account?.github_orgs ? account.github_orgs.split(",").filter(Boolean) : [];

  // If billing is from a specific org, try org endpoints FIRST
  if (billingOrg) {
    const result = await tryOrgEndpoints(billingOrg);
    if (result) return result;
    console.log(`Org ${billingOrg} endpoints returned no data, falling back to user-level...`);
  }

  // Try user-level premium request endpoint
  try {
    const data = await getPremiumRequestUsage(pat, username, year, month);
    const parsed = parseUsageData(data, planLimit);
    if (parsed.grossQuantity > 0) {
      return saveUsage(parsed);
    }
  } catch (err) {
    console.log(`User-level premium request failed for ${username}: ${err.message}`);
  }

  // Try user-level general billing endpoint
  try {
    const data = await getBillingUsage(pat, username, year, month);
    const parsed = parseUsageData(data, planLimit);
    if (parsed.grossQuantity > 0) {
      return saveUsage(parsed);
    }
  } catch (err) {
    console.log(`User-level billing also returned no data for ${username}: ${err.message}`);
  }

  // Only try org fallback scanning if a billing_org is set or plan is business/enterprise
  // Personal accounts (free/pro without billing_org) don't need org scanning
  const shouldScanOrgs = billingOrg || plan === "business" || plan === "enterprise";

  if (shouldScanOrgs) {
    if (allOrgs.length === 0) {
      try {
        const fetchedOrgs = await getUserOrgs(pat);
        if (fetchedOrgs.length > 0) {
          allOrgs = fetchedOrgs;
          updateAccount(accountId, { github_orgs: fetchedOrgs.join(",") });
        }
      } catch {}
    }

    for (const org of allOrgs) {
      if (org === billingOrg) continue; // Already tried above
      const result = await tryOrgEndpoints(org);
      if (result) {
        // Auto-save detected billing org for future fetches
        if (!billingOrg) {
          updateAccount(accountId, { billing_org: org });
          console.log(`Auto-detected billing org ${org} for ${username}`);
        }
        return result;
      }
    }
  }

  // No usage data found — this is normal for Free plan or start of month
  if (plan === "free") {
    // Free plan with 0 usage is expected, just save silently
  } else {
    console.warn(`No usage data found for ${username} (plan: ${plan}). Token may lack billing permissions.`);
  }
  upsertUsageHistory({
    account_id: accountId,
    year,
    month,
    gross_quantity: 0,
    included_quantity: 0,
    net_amount: 0,
    plan_limit: planLimit,
    percentage: 0,
  });
}

// Fetch and store Copilot last activity info (editor, last active time)
async function fetchCopilotActivity(accountId, pat, username, billingOrg, allOrgs) {
  // Try billing org first, then all orgs
  const orgsToTry = [];
  if (billingOrg) orgsToTry.push(billingOrg);
  for (const org of (allOrgs || [])) {
    if (org !== billingOrg) orgsToTry.push(org);
  }

  for (const org of orgsToTry) {
    try {
      const activity = await getCopilotSeatActivity(pat, org, username);
      if (activity && (activity.last_activity_at || activity.last_activity_editor)) {
        updateAccount(accountId, {
          last_activity_at: activity.last_activity_at || "",
          last_activity_editor: activity.last_activity_editor || "",
        });
        return activity;
      }
    } catch (err) {
      console.log(`Activity fetch failed for ${username} in org ${org}: ${err.message}`);
    }
  }
  return null;
}

// Export for use in scheduled refresh
export { fetchAndStoreUsage, fetchCopilotActivity };

// Claude Code Helpers =====================

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

// Claude Web (Pro/Max) Helper =====================

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
    // For copilot accounts: update GitHub user info, then fetch usage
    try {
      const user = await getUser(key);
      updateAccount(acc.id, {
        github_username: user.login,
        display_name: user.name || user.login,
        avatar_url: user.avatar_url,
      });
    } catch (err) {
      console.warn(`Failed to update GitHub user info for ${acc.github_username}:`, err.message);
    }

    // Plan detection only happens on add/edit, not during auto-refresh
    // to avoid inconsistent results from API permission variations
    let billingOrg = acc.billing_org || "";

    // Auto-detect billing org if missing and orgs exist
    if (!billingOrg) {
      const orgs = acc.github_orgs ? acc.github_orgs.split(",").filter(Boolean) : [];
      if (orgs.length === 1) {
        billingOrg = orgs[0];
        updateAccount(acc.id, { billing_org: billingOrg });
      }
    }

    // Refresh orgs list
    try {
      const orgs = await getUserOrgs(key);
      updateAccount(acc.id, { github_orgs: orgs.join(",") });
    } catch (err) {
      console.warn(`Failed to refresh orgs for ${acc.github_username}:`, err.message);
    }

    await fetchAndStoreUsage(acc.id, acc.github_username, key, acc.copilot_plan, billingOrg);

    // Fetch last activity info (editor session) for org-managed accounts
    const allOrgs = acc.github_orgs ? acc.github_orgs.split(",").filter(Boolean) : [];
    if (billingOrg || allOrgs.length > 0) {
      try {
        await fetchCopilotActivity(acc.id, key, acc.github_username, billingOrg, allOrgs);
      } catch (err) {
        console.log(`Activity fetch skipped for ${acc.github_username}: ${err.message}`);
      }
    }
  }
}

export default api;
