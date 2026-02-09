// Anthropic Claude Code Analytics API
// Requires an Admin API Key (sk-ant-admin...) from Anthropic Console
// Docs: https://platform.claude.com/docs/en/build-with-claude/claude-code-analytics-api

const API = "https://api.anthropic.com";
const HEADERS_BASE = {
  "anthropic-version": "2023-06-01",
};

function headers(adminKey) {
  return { ...HEADERS_BASE, "x-api-key": adminKey };
}

// Fetch one day's Claude Code analytics (handles pagination)
async function fetchDayData(adminKey, dateStr) {
  const allData = [];
  let page = null;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams({ starting_at: dateStr, limit: "1000" });
    if (page) params.set("page", page);

    const res = await fetch(
      `${API}/v1/organizations/usage_report/claude_code?${params}`,
      { headers: headers(adminKey) }
    );

    if (!res.ok) {
      // Don't throw on individual day failures - just skip
      console.warn(`[Claude Code] API returned ${res.status} for ${dateStr}`);
      return [];
    }

    const data = await res.json();
    allData.push(...(data.data || []));
    hasMore = data.has_more || false;
    page = data.next_page || null;
  }

  return allData;
}

/**
 * Fetch Claude Code analytics for an entire month.
 * Makes parallel requests in batches to avoid rate limits.
 */
export async function getClaudeCodeMonthUsage(adminKey, year, month) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date();
  const maxDay =
    year === today.getFullYear() && month === today.getMonth() + 1
      ? today.getDate()
      : daysInMonth;

  const allData = [];
  const BATCH_SIZE = 5;

  for (let i = 1; i <= maxDay; i += BATCH_SIZE) {
    const batch = [];
    for (let j = i; j < i + BATCH_SIZE && j <= maxDay; j++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(j).padStart(2, "0")}`;
      batch.push(
        fetchDayData(adminKey, dateStr).catch((err) => {
          console.warn(`[Claude Code] Skip ${dateStr}: ${err.message}`);
          return [];
        })
      );
    }
    const results = await Promise.all(batch);
    allData.push(...results.flat());
  }

  return allData;
}

/**
 * Parse and aggregate daily Claude Code data into monthly summary.
 * Optionally filter by user email.
 */
export function parseClaudeCodeData(dailyData, userEmail = null) {
  let filtered = dailyData;
  if (userEmail) {
    filtered = dailyData.filter(
      (d) =>
        d.actor?.email_address?.toLowerCase() === userEmail.toLowerCase()
    );
  }

  let totalCostCents = 0;
  let totalSessions = 0;
  let totalLinesAdded = 0;
  let totalLinesRemoved = 0;
  let totalCommits = 0;
  let totalPRs = 0;
  const modelMap = new Map();

  for (const record of filtered) {
    totalSessions += record.core_metrics?.num_sessions || 0;
    totalLinesAdded += record.core_metrics?.lines_of_code?.added || 0;
    totalLinesRemoved += record.core_metrics?.lines_of_code?.removed || 0;
    totalCommits += record.core_metrics?.commits_by_claude_code || 0;
    totalPRs += record.core_metrics?.pull_requests_by_claude_code || 0;

    for (const mb of record.model_breakdown || []) {
      const costCents = mb.estimated_cost?.amount || 0;
      totalCostCents += costCents;

      const key = mb.model || "unknown";
      const existing = modelMap.get(key) || {
        model: key,
        estimated_cost_cents: 0,
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_creation_tokens: 0,
      };
      existing.estimated_cost_cents += costCents;
      existing.input_tokens += mb.tokens?.input || 0;
      existing.output_tokens += mb.tokens?.output || 0;
      existing.cache_read_tokens += mb.tokens?.cache_read || 0;
      existing.cache_creation_tokens += mb.tokens?.cache_creation || 0;
      modelMap.set(key, existing);
    }
  }

  return {
    totalCostCents,
    totalCostUSD: totalCostCents / 100,
    sessions: totalSessions,
    linesAdded: totalLinesAdded,
    linesRemoved: totalLinesRemoved,
    commits: totalCommits,
    pullRequests: totalPRs,
    models: Array.from(modelMap.values()),
    userCount: new Set(
      filtered.map((d) => d.actor?.email_address).filter(Boolean)
    ).size,
  };
}

/**
 * Verify an Admin API Key by making a minimal request.
 */
export async function verifyAdminKey(adminKey) {
  try {
    const today = new Date().toISOString().split("T")[0];
    const res = await fetch(
      `${API}/v1/organizations/usage_report/claude_code?starting_at=${today}&limit=1`,
      { headers: headers(adminKey) }
    );
    if (!res.ok) {
      const text = await res.text();
      return { valid: false, error: `${res.status}: ${text}` };
    }
    return { valid: true };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}
