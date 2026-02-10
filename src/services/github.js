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

// Get org premium request usage (needs fine-grained PAT with org Administration:read)
export async function getOrgPremiumRequestUsage(token, org, year, month, username = null) {
  let url = `${API}/organizations/${org}/settings/billing/premium_request/usage?year=${year}&month=${month}`;
  if (username) url += `&user=${username}`;
  const res = await fetch(url, { headers: headers(token) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Org billing API failed for ${org}: ${res.status} ${text}`);
  }
  return res.json();
}

// Get org general billing usage
export async function getOrgBillingUsage(token, org, year, month) {
  const url = `${API}/organizations/${org}/settings/billing/usage?year=${year}&month=${month}`;
  const res = await fetch(url, { headers: headers(token) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Org billing usage API failed for ${org}: ${res.status} ${text}`);
  }
  return res.json();
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

// Detect the user's actual Copilot plan via API
// Returns: { plan: "free"|"pro"|"pro_plus"|"business"|"enterprise"|null, source: "org"|"user"|"none", org?: string }
export async function detectCopilotPlan(token, username, orgs = []) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // 1. Try org-level: check user's seat in each org
  for (const org of orgs) {
    try {
      const res = await fetch(`${API}/orgs/${org}/members/${username}/copilot`, { headers: headers(token) });
      if (res.ok) {
        const data = await res.json();
        if (data.plan_type) {
          return { plan: data.plan_type, source: "org", org };
        }
      }
    } catch {}

    // Fallback: check org copilot billing info
    try {
      const res = await fetch(`${API}/orgs/${org}/copilot/billing`, { headers: headers(token) });
      if (res.ok) {
        const data = await res.json();
        if (data.plan_type) {
          return { plan: data.plan_type, source: "org", org };
        }
      }
    } catch {}
  }

  // 2. Try user-level billing to detect personal plans
  try {
    const res = await fetch(
      `${API}/users/${username}/settings/billing/premium_request/usage?year=${year}&month=${month}`,
      { headers: headers(token) }
    );
    if (res.ok) {
      const data = await res.json();
      const items = (data.usageItems || []).filter(i => i.product?.toLowerCase() === "copilot");

      if (items.length > 0) {
        let totalQty = 0;
        for (const item of items) totalQty += item.grossQuantity || item.quantity || 0;
        // If usage exceeds Pro limit (300), likely Pro+
        return { plan: totalQty > 300 ? "pro_plus" : "pro", source: "user" };
      }

      // API returned 200 but no copilot items, check general billing
      const genRes = await fetch(
        `${API}/users/${username}/settings/billing/usage?year=${year}&month=${month}`,
        { headers: headers(token) }
      );
      if (genRes.ok) {
        const genData = await genRes.json();
        const copilotItems = (genData.usageItems || []).filter(i => i.product?.toLowerCase() === "copilot");
        if (copilotItems.length > 0) {
          let totalQty = 0;
          for (const item of copilotItems) totalQty += item.grossQuantity || item.quantity || 0;
          return { plan: totalQty > 300 ? "pro_plus" : "pro", source: "user" };
        }
        // General billing accessible with 0 copilot items:
        // User has billing access (= paying user) but no copilot usage yet this month.
        // Check if ANY usageItems exist at all - if yes, user has a paid plan.
        const allItems = genData.usageItems || [];
        if (allItems.length > 0) {
          // Has other billing items (Actions, Packages, etc.) - likely Pro user with 0 copilot usage this month
          return { plan: "pro", source: "user" };
        }
      }

      // Billing API accessible but truly empty - could be Free tier or beginning of month with Pro
      // Return null to avoid falsely labeling Pro users as Free
      return { plan: null, source: "none" };
    }

    // Non-200 status: no billing access
    return { plan: null, source: "none" };
  } catch {
    return { plan: null, source: "none" };
  }
}

// Verify a PAT can access billing (user-level or org-level)
export async function verifyPat(token, username) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // Try user-level billing first
  try {
    const data = await getBillingUsage(token, username, year, month);
    return { valid: true, data, source: "user" };
  } catch (userErr) {
    // User billing failed — try org-level endpoints
    try {
      const orgs = await getUserOrgs(token);
      for (const org of orgs) {
        try {
          const data = await getOrgPremiumRequestUsage(token, org, year, month, username);
          return { valid: true, data, source: "org", org };
        } catch {
          // Try general org billing
          try {
            const data = await getOrgBillingUsage(token, org, year, month);
            return { valid: true, data, source: "org", org };
          } catch {
            continue;
          }
        }
      }
    } catch {}

    return { valid: false, error: userErr.message };
  }
}
