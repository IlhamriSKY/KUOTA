// GitHub OAuth Device Flow implementation
// Requires a GitHub OAuth App with Device Flow enabled
// Set GITHUB_OAUTH_CLIENT_ID in .env

import { getSetting } from "../db/sqlite.js";

const DEVICE_CODE_URL = "https://github.com/login/device/code";
const ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";

export function getClientId() {
  return process.env.GITHUB_OAUTH_CLIENT_ID || getSetting("github_oauth_client_id") || "";
}

// Step 1: Request device & user codes
export async function requestDeviceCode(clientId) {
  const res = await fetch(DEVICE_CODE_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      scope: "read:user user",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Device code request failed: ${res.status} ${text}`);
  }

  return res.json();
  // Returns: { device_code, user_code, verification_uri, expires_in, interval }
}

// Step 2: Poll for access token
export async function pollForToken(clientId, deviceCode) {
  const res = await fetch(ACCESS_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      device_code: deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    }),
  });

  if (!res.ok) {
    return { error: "request_failed" };
  }

  return res.json();
  // Success: { access_token, token_type, scope }
  // Pending: { error: "authorization_pending" }
  // Slow down: { error: "slow_down", interval }
  // Expired: { error: "expired_token" }
  // Denied: { error: "access_denied" }
}

// In-memory store for active device flows
const activeFlows = new Map();
const FLOW_TTL = 15 * 60 * 1000; // 15 minutes

function cleanupExpiredFlows() {
  const now = Date.now();
  for (const [id, flow] of activeFlows) {
    if (now - flow.startedAt > FLOW_TTL) activeFlows.delete(id);
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupExpiredFlows, 5 * 60 * 1000);

export function startFlow(id, data) {
  cleanupExpiredFlows();
  activeFlows.set(id, { ...data, status: "pending", startedAt: Date.now() });
}

export function getFlow(id) {
  return activeFlows.get(id);
}

export function completeFlow(id, token) {
  const flow = activeFlows.get(id);
  if (flow) {
    flow.status = "complete";
    flow.access_token = token;
  }
}

export function failFlow(id, error) {
  const flow = activeFlows.get(id);
  if (flow) {
    flow.status = "error";
    flow.error = error;
  }
}

export function removeFlow(id) {
  activeFlows.delete(id);
}
