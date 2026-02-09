const API = "https://api.github.com";
const HEADERS_BASE = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

function headers(token) {
  return { ...HEADERS_BASE, Authorization: `Bearer ${token}` };
}

// Get authenticated user info
export async function getUser(token) {
  const res = await fetch(`${API}/user`, { headers: headers(token) });
  if (!res.ok) throw new Error(`GitHub /user failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// Get premium request usage for a user (needs fine-grained PAT with Plan:read)
export async function getPremiumRequestUsage(token, username, year, month) {
  const url = `${API}/users/${username}/settings/billing/premium_request/usage?year=${year}&month=${month}`;
  const res = await fetch(url, { headers: headers(token) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Billing API failed: ${res.status} ${text}`);
  }
  return res.json();
}

// Get general billing usage
export async function getBillingUsage(token, username, year, month) {
  const url = `${API}/users/${username}/settings/billing/usage?year=${year}&month=${month}`;
  const res = await fetch(url, { headers: headers(token) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Billing usage API failed: ${res.status} ${text}`);
  }
  return res.json();
}

// Parse usage data into structured format
export function parseUsageData(data, planLimit) {
  const items = (data.usageItems || []).filter(
    (i) => i.product && i.product.toLowerCase() === "copilot"
  );

  let grossQuantity = 0;
  let includedQuantity = 0;
  let netAmount = 0;
  const models = [];

  for (const item of items) {
    const qty = item.grossQuantity || item.quantity || 0;
    const discount = item.discountAmount || 0;
    const ppu = item.pricePerUnit || 0.04;
    const net = item.netAmount || 0;
    const included = ppu > 0 ? discount / ppu : 0;

    grossQuantity += qty;
    includedQuantity += included;
    netAmount += net;

    if (item.model || item.sku) {
      models.push({
        model: item.model || item.sku || "Unknown",
        quantity: qty,
        price_per_unit: ppu,
        net_amount: net,
      });
    }
  }

  const percentage = planLimit > 0 ? (grossQuantity / planLimit) * 100 : 0;

  return {
    grossQuantity,
    includedQuantity,
    netAmount,
    percentage: Math.round(percentage * 10) / 10,
    models,
  };
}

// Get user's organizations
export async function getUserOrgs(token) {
  try {
    const res = await fetch(`${API}/user/orgs?per_page=100`, { headers: headers(token) });
    if (!res.ok) return [];
    const orgs = await res.json();
    return orgs.map((o) => o.login);
  } catch {
    return [];
  }
}

// Verify a PAT can access billing
export async function verifyPat(token, username) {
  const now = new Date();
  try {
    const data = await getBillingUsage(token, username, now.getFullYear(), now.getMonth() + 1);
    return { valid: true, data };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}
