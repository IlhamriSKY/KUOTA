import { layout, formatDateNow } from "./layout.js";
import { icon } from "./icons.js";
import { accountCard, usageBar, costBar, emptyState, resolveLoginMethod } from "./components.js";
import {
  getAllAccounts, getLatestUsage, getUsageDetails, PLAN_LIMITS, CLAUDE_CODE_BUDGETS,
} from "../db/sqlite.js";
import { getAutoRefreshMinutes } from "../index.js";

export function renderDashboard() {
  const accounts = getAllAccounts();

  if (accounts.length === 0) {
    return layout("Dashboard", emptyState());
  }

  // Separate metrics for Copilot vs Claude Code vs Claude Web
  let copilotUsed = 0;
  let copilotLimit = 0;
  let copilotSpend = 0;
  let copilotCount = 0;
  let claudeCost = 0;
  let claudeBudget = 0;
  let claudeCount = 0;
  let webCount = 0;
  let webAvgWeekly = 0;
  let activeCount = 0;
  let pausedCount = 0;
  let inactiveCount = 0;
  const cards = [];
  const loginMethodCounts = {};

  for (const acc of accounts) {
    const usage = getLatestUsage(acc.id);
    const details = usage ? getUsageDetails(usage.id) : [];

    // Track status counts
    const hasPat = !!acc.pat_token;
    if (acc.is_paused) {
      pausedCount++;
    } else if (hasPat) {
      activeCount++;
    } else {
      inactiveCount++;
    }

    // Only include active accounts in Overall Usage
    const isActive = !acc.is_paused && hasPat;

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

    const lm = resolveLoginMethod(acc);
    loginMethodCounts[lm] = (loginMethodCounts[lm] || 0) + 1;

    cards.push(accountCard({ ...acc, pat_token: hasPat }, usage, details));
  }

  const copilotPct = copilotLimit > 0 ? (copilotUsed / copilotLimit) * 100 : 0;
  const claudePct = claudeBudget > 0 ? (claudeCost / claudeBudget) * 100 : 0;
  const webAvg = webCount > 0 ? webAvgWeekly / webCount : 0;

  // Build sub-label for account breakdown
  const parts = [];
  if (copilotCount > 0) parts.push(`${copilotCount} GitHub Copilot`);
  if (webCount > 0) parts.push(`${webCount} Claude Pro/Max`);
  if (claudeCount > 0) parts.push(`${claudeCount} Claude Code`);
  const breakdownLabel = parts.length > 1 ? ` · ${parts.join(" · ")}` : "";

  // Build login method filter badges
  const LOGIN_METHOD_META = {
    pat:       { label: "GitHub Copilot", iconName: "github",
                 cls: "bg-blue-500/5 text-blue-500 border-blue-500/20 hover:bg-blue-500/15 hover:border-blue-500/40",
                 countCls: "bg-blue-500/10" },
    oauth:     { label: "GitHub OAuth",   iconName: "github",
                 cls: "bg-blue-500/5 text-blue-500 border-blue-500/20 hover:bg-blue-500/15 hover:border-blue-500/40",
                 countCls: "bg-blue-500/10" },
    claude_cli:{ label: "Claude CLI",     iconName: "claude",
                 cls: "bg-[#D97757]/5 text-[#D97757] border-[#D97757]/20 hover:bg-[#D97757]/15 hover:border-[#D97757]/40",
                 countCls: "bg-[#D97757]/10" },
    claude_api:{ label: "Claude API",     iconName: "claude",
                 cls: "bg-[#D97757]/5 text-[#D97757] border-[#D97757]/20 hover:bg-[#D97757]/15 hover:border-[#D97757]/40",
                 countCls: "bg-[#D97757]/10" },
  };

  const filterBadgesHtml = Object.entries(loginMethodCounts)
    .map(([method, count]) => {
      const meta = LOGIN_METHOD_META[method] || { label: method, iconName: "user",
        cls: "bg-gray-500/5 text-gray-500 border-gray-500/20 hover:bg-gray-500/15 hover:border-gray-500/40",
        countCls: "bg-gray-500/10" };
      return `<button type="button" onclick="filterByLogin('${method}')"
                class="login-filter-badge inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border transition-all cursor-pointer ${meta.cls}"
                data-method="${method}">
                ${icon(meta.iconName, 12, "inline")} ${meta.label}
                <span class="ml-0.5 text-[10px] font-semibold ${meta.countCls} px-1.5 rounded-full">${count}</span>
              </button>`;
    }).join("\n");

  // Status filter badges
  const statusBadgesHtml = [
    activeCount > 0 ? `<button type="button" onclick="filterByStatus('active')"
      class="status-filter-badge inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border transition-all cursor-pointer bg-emerald-500/5 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/15 hover:border-emerald-500/40"
      data-status="active">
      ${icon("check-circle", 12, "inline")} Active
      <span class="ml-0.5 text-[10px] font-semibold bg-emerald-500/10 px-1.5 rounded-full">${activeCount}</span>
    </button>` : "",
    pausedCount > 0 ? `<button type="button" onclick="filterByStatus('paused')"
      class="status-filter-badge inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border transition-all cursor-pointer bg-secondary text-muted-foreground border-border hover:bg-accent hover:border-muted-foreground/40"
      data-status="paused">
      ${icon("pause", 12, "inline")} Paused
      <span class="ml-0.5 text-[10px] font-semibold bg-muted px-1.5 rounded-full">${pausedCount}</span>
    </button>` : "",
    inactiveCount > 0 ? `<button type="button" onclick="filterByStatus('inactive')"
      class="status-filter-badge inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border transition-all cursor-pointer bg-amber-500/5 text-amber-500 border-amber-500/20 hover:bg-amber-500/15 hover:border-amber-500/40"
      data-status="inactive">
      ${icon("alert-triangle", 12, "inline")} Inactive
      <span class="ml-0.5 text-[10px] font-semibold bg-amber-500/10 px-1.5 rounded-full">${inactiveCount}</span>
    </button>` : "",
  ].filter(Boolean).join("\n");

  const hasMultipleStatuses = [activeCount, pausedCount, inactiveCount].filter(c => c > 0).length > 1;
  const hasMultipleFilters = Object.keys(loginMethodCounts).length > 1 || hasMultipleStatuses;

  const filterSection = hasMultipleFilters ? `
      <!-- Filters -->
      <div class="flex items-center gap-2 flex-wrap" id="login-filters">
        <span class="text-xs text-muted-foreground font-medium mr-0.5">${icon("filter", 12, "inline")} Filter:</span>
        ${filterBadgesHtml}
        ${(Object.keys(loginMethodCounts).length > 1 && hasMultipleStatuses) ? '<span class="text-muted-foreground/30 text-xs">|</span>' : ""}
        ${hasMultipleStatuses ? statusBadgesHtml : ""}
        <button type="button" onclick="resetAllFilters()"
                id="filter-reset-btn"
                class="hidden inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-all cursor-pointer">
          ${icon("close", 12)} Reset
        </button>
      </div>` : "";

  const body = `
    <div class="space-y-5">
      <!-- Summary -->
      <div class="bg-card border rounded-md">
        <div class="p-4">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <h2 class="text-base font-semibold flex items-center gap-2">
                ${icon("bar-chart", 18, "text-primary")}
                Overall Usage
              </h2>
              <p class="text-xs text-muted-foreground mt-0.5">${accounts.length} account${accounts.length > 1 ? "s" : ""} monitored${breakdownLabel}</p>
            </div>
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

          ${copilotCount > 0 ? `
          <div class="space-y-1">
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
      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3" id="cards-grid">
        ${cards.join("\n")}
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
