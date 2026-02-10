// Claude Pro/Max Usage via OAuth API (from Claude Code CLI)
// Uses OAuth access_token from ~/.claude/.credentials.json
// Endpoint: https://api.anthropic.com/api/oauth/usage
// Token refresh: https://platform.claude.com/v1/oauth/token

import { homedir } from "os";
import { join } from "path";
import { existsSync, readFileSync } from "fs";

const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const REFRESH_URL = "https://platform.claude.com/v1/oauth/token";
const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const SCOPES = "user:profile user:inference user:sessions:claude_code user:mcp_servers";
const REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes before expiration
const DEFAULT_TIMEOUT = 10000; // 10 seconds

/**
 * Fetch with timeout support
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeout);
    return response;
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw err;
  }
}

/**
 * Try to read Claude Code credentials from ~/.claude/.credentials.json
 * Returns { accessToken, refreshToken, expiresAt, subscriptionType } or null
 */
export function readLocalCredentials() {
  try {
    const credPath = join(homedir(), ".claude", ".credentials.json");
    if (!existsSync(credPath)) return null;
    const data = JSON.parse(readFileSync(credPath, "utf-8"));
    const oauth = data?.claudeAiOauth;
    if (!oauth?.accessToken) return null;
    return {
      accessToken: oauth.accessToken,
      refreshToken: oauth.refreshToken || null,
      expiresAt: oauth.expiresAt || 0,
      subscriptionType: oauth.subscriptionType || "pro",
    };
  } catch {
    return null;
  }
}

/**
 * Refresh an expired access token using the refresh token.
 * Returns { accessToken, refreshToken, expiresIn } or throws.
 */
export async function refreshAccessToken(refreshToken) {
  const res = await fetchWithTimeout(REFRESH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
      scope: SCOPES,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let parsed;
    try { parsed = JSON.parse(body); } catch {}
    const errCode = parsed?.error || parsed?.error_description || "";
    if (errCode === "invalid_grant") {
      throw new Error("Session expired. Please re-login with `claude` CLI.");
    }
    throw new Error(`Token refresh failed (${res.status}): ${errCode || body.slice(0, 200)}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresIn: data.expires_in || 3600,
  };
}

/**
 * Check if token needs refresh (expired or about to expire).
 */
function needsRefresh(expiresAt) {
  if (!expiresAt) return true;
  return Date.now() >= expiresAt - REFRESH_BUFFER_MS;
}

/**
 * Verify an access token by calling the usage endpoint.
 * Returns { valid, data?, error? }
 */
export async function verifyAccessToken(accessToken) {
  try {
    const res = await fetchWithTimeout(USAGE_URL, {
      headers: {
        "Authorization": `Bearer ${accessToken.trim()}`,
        "Accept": "application/json",
        "Content-Type": "application/json",
        "anthropic-beta": "oauth-2025-04-20",
      },
    });
    if (res.status === 401 || res.status === 403) {
      return { valid: false, error: "Token expired or invalid" };
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { valid: false, error: `API returned ${res.status}: ${text.slice(0, 200)}` };
    }
    const data = await res.json();
    return { valid: true, data };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

/**
 * Get a valid access token, refreshing if needed.
 * @param {string} accessToken
 * @param {string} refreshToken
 * @param {number} expiresAt - unix ms
 * @returns {{ accessToken, refreshToken, expiresAt, refreshed }}
 */
export async function getValidToken(accessToken, refreshToken, expiresAt) {
  if (!needsRefresh(expiresAt)) {
    return { accessToken, refreshToken, expiresAt, refreshed: false };
  }

  if (!refreshToken) {
    throw new Error("Token expired and no refresh token. Re-login with `claude` CLI.");
  }

  const result = await refreshAccessToken(refreshToken);
  return {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    expiresAt: Date.now() + result.expiresIn * 1000,
    refreshed: true,
  };
}

/**
 * Fetch usage data from api.anthropic.com/api/oauth/usage
 * Returns structured usage data.
 */
export async function getClaudeWebUsage(accessToken) {
  const res = await fetchWithTimeout(USAGE_URL, {
    headers: {
      "Authorization": `Bearer ${accessToken.trim()}`,
      "Accept": "application/json",
      "Content-Type": "application/json",
      "anthropic-beta": "oauth-2025-04-20",
    },
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error("Token expired or invalid. Re-login with `claude` CLI.");
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Usage API returned ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();

  // Parse the response into our standard format
  const result = {
    sessionUsagePct: 0,
    weeklyUsagePct: 0,
    weeklyResetAt: null,
    sessionResetAt: null,
    weeklyOpusUsagePct: 0,
    weeklyOpusResetAt: null,
    extraUsageEnabled: false,
    extraUsageSpent: 0,
    extraUsageLimit: 0,
    extraUsageBalance: 0,
    planType: "unknown",
    _raw: data,
  };

  // five_hour → session usage
  if (data.five_hour && typeof data.five_hour.utilization === "number") {
    result.sessionUsagePct = data.five_hour.utilization;
    result.sessionResetAt = data.five_hour.resets_at || null;
  }

  // seven_day → weekly usage
  if (data.seven_day && typeof data.seven_day.utilization === "number") {
    result.weeklyUsagePct = data.seven_day.utilization;
    result.weeklyResetAt = data.seven_day.resets_at || null;
  }

  // seven_day_opus → opus weekly limit (optional)
  if (data.seven_day_opus && typeof data.seven_day_opus.utilization === "number") {
    result.weeklyOpusUsagePct = data.seven_day_opus.utilization;
    result.weeklyOpusResetAt = data.seven_day_opus.resets_at || null;
  }

  // extra_usage → overage credits
  if (data.extra_usage) {
    result.extraUsageEnabled = data.extra_usage.is_enabled || false;
    result.extraUsageSpent = (data.extra_usage.used_credits || 0) / 100; // cents → dollars
    result.extraUsageLimit = (data.extra_usage.monthly_limit || 0) / 100;
    result.extraUsageBalance = result.extraUsageLimit - result.extraUsageSpent;
  }

  return result;
}
