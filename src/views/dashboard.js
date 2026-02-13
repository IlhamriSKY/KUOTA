import { layout, formatDateNow } from "./layout.js";
import { icon } from "./icons.js";
import { accountCard, usageBar, costBar, emptyState, resolveLoginMethod } from "./components.js";
import {
  getAllAccounts, getLatestUsage, getUsageDetails, PLAN_LIMITS, CLAUDE_CODE_BUDGETS,
} from "../db/sqlite.js";
import { getAutoRefreshMinutes } from "../index.js";

// Compute usage stats from accounts
function computeUsageStats(accounts) {
  let copilotUsed = 0, copilotLimit = 0, copilotSpend = 0, copilotCount = 0;
  let claudeCost = 0, claudeBudget = 0, claudeCount = 0;
  let webCount = 0, webAvgWeekly = 0;

  for (const acc of accounts) {
    const usage = getLatestUsage(acc.id);
    const hasPat = !!acc.pat_token;
    const isPaused = !!acc.is_paused;
    const isActive = !isPaused && hasPat;

    if (acc.account_type === "claude_code") {
      if (isActive) {
        const budget = acc.monthly_budget || CLAUDE_CODE_BUDGETS[acc.claude_plan] || 100;
        claudeCost += usage ? usage.gross_quantity : 0;
        claudeBudget += budget;
        claudeCount++;
      }
    } else if (acc.account_type === "claude_web") {
      if (isActive) {
        webCount++;
        webAvgWeekly += usage ? (usage.weekly_usage_pct || 0) : 0;
      }
    } else {
      if (isActive) {
        const limit = PLAN_LIMITS[acc.copilot_plan] || 300;
        copilotUsed += usage ? usage.gross_quantity : 0;
        copilotLimit += limit;
        copilotSpend += usage ? usage.net_amount : 0;
        copilotCount++;
      }
    }
  }

  const copilotPct = copilotLimit > 0 ? (copilotUsed / copilotLimit) * 100 : 0;
  const claudePct = claudeBudget > 0 ? (claudeCost / claudeBudget) * 100 : 0;
  const webAvg = webCount > 0 ? webAvgWeekly / webCount : 0;

  return { copilotUsed, copilotLimit, copilotSpend, copilotCount, copilotPct, claudeCost, claudeBudget, claudeCount, claudePct, webCount, webAvg };
}

// Render the usage bars section (inner content of Overall Usage)
export function renderUsageBars() {
  const accounts = getAllAccounts();
  const stats = computeUsageStats(accounts);
  const { copilotUsed, copilotLimit, copilotSpend, copilotCount, copilotPct, claudeCost, claudeBudget, claudeCount, claudePct, webCount, webAvg } = stats;

  // Build sub-label for account breakdown
  const parts = [];
  if (copilotCount > 0) parts.push(`${copilotCount} GitHub Copilot`);
  if (webCount > 0) parts.push(`${webCount} Claude Pro/Max`);
  if (claudeCount > 0) parts.push(`${claudeCount} Claude Code`);
  const breakdownLabel = parts.length > 1 ? ` · ${parts.join(" · ")}` : "";

  const activeCount = accounts.filter(a => !a.is_paused && !!a.pat_token).length;
  const totalCount = accounts.length;

  return `
    <p class="text-xs text-muted-foreground mt-0.5">${totalCount} account${totalCount > 1 ? "s" : ""} monitored${breakdownLabel}</p>

    ${copilotCount > 0 ? `
    <div class="space-y-1 mt-4">
      ${usageBar(copilotPct, "GitHub Copilot", "github")}
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mt-1">
        <span class="text-xs text-muted-foreground">
          <span class="font-semibold text-foreground tabular-nums">${Math.round(copilotUsed)}</span> / ${copilotLimit} total requests
        </span>
        <span class="text-xs ${copilotSpend > 0 ? "text-amber-500 font-medium tabular-nums" : "text-emerald-500"}">
          ${copilotSpend > 0 ? `$${copilotSpend.toFixed(2)} overage` : icon("check-circle", 12, "inline") + " No overage"}
        </span>
      </div>
    </div>
    ` : ""}

    ${copilotCount > 0 && claudeCount > 0 ? `<div class="border-t my-3"></div>` : ""}

    ${claudeCount > 0 ? `
    <div class="space-y-1">
      ${costBar(claudePct, claudeCost, claudeBudget, "Claude Code", "claude")}
    </div>
    ` : ""}

    ${(claudeCount > 0 || copilotCount > 0) && webCount > 0 ? `<div class="border-t my-3"></div>` : ""}

    ${webCount > 0 ? `
    <div class="space-y-1">
      <div class="flex items-center justify-between mb-1.5">
        <span class="text-xs font-medium ${webAvg > 80 ? "text-red-500" : webAvg > 50 ? "text-amber-500" : "text-blue-500"} flex items-center gap-1.5">
          ${icon("claude", 12, webAvg > 80 ? "text-red-500" : webAvg > 50 ? "text-amber-500" : "text-blue-500")}
          Claude Pro/Max
        </span>
        <span class="text-xs font-semibold tabular-nums ${webAvg > 80 ? "text-red-500" : webAvg > 50 ? "text-amber-500" : "text-blue-500"}">${Math.round(webAvg)}%</span>
      </div>
      <div class="w-full bg-secondary rounded-sm h-2 overflow-hidden">
        <div class="${webAvg > 80 ? "bg-red-500" : webAvg > 50 ? "bg-amber-500" : "bg-blue-500"} h-full rounded-sm progress-fill" style="width: ${Math.min(webAvg, 100)}%"></div>
      </div>
      <p class="text-xs text-muted-foreground mt-1">${webCount} account${webCount > 1 ? "s" : ""}</p>
    </div>
    ` : ""}
  `;
}

export function renderDashboard() {
  const accounts = getAllAccounts();

  if (accounts.length === 0) {
    return layout("Dashboard", emptyState());
  }

  let activeCount = 0;
  let pausedCount = 0;
  let inactiveCount = 0;
  const activeCards = [];
  const pausedCards = [];
  const inactiveCards = [];
  const loginMethodCounts = {};

  for (const acc of accounts) {
    const usage = getLatestUsage(acc.id);
    const details = usage ? getUsageDetails(usage.id) : [];

    const hasPat = !!acc.pat_token;
    const isFavorite = !!acc.is_favorite;
    const isPaused = !!acc.is_paused;

    if (isPaused) {
      pausedCount++;
    } else if (hasPat) {
      activeCount++;
    } else {
      inactiveCount++;
    }

    const lm = resolveLoginMethod(acc);
    loginMethodCounts[lm] = (loginMethodCounts[lm] || 0) + 1;

    const cardData = { card: accountCard({ ...acc, pat_token: hasPat }, usage, details), isFavorite };
    if (isPaused) {
      pausedCards.push(cardData);
    } else if (hasPat) {
      activeCards.push(cardData);
    } else {
      inactiveCards.push(cardData);
    }
  }

  // Sort cards: favorites first, then non-favorites
  const sortByFavorite = (a, b) => {
    if (a.isFavorite && !b.isFavorite) return -1;
    if (!a.isFavorite && b.isFavorite) return 1;
    return 0;
  };

  activeCards.sort(sortByFavorite);
  pausedCards.sort(sortByFavorite);
  inactiveCards.sort(sortByFavorite);

  // Extract the card HTML from cardData objects
  const activeCardHtml = activeCards.map(c => c.card);
  const pausedCardHtml = pausedCards.map(c => c.card);
  const inactiveCardHtml = inactiveCards.map(c => c.card);

  // Build login method filter badges
  const LOGIN_METHOD_META = {
    pat:       { label: "GitHub Copilot", iconName: "github",
                 cls: "bg-blue-500/15 text-blue-400 border-blue-500/40 hover:bg-blue-500/25 hover:border-blue-400/60",
                 badgeCls: "bg-blue-500/20 text-blue-300" },
    oauth:     { label: "GitHub OAuth",   iconName: "github",
                 cls: "bg-blue-500/15 text-blue-400 border-blue-500/40 hover:bg-blue-500/25 hover:border-blue-400/60",
                 badgeCls: "bg-blue-500/20 text-blue-300" },
    claude_cli:{ label: "Claude CLI",     iconName: "claude",
                 cls: "bg-[#D97757]/15 text-[#e8956f] border-[#D97757]/40 hover:bg-[#D97757]/25 hover:border-[#D97757]/60",
                 badgeCls: "bg-[#D97757]/20 text-[#f0a888]" },
    claude_api:{ label: "Claude API",     iconName: "claude",
                 cls: "bg-[#D97757]/15 text-[#e8956f] border-[#D97757]/40 hover:bg-[#D97757]/25 hover:border-[#D97757]/60",
                 badgeCls: "bg-[#D97757]/20 text-[#f0a888]" },
  };

  const filterBadgesHtml = Object.entries(loginMethodCounts)
    .map(([method, count]) => {
      const meta = LOGIN_METHOD_META[method] || { label: method, iconName: "user",
        cls: "bg-gray-500/15 text-gray-400 border-gray-500/40 hover:bg-gray-500/25 hover:border-gray-400/60",
        badgeCls: "bg-gray-500/20 text-gray-300" };
      return `<button type="button" onclick="filterByLogin('${method}')"
                class="login-filter-badge inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border transition-all cursor-pointer ${meta.cls}"
                data-method="${method}">
                ${icon(meta.iconName, 12)} ${meta.label}
                <span class="text-[10px] font-bold ${meta.badgeCls} px-1.5 py-px rounded">${count}</span>
              </button>`;
    }).join("\n");

  // Status filter badges
  const statusBadgesHtml = [
    activeCount > 0 ? `<button type="button" onclick="filterByStatus('active')"
      class="status-filter-badge inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border transition-all cursor-pointer bg-emerald-500/15 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/25 hover:border-emerald-400/60"
      data-status="active">
      ${icon("check-circle", 12)} Active
      <span class="text-[10px] font-bold bg-emerald-500/20 text-emerald-300 px-1.5 py-px rounded">${activeCount}</span>
    </button>` : "",
    pausedCount > 0 ? `<button type="button" onclick="filterByStatus('paused')"
      class="status-filter-badge inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border transition-all cursor-pointer bg-gray-500/15 text-gray-400 border-gray-500/40 hover:bg-gray-500/25 hover:border-gray-400/60"
      data-status="paused">
      ${icon("pause", 12)} Paused
      <span class="text-[10px] font-bold bg-gray-500/20 text-gray-300 px-1.5 py-px rounded">${pausedCount}</span>
    </button>` : "",
    inactiveCount > 0 ? `<button type="button" onclick="filterByStatus('inactive')"
      class="status-filter-badge inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border transition-all cursor-pointer bg-amber-500/15 text-amber-400 border-amber-500/40 hover:bg-amber-500/25 hover:border-amber-400/60"
      data-status="inactive">
      ${icon("alert-triangle", 12)} Inactive
      <span class="text-[10px] font-bold bg-amber-500/20 text-amber-300 px-1.5 py-px rounded">${inactiveCount}</span>
    </button>` : "",
  ].filter(Boolean).join("\n");

  const hasMultipleStatuses = [activeCount, pausedCount, inactiveCount].filter(c => c > 0).length > 1;
  const hasMultipleFilters = Object.keys(loginMethodCounts).length > 1 || hasMultipleStatuses;

  const filterSection = hasMultipleFilters ? `
      <!-- Filters -->
      <div class="flex items-center gap-2 flex-wrap" id="login-filters">
        <span class="text-xs text-muted-foreground font-medium mr-0.5">Filter:</span>
        ${filterBadgesHtml}
        ${(Object.keys(loginMethodCounts).length > 1 && hasMultipleStatuses) ? '<span class="text-muted-foreground/30 text-xs">|</span>' : ""}
        ${hasMultipleStatuses ? statusBadgesHtml : ""}
        <button type="button" onclick="resetAllFilters()"
                id="filter-reset-btn"
                class="hidden inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border border-red-500/40 text-red-400 bg-red-500/15 hover:bg-red-500/25 hover:border-red-400/60 transition-all cursor-pointer">
          ${icon("close", 12)} Reset
        </button>
      </div>` : "";

  const body = `
    <div class="space-y-5">
      <!-- Summary -->
      <div class="bg-card border rounded-md">
        <div class="p-4">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <h2 class="text-base font-semibold flex items-center gap-2">
              ${icon("bar-chart", 18, "text-primary")}
              Overall Usage
            </h2>
            <div class="flex items-center gap-2">
              <button onclick="toggleCensor()" id="censor-btn"
                      class="inline-flex items-center justify-center w-8 h-8 border rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground" data-tooltip="Toggle privacy" data-tooltip-pos="bottom" aria-label="Toggle privacy">
                <span class="censor-icon-visible">${icon("eye", 14)}</span>
                <span class="censor-icon-hidden hidden">${icon("eye-off", 14)}</span>
              </button>
              <button onclick="refreshAll(this)" id="refresh-all-btn"
                      class="refresh-btn inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-md hover:bg-accent transition-colors text-xs font-medium" aria-label="Refresh all accounts">
                <span class="spin-icon">${icon("spinner", 14, "animate-spin")}</span>
                <span class="normal-icon">${icon("refresh", 14)}</span>
                <span class="refresh-label">Refresh All</span>
              </button>
              <a href="/add" class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity text-xs font-medium" aria-label="Add a new account">
                ${icon("plus", 14)}
                Add Account
              </a>
            </div>
          </div>
          <div id="usage-summary">
            ${renderUsageBars()}
          </div>
        </div>
      </div>

      ${filterSection}

      <!-- Search -->
      <div class="relative">
        <input type="text" id="account-search" placeholder="Search accounts..."
               oninput="filterAccounts(this.value)"
               class="input-field w-full px-3 py-2 pl-9 bg-background border rounded-md text-sm text-foreground placeholder:text-muted-foreground">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
          ${icon("filter", 14)}
        </span>
      </div>

      <!-- Cards -->
      <div id="cards-grid">
        ${activeCardHtml.length > 0 ? `
          <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3 active-accounts-section">
            ${activeCardHtml.join("\n")}
          </div>
        ` : ""}

        ${activeCardHtml.length > 0 && (pausedCardHtml.length > 0 || inactiveCardHtml.length > 0) ? `
          <div class="relative my-8" id="accounts-divider">
            <div class="absolute inset-0 flex items-center">
              <div class="w-full border-t-2 border-dashed border-muted-foreground/20"></div>
            </div>
            <div class="relative flex justify-center">
              <span class="bg-background px-4 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                ${pausedCardHtml.length + inactiveCardHtml.length} Paused/Inactive Account${pausedCardHtml.length + inactiveCardHtml.length > 1 ? "s" : ""}
              </span>
            </div>
          </div>
        ` : ""}

        ${(pausedCardHtml.length > 0 || inactiveCardHtml.length > 0) ? `
          <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3 inactive-accounts-section">
            ${[...pausedCardHtml, ...inactiveCardHtml].join("\n")}
          </div>
        ` : ""}
      </div>

      <div id="no-results" class="hidden flex flex-col items-center justify-center text-center py-12">
        <div class="text-muted-foreground mb-3">${icon("circle-x", 48)}</div>
        <p class="text-sm text-muted-foreground">No accounts found.</p>
      </div>

      <!-- Footer note -->
      <p class="text-center text-[11px] text-muted-foreground flex items-center justify-center gap-1">
        ${icon("clock", 10)}
        Auto-refreshes every ${(() => { const m = getAutoRefreshMinutes(); return m >= 60 ? `${m / 60} hour${m / 60 !== 1 ? "s" : ""}` : `${m} minute${m !== 1 ? "s" : ""}`; })()} · ${formatDateNow()}
      </p>
    </div>`;

  return layout("Dashboard", body);
}
