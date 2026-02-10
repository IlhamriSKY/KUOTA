import { icon } from "./icons.js";
import { formatDate, formatRelativeTime } from "./layout.js";
import { escapeHtml, formatNumber } from "../utils.js";
import { PLAN_LIMITS, CLAUDE_CODE_BUDGETS } from "../db/sqlite.js";


//  Reset date helpers

function toDateString(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getNextMonthFirstDay() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return toDateString(next);
}

function getResetDateForAccount(account) {
  // If manually set, check if it's in the past — auto-advance to next occurrence
  if (account.reset_date) {
    const resetD = new Date(account.reset_date + "T00:00:00");
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    if (resetD < now) {
      // Advance: keep the same day-of-month, move to next future month
      const day = resetD.getDate();
      let month = now.getMonth();
      let year = now.getFullYear();
      // If today's date is past the reset day, go to next month
      if (now.getDate() >= day) {
        month++;
        if (month > 11) { month = 0; year++; }
      }
      const advanced = new Date(year, month, Math.min(day, new Date(year, month + 1, 0).getDate()));
      return toDateString(advanced);
    }
    return account.reset_date;
  }
  // Personal accounts (free/pro/pro_plus without billing_org) reset on 1st of next month
  const isPersonal = !account.billing_org && ["free", "pro", "pro_plus"].includes(account.copilot_plan);
  if (isPersonal) return getNextMonthFirstDay();
  // Org accounts — no default, must be set manually
  return "";
}

function resetCountdownSection(account) {
  const resetDate = getResetDateForAccount(account);
  if (!resetDate) return "";

  const reset = new Date(resetDate + "T00:00:00");
  const now = new Date();
  const diffMs = reset.getTime() - now.getTime();
  const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  const dd = String(reset.getDate()).padStart(2, "0");
  const mm = String(reset.getMonth() + 1).padStart(2, "0");
  const yyyy = reset.getFullYear();
  const formattedDate = `${dd}-${mm}-${yyyy}`;

  let countdownText = "";
  let countdownColor = "text-muted-foreground";
  if (daysLeft <= 0) {
    countdownText = "Resetting today";
    countdownColor = "text-emerald-500";
  } else if (daysLeft === 1) {
    countdownText = "1 day left";
    countdownColor = "text-amber-500";
  } else if (daysLeft <= 3) {
    countdownText = `${daysLeft} days left`;
    countdownColor = "text-amber-500";
  } else {
    countdownText = `${daysLeft} days left`;
  }

  const isAutoReset = !account.reset_date && !account.billing_org;

  return `<div class="flex items-center justify-between text-[11px] mb-0.5">
      <span class="${countdownColor} flex items-center gap-1" data-tooltip="Resets on ${formattedDate}${isAutoReset ? ' (auto — 1st of month)' : ''}">
        ${icon("calendar", 11)}
        <span class="font-medium tabular-nums">${countdownText}</span>
      </span>
      <span class="text-muted-foreground tabular-nums">${formattedDate}</span>
    </div>`;
}

export { getNextMonthFirstDay };


//  Plan config

const PLAN_LABELS = {
  free: "Free", pro: "Pro", pro_plus: "Pro+", business: "Business", enterprise: "Enterprise",
};


//  Usage Bar

export function usageBar(percentage, label = "Premium requests", iconName = "zap") {
  let barColor = "bg-emerald-500";
  let textCls = "text-emerald-500";
  if (percentage > 80) {
    barColor = "bg-red-500";
    textCls = "text-red-500";
  } else if (percentage > 50) {
    barColor = "bg-amber-500";
    textCls = "text-amber-500";
  }
  const width = Math.min(percentage, 100);

  return `
    <div class="w-full">
      <div class="flex items-center justify-between mb-1.5">
        <span class="text-xs font-medium ${textCls} flex items-center gap-1.5">
          ${icon(iconName, 12, textCls)}
          ${label}
        </span>
        <span class="text-xs font-semibold tabular-nums ${textCls}">${percentage.toFixed(1)}%</span>
      </div>
      <div class="w-full bg-secondary rounded-sm h-2 overflow-hidden">
        <div class="${barColor} h-full rounded-sm progress-fill" style="width: ${width}%"></div>
      </div>
    </div>`;
}


//  Plan Badge

export function planBadge(plan, accountType = "copilot") {
  if (accountType === "claude_code" || accountType === "claude_web") {
    const colors = {
      api: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
      pro: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
      max: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
      team: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      enterprise: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    };
    const labels = { api: "Claude API", pro: "Claude Pro", max: "Claude Max", team: "Claude Team", enterprise: "Claude Enterprise" };
    return `<span class="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold rounded ${colors[plan] || colors.pro}">${labels[plan] || plan}</span>`;
  }
  const colors = {
    free: "bg-secondary text-secondary-foreground",
    pro: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    pro_plus: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
    business: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    enterprise: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  };
  return `<span class="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold rounded ${colors[plan] || colors.pro}">${PLAN_LABELS[plan] || plan}</span>`;
}


//  Resolve effective login method string

export function resolveLoginMethod(account) {
  const method = account.login_method || "";
  if (method) return method;
  const type = account.account_type || "copilot";
  if (type === "claude_web") return "claude_cli";
  if (type === "claude_code") return "claude_api";
  return "pat";
}


//  Login Method Badge

function loginMethodBadge(account) {
  const method = account.login_method || "";
  const type = account.account_type || "copilot";

  // Determine label, icon, and colors based on login method
  if (method === "oauth") {
    return `<span class="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 font-medium">${icon("github", 10, "inline")} GitHub OAuth</span>`;
  }
  if (method === "pat") {
    return `<span class="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 font-medium">${icon("github", 10, "inline")} GitHub Copilot</span>`;
  }
  if (method === "claude_cli") {
    return `<span class="text-[10px] px-1.5 py-0.5 rounded bg-[#D97757]/10 text-[#D97757] font-medium">${icon("claude", 10, "inline")} Claude CLI</span>`;
  }
  if (method === "claude_api") {
    return `<span class="text-[10px] px-1.5 py-0.5 rounded bg-[#D97757]/10 text-[#D97757] font-medium">${icon("claude", 10, "inline")} Claude API</span>`;
  }

  // Fallback based on account type for existing accounts without login_method
  if (type === "claude_web") {
    return `<span class="text-[10px] px-1.5 py-0.5 rounded bg-[#D97757]/10 text-[#D97757] font-medium">${icon("claude", 10, "inline")} Claude CLI</span>`;
  }
  if (type === "claude_code") {
    return `<span class="text-[10px] px-1.5 py-0.5 rounded bg-[#D97757]/10 text-[#D97757] font-medium">${icon("claude", 10, "inline")} Claude API</span>`;
  }
  return `<span class="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 font-medium">${icon("github", 10, "inline")} GitHub Copilot</span>`;
}


//  Account Card (dispatches to Copilot or Claude Code)

export function accountCard(account, usage, details = [], error = null) {
  if (account.account_type === "claude_code") {
    return claudeCodeAccountCard(account, usage, details, error);
  }
  if (account.account_type === "claude_web") {
    return claudeWebAccountCard(account, usage, details, error);
  }
  return copilotAccountCard(account, usage, details, error);
}

function errorBanner(error) {
  if (!error) return "";
  return `<div class="mx-4 mt-3 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/20 text-red-500 text-[11px] flex items-start gap-2">
    ${icon("alert-circle", 12, "flex-shrink-0 mt-0.5")}
    <span>Refresh failed: ${escapeHtml(error)}</span>
  </div>`;
}

function noteSection(note) {
  if (!note) return "";
  return `<div class="mx-4 mb-3 px-3 py-2 rounded-md bg-muted/50 border border-border/50">
    <p class="text-[11px] text-muted-foreground break-words whitespace-pre-wrap leading-relaxed">${escapeHtml(note)}</p>
  </div>`;
}


//  Copilot Activity Section (last editor session)

function parseEditorString(editorStr) {
  if (!editorStr) return null;
  // Format: "vscode/1.95.0/copilot/1.86.82" or "jetbrains/2024.1" or "cli/1.0"
  const lower = editorStr.toLowerCase();
  if (lower.includes("vscode") || lower.includes("vs code")) {
    return { name: "VS Code", icon: "code", color: "text-blue-500" };
  }
  if (lower.includes("jetbrains") || lower.includes("intellij") || lower.includes("pycharm") || lower.includes("webstorm") || lower.includes("rider") || lower.includes("goland") || lower.includes("phpstorm")) {
    return { name: "JetBrains", icon: "code", color: "text-orange-500" };
  }
  if (lower.includes("neovim") || lower.includes("nvim")) {
    return { name: "Neovim", icon: "terminal", color: "text-emerald-500" };
  }
  if (lower.includes("vim")) {
    return { name: "Vim", icon: "terminal", color: "text-emerald-500" };
  }
  if (lower.includes("cli") || lower.includes("copilot-cli") || lower.includes("copilot in the cli")) {
    return { name: "CLI", icon: "terminal", color: "text-purple-500" };
  }
  if (lower.includes("xcode")) {
    return { name: "Xcode", icon: "code", color: "text-blue-400" };
  }
  if (lower.includes("visual studio") && !lower.includes("code")) {
    return { name: "Visual Studio", icon: "code", color: "text-purple-400" };
  }
  if (lower.includes("eclipse")) {
    return { name: "Eclipse", icon: "code", color: "text-amber-500" };
  }
  // Generic fallback
  const firstPart = editorStr.split("/")[0];
  return { name: firstPart || "Unknown", icon: "monitor", color: "text-muted-foreground" };
}

function copilotActivitySection(account) {
  if (!account.last_activity_at && !account.last_activity_editor) return "";

  const editor = parseEditorString(account.last_activity_editor);
  const relTime = account.last_activity_at ? formatRelativeTime(account.last_activity_at) : "";
  const absTime = account.last_activity_at ? formatDate(account.last_activity_at) : "";
  const editorRaw = account.last_activity_editor || "";

  // Determine if recently active (within 15 minutes)
  let isRecentlyActive = false;
  if (account.last_activity_at) {
    const diff = Date.now() - new Date(account.last_activity_at).getTime();
    isRecentlyActive = diff < 15 * 60 * 1000;
  }

  const dotColor = isRecentlyActive ? "bg-emerald-500" : "bg-muted-foreground/50";
  const dotPulse = isRecentlyActive ? "animate-pulse" : "";

  return `<div class="mx-4 mb-3 px-3 py-2 rounded-md bg-muted/30 border border-border/50">
    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-2 min-w-0">
        <span class="relative flex h-2 w-2 flex-shrink-0">
          ${isRecentlyActive ? `<span class="absolute inline-flex h-full w-full rounded-full ${dotColor} opacity-75 ${dotPulse}"></span>` : ""}
          <span class="relative inline-flex rounded-full h-2 w-2 ${dotColor}"></span>
        </span>
        ${editor ? `<span class="${editor.color} flex-shrink-0">${icon(editor.icon, 12)}</span>` : ""}
        <span class="text-[11px] font-medium ${isRecentlyActive ? "text-foreground" : "text-muted-foreground"} truncate" ${editorRaw ? `data-tooltip="${escapeHtml(editorRaw)}"` : ""}>
          ${editor ? escapeHtml(editor.name) : "Unknown editor"}
        </span>
      </div>
      <span class="text-[10px] text-muted-foreground flex-shrink-0 tabular-nums" ${absTime ? `data-tooltip="${escapeHtml(absTime)}"` : ""}>
        ${relTime || "—"}
      </span>
    </div>
  </div>`;
}


//  Copilot Account Card

function copilotAccountCard(account, usage, details = [], error = null) {
  const limit = PLAN_LIMITS[account.copilot_plan] || 300;
  const pct = usage ? usage.percentage : 0;
  const used = usage ? usage.gross_quantity : 0;
  const spend = usage ? usage.net_amount : 0;
  const fetchedAt = usage ? formatDate(usage.fetched_at) : "Never";
  const isFav = !!account.is_favorite;
  const orgs = account.github_orgs ? account.github_orgs.split(",").filter(Boolean) : [];

  return `
     <div class="bg-card border ${account.is_paused ? "border-red-500/50" : ""} rounded-md fade-in flex flex-col account-card relative ${isFav ? "ring-1 ring-amber-400" : ""}" id="account-${account.id}"
         data-username="${escapeHtml(account.github_username)}"
         data-displayname="${escapeHtml(account.display_name || "")}"
         data-favorite="${isFav ? "1" : "0"}"
         data-paused="${account.is_paused ? "1" : "0"}"
         data-status="${account.is_paused ? "paused" : account.pat_token ? "active" : "inactive"}"
         data-loginmethod="${resolveLoginMethod(account)}">
      <div class="p-4 pb-0">
        <div class="flex items-start justify-between gap-2">
          <a href="https://github.com/${escapeHtml(account.github_username)}" target="_blank" rel="noopener noreferrer" class="flex items-center gap-2.5 min-w-0 group">
            <img src="${escapeHtml(account.avatar_url || `https://github.com/${account.github_username}.png?size=80`)}"
                 alt="${escapeHtml(account.github_username)}"
                 class="w-9 h-9 rounded-full border flex-shrink-0 censor-target group-hover:ring-2 ring-primary/50 transition-all"
                 onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><path d=%22M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2%22/><circle cx=%2212%22 cy=%227%22 r=%224%22/></svg>'">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5 flex-wrap">
                <h3 class="text-sm font-semibold text-foreground truncate censor-target group-hover:text-primary transition-colors">${escapeHtml(account.display_name || account.github_username)}</h3>
                ${planBadge(account.copilot_plan)}
              </div>
              <p class="text-xs text-muted-foreground censor-target truncate">@${escapeHtml(account.github_username)}</p>
              ${account.github_email ? `<p class="text-[11px] text-muted-foreground censor-target truncate mt-0.5 flex items-center gap-1"><span class="truncate">${escapeHtml(account.github_email)}</span></p>` : ""}
            </div>
          </a>
          <div class="flex items-center flex-shrink-0 -mr-1 gap-0.5">
            <button hx-post="/api/account/${account.id}/favorite" hx-target="#account-${account.id}" hx-swap="outerHTML"
                    class="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-accent transition-colors ${isFav ? "text-amber-400" : "text-muted-foreground hover:text-amber-400"}" data-tooltip="${isFav ? "Unpin" : "Pin to top"}" aria-label="${isFav ? "Unpin" : "Pin to top"}">
              ${isFav ? icon("star-filled", 14) : icon("star", 14)}
            </button>
            <button hx-post="/api/refresh/${account.id}" hx-target="#account-${account.id}" hx-swap="outerHTML"
                    class="refresh-btn inline-flex items-center justify-center w-7 h-7 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground" data-tooltip="Refresh" aria-label="Refresh">
              <span class="spin-icon">${icon("spinner", 14, "animate-spin")}</span>
              <span class="normal-icon">${icon("refresh", 14)}</span>
            </button>
            <button onclick="copyToken(${account.id})"
                    class="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground" data-tooltip="Copy token" aria-label="Copy token">
              ${icon("copy", 14)}
            </button>
            <div class="relative account-menu">
              <button onclick="toggleAccountMenu(${account.id})"
                      class="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground" data-tooltip="More actions" aria-label="More actions">
                ${icon("more-vertical", 14)}
              </button>
              <div id="menu-${account.id}" class="account-menu-dropdown hidden absolute right-0 mt-1 w-40 bg-popover border rounded-md shadow-lg z-50">
                <button hx-post="/api/account/${account.id}/pause" hx-target="#account-${account.id}" hx-swap="outerHTML"
                        class="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-accent transition-colors ${account.is_paused ? "text-emerald-500" : "text-foreground"}">
                  ${account.is_paused ? icon("play", 12) : icon("pause", 12)}
                  ${account.is_paused ? "Resume" : "Pause"}
                </button>
                <button hx-get="/api/account/${account.id}/edit" hx-target="#account-${account.id}" hx-swap="outerHTML"
                        class="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-accent transition-colors text-foreground">
                  ${icon("edit", 12)}
                  Edit
                </button>
                <div class="border-t my-1"></div>
                <button onclick="openDeleteModal('${escapeHtml(account.github_username)}', ${account.id})"
                        class="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-red-400/10 transition-colors text-red-400">
                  ${icon("trash", 12)}
                  Remove
                </button>
              </div>
            </div>
          </div>
        </div>
        ${orgs.length > 0 ? `<div class="flex items-center gap-1.5 mt-2 flex-wrap censor-target">${orgs.map(o => {
          const isBillingOrg = account.billing_org === o;
          return `<a href="https://github.com/${escapeHtml(o)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${isBillingOrg ? "bg-primary/15 text-primary ring-1 ring-primary/30" : "bg-secondary text-muted-foreground"} font-medium hover:bg-accent hover:text-foreground transition-colors" ${isBillingOrg ? 'data-tooltip="Billing source"' : ""}>${icon(isBillingOrg ? "zap" : "building", 9)} ${escapeHtml(o)}</a>`;
        }).join("")}</div>` : ""}
      </div>
      ${errorBanner(error)}
      
      <div class="p-4 space-y-2.5 flex-1">
        ${resetCountdownSection(account)}
        ${usageBar(pct, `${PLAN_LABELS[account.copilot_plan] || account.copilot_plan} requests`)}
        
        <div class="flex items-center justify-between text-xs">
          <span class="text-muted-foreground">
            <span class="font-semibold text-foreground tabular-nums">${Math.round(used)}</span> / ${limit} used
          </span>
          ${spend > 0 ? `<span class="text-amber-500 font-medium tabular-nums">$${spend.toFixed(2)} overage</span>` : ""}
        </div>

        ${details.length > 0 ? modelTable(details) : ""}
      </div>

      ${copilotActivitySection(account)}
      ${noteSection(account.note)}
      <div class="px-4 py-2.5 border-t flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between bg-muted/30 rounded-b-md mt-auto">
        <span class="text-[11px] text-muted-foreground flex items-center gap-1" data-tooltip="Last fetched">
          ${icon("clock", 10)}
          ${fetchedAt}
        </span>
        <div class="flex items-center gap-2 flex-wrap">
          ${loginMethodBadge(account)}
          <span class="text-[11px] flex items-center gap-1 ${account.is_paused ? "text-amber-500" : account.pat_token ? "text-emerald-500" : "text-amber-500"}" data-tooltip="${account.is_paused ? "Auto-refresh paused" : account.pat_token ? "Token is valid" : "No token configured"}">
            ${account.is_paused ? icon("pause", 10) + " Paused" : account.pat_token ? icon("check-circle", 10) + " Active" : icon("alert-triangle", 10) + " No token"}
          </span>
        </div>
      </div>
    </div>`;
}


//  Claude Web (Pro/Max) Account Card

function claudeWebAccountCard(account, usage, details = [], error = null) {
  const fetchedAt = usage ? formatDate(usage.fetched_at) : "Never";
  const isFav = !!account.is_favorite;
  
  const sessionPct = usage ? (usage.session_usage_pct || 0) : 0;
  const weeklyPct = usage ? (usage.weekly_usage_pct || 0) : 0;
  const weeklyReset = usage ? (usage.weekly_reset_at || "") : "";
  
  const extraEnabled = usage ? (usage.extra_usage_enabled || 0) : 0;
  const extraSpent = usage ? (usage.extra_usage_spent || 0) : 0;
  const extraLimit = usage ? (usage.extra_usage_limit || 0) : 0;
  const extraBalance = usage ? (usage.extra_usage_balance || 0) : 0;
  const extraReset = usage ? (usage.extra_usage_reset_at || "") : "";
  const extraPct = extraLimit > 0 ? (extraSpent / extraLimit) * 100 : 0;

  const planLabelMap = { api: "Claude API", pro: "Claude Pro", max: "Claude Max", team: "Claude Team", enterprise: "Claude Enterprise" };
  const planLabel = planLabelMap[account.claude_plan] || ("Claude " + (account.claude_plan || "pro").replace("_", " "));

  // Weekly bar color
  let weeklyColor = "bg-blue-500";
  let weeklyTextCls = "text-blue-500";
  if (weeklyPct > 80) { weeklyColor = "bg-red-500"; weeklyTextCls = "text-red-500"; }
  else if (weeklyPct > 50) { weeklyColor = "bg-amber-500"; weeklyTextCls = "text-amber-500"; }

  // Session bar color
  let sessionColor = "bg-blue-500";
  let sessionTextCls = "text-blue-500";
  if (sessionPct > 80) { sessionColor = "bg-red-500"; sessionTextCls = "text-red-500"; }
  else if (sessionPct > 50) { sessionColor = "bg-amber-500"; sessionTextCls = "text-amber-500"; }

  return `
    <div class="bg-card border ${account.is_paused ? "border-red-500/50" : ""} rounded-md fade-in flex flex-col account-card relative ${isFav ? "ring-1 ring-amber-400/40" : ""}" id="account-${account.id}"
         data-username="${escapeHtml(account.github_username)}"
         data-displayname="${escapeHtml(account.display_name || "")}"
         data-favorite="${isFav ? "1" : "0"}"
         data-paused="${account.is_paused ? "1" : "0"}"
         data-status="${account.is_paused ? "paused" : account.pat_token ? "active" : "inactive"}"
         data-loginmethod="${resolveLoginMethod(account)}">
      <div class="p-4 pb-0">
        <div class="flex items-start justify-between gap-2">
          <div class="flex items-center gap-2.5 min-w-0 flex-1">
            <div class="w-9 h-9 rounded-full border flex-shrink-0 bg-[#D97757]/10 flex items-center justify-center text-[#D97757]">
              ${icon("claude", 20)}
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5 flex-wrap">
                <h3 class="text-sm font-semibold text-foreground truncate censor-target">${escapeHtml(account.display_name || account.github_username)}</h3>
                ${planBadge(account.claude_plan || "pro", "claude_web")}
              </div>
              <p class="text-xs text-muted-foreground censor-target truncate">${escapeHtml(account.claude_user_email || account.github_username)}</p>
            </div>
          </div>
          <div class="flex items-center flex-shrink-0 -mr-1 gap-0.5">
            <button hx-post="/api/account/${account.id}/favorite" hx-target="#account-${account.id}" hx-swap="outerHTML"
                    class="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-accent transition-colors ${isFav ? "text-amber-400" : "text-muted-foreground hover:text-amber-400"}" data-tooltip="${isFav ? "Unpin" : "Pin to top"}" aria-label="${isFav ? "Unpin" : "Pin to top"}">
              ${isFav ? icon("star-filled", 14) : icon("star", 14)}
            </button>
            <button hx-post="/api/refresh/${account.id}" hx-target="#account-${account.id}" hx-swap="outerHTML"
                    class="refresh-btn inline-flex items-center justify-center w-7 h-7 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground" data-tooltip="Refresh" aria-label="Refresh">
              <span class="spin-icon">${icon("spinner", 14, "animate-spin")}</span>
              <span class="normal-icon">${icon("refresh", 14)}</span>
            </button>
            <div class="relative account-menu">
              <button onclick="toggleAccountMenu(${account.id})"
                      class="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground" data-tooltip="More actions" aria-label="More actions">
                ${icon("more-vertical", 14)}
              </button>
              <div id="menu-${account.id}" class="account-menu-dropdown hidden absolute right-0 mt-1 w-40 bg-popover border rounded-md shadow-lg z-50">
                <button hx-post="/api/account/${account.id}/pause" hx-target="#account-${account.id}" hx-swap="outerHTML"
                        class="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-accent transition-colors ${account.is_paused ? "text-emerald-500" : "text-foreground"}">
                  ${account.is_paused ? icon("play", 12) : icon("pause", 12)}
                  ${account.is_paused ? "Resume" : "Pause"}
                </button>
                <button hx-get="/api/account/${account.id}/edit" hx-target="#account-${account.id}" hx-swap="outerHTML"
                        class="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-accent transition-colors text-foreground">
                  ${icon("edit", 12)}
                  Edit
                </button>
                <div class="border-t my-1"></div>
                <button onclick="openDeleteModal('${escapeHtml(account.github_username)}', ${account.id})"
                        class="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-red-400/10 transition-colors text-red-400">
                  ${icon("trash", 12)}
                  Remove
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      ${errorBanner(error)}

      <div class="p-4 space-y-3 flex-1">
        <!-- Plan Usage Limits -->
        <div class="space-y-2.5">
          <p class="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Plan usage limits</p>
          
          <!-- Current Session -->
          <div>
            <div class="flex items-center justify-between mb-1">
              <span class="text-xs text-muted-foreground">Current session</span>
              <span class="text-xs font-semibold tabular-nums ${sessionTextCls}">${Math.round(sessionPct)}% used</span>
            </div>
            <div class="w-full bg-secondary rounded-sm h-1.5 overflow-hidden">
              <div class="${sessionColor} h-full rounded-sm progress-fill" style="width: ${Math.min(sessionPct, 100)}%"></div>
            </div>
          </div>
          
          <!-- Weekly Limits -->
          <div>
            <div class="flex items-center justify-between mb-1">
              <div class="flex items-center gap-1.5">
                <span class="text-xs font-medium text-foreground">All models</span>
                ${weeklyReset ? `<span class="text-[10px] text-muted-foreground">Resets ${escapeHtml(formatDate(weeklyReset))}</span>` : ""}
              </div>
              <span class="text-xs font-semibold tabular-nums ${weeklyTextCls}">${Math.round(weeklyPct)}% used</span>
            </div>
            <div class="w-full bg-secondary rounded-sm h-2 overflow-hidden">
              <div class="${weeklyColor} h-full rounded-sm progress-fill" style="width: ${Math.min(weeklyPct, 100)}%"></div>
            </div>
          </div>
        </div>

        ${extraEnabled ? `
        <!-- Extra Usage -->
        <div class="border-t pt-2.5 space-y-2">
          <p class="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Extra usage</p>
          <div>
            <div class="flex items-center justify-between mb-1">
              <span class="text-xs text-foreground font-medium">$${extraSpent.toFixed(2)} spent</span>
              <span class="text-xs font-semibold tabular-nums ${extraPct > 80 ? "text-red-500" : extraPct > 50 ? "text-amber-500" : "text-emerald-500"}">${Math.round(extraPct)}% used</span>
            </div>
            <div class="w-full bg-secondary rounded-sm h-1.5 overflow-hidden">
              <div class="${extraPct > 80 ? "bg-red-500" : extraPct > 50 ? "bg-amber-500" : "bg-emerald-500"} h-full rounded-sm progress-fill" style="width: ${Math.min(extraPct, 100)}%"></div>
            </div>
          </div>
          <div class="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>$${extraLimit.toFixed(0)} monthly limit</span>
            <span>$${extraBalance.toFixed(2)} balance</span>
          </div>
          ${extraReset ? `<span class="text-[10px] text-muted-foreground">Resets ${escapeHtml(formatDate(extraReset))}</span>` : ""}
        </div>
        ` : `
        <div class="border-t pt-2 text-[11px] text-muted-foreground flex items-center gap-1">
          Extra usage: <span class="text-amber-500">Off</span>
        </div>
        `}
      </div>

      ${noteSection(account.note)}
      <div class="px-4 py-2.5 border-t flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between bg-muted/30 rounded-b-md mt-auto">
        <span class="text-[11px] text-muted-foreground flex items-center gap-1" data-tooltip="Last fetched">
          ${icon("clock", 10)}
          ${fetchedAt}
        </span>
        <div class="flex items-center gap-2 flex-wrap">
          ${loginMethodBadge(account)}
          <span class="text-[11px] flex items-center gap-1 ${account.is_paused ? "text-amber-500" : account.pat_token ? "text-emerald-500" : "text-amber-500"}" data-tooltip="${account.is_paused ? "Auto-refresh paused" : account.pat_token ? "Session active" : "Session expired"}">
            ${account.is_paused ? icon("pause", 10) + " Paused" : account.pat_token ? icon("check-circle", 10) + " Active" : icon("alert-triangle", 10) + " Expired"}
          </span>
        </div>
      </div>
    </div>`;
}


//  Model Table

export function modelTable(details) {
  if (!details || details.length === 0) return "";
  return `
    <div>
      <p class="text-[11px] font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
        ${icon("bar-chart", 10)}
        Model breakdown
      </p>
      <div class="rounded border overflow-hidden">
        <table class="w-full text-[11px]">
          <thead>
            <tr class="bg-muted/50">
              <th class="text-left px-2.5 py-1.5 font-medium text-muted-foreground">Model</th>
              <th class="text-right px-2.5 py-1.5 font-medium text-muted-foreground">Requests</th>
              <th class="text-right px-2.5 py-1.5 font-medium text-muted-foreground">Cost</th>
            </tr>
          </thead>
          <tbody class="divide-y">
            ${details.map((d) => `
              <tr class="hover:bg-muted/30 transition-colors">
                <td class="px-2.5 py-1.5 text-foreground">${escapeHtml(d.model)}</td>
                <td class="px-2.5 py-1.5 text-right tabular-nums">${Math.round(d.quantity)}</td>
                <td class="px-2.5 py-1.5 text-right tabular-nums ${d.net_amount > 0 ? "text-amber-500" : "text-muted-foreground"}">$${d.net_amount.toFixed(4)}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>`;
}


//  Claude Code Account Card

function claudeCodeAccountCard(account, usage, details = [], error = null) {
  const budget = account.monthly_budget || CLAUDE_CODE_BUDGETS[account.claude_plan] || 100;
  const cost = usage ? usage.gross_quantity : 0; // stored as USD
  const pct = budget > 0 ? (cost / budget) * 100 : 0;
  const fetchedAt = usage ? formatDate(usage.fetched_at) : "Never";
  const isFav = !!account.is_favorite;
  const sessions = usage ? usage.sessions || 0 : 0;
  const linesAdded = usage ? usage.lines_added || 0 : 0;
  const linesRemoved = usage ? usage.lines_removed || 0 : 0;
  const commits = usage ? usage.commits || 0 : 0;
  const prs = usage ? usage.pull_requests || 0 : 0;

  return `
    <div class="bg-card border ${account.is_paused ? "border-red-500/50" : ""} rounded-md fade-in flex flex-col account-card relative ${isFav ? "ring-1 ring-amber-400/40" : ""}" id="account-${account.id}"
         data-username="${escapeHtml(account.github_username)}"
         data-displayname="${escapeHtml(account.display_name || "")}"
         data-favorite="${isFav ? "1" : "0"}"
         data-paused="${account.is_paused ? "1" : "0"}"
         data-status="${account.is_paused ? "paused" : account.pat_token ? "active" : "inactive"}"
         data-loginmethod="${resolveLoginMethod(account)}">
      <div class="p-4 pb-0">
        <div class="flex items-start justify-between gap-2">
          <div class="flex items-center gap-2.5 min-w-0 flex-1">
            <div class="w-9 h-9 rounded-full border flex-shrink-0 bg-[#D97757]/10 flex items-center justify-center text-[#D97757]">
              ${icon("claude", 20)}
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5 flex-wrap">
                <h3 class="text-sm font-semibold text-foreground truncate censor-target">${escapeHtml(account.display_name || account.github_username)}</h3>
                ${planBadge(account.claude_plan || "api", "claude_code")}
              </div>
              <p class="text-xs text-muted-foreground censor-target truncate">${escapeHtml(account.claude_user_email || account.github_username)}</p>
            </div>
          </div>
          <div class="flex items-center flex-shrink-0 -mr-1 gap-0.5">
            <button hx-post="/api/account/${account.id}/favorite" hx-target="#account-${account.id}" hx-swap="outerHTML"
                    class="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-accent transition-colors ${isFav ? "text-amber-400" : "text-muted-foreground hover:text-amber-400"}" data-tooltip="${isFav ? "Unpin" : "Pin to top"}" aria-label="${isFav ? "Unpin" : "Pin to top"}">
              ${isFav ? icon("star-filled", 14) : icon("star", 14)}
            </button>
            <button hx-post="/api/refresh/${account.id}" hx-target="#account-${account.id}" hx-swap="outerHTML"
                    class="refresh-btn inline-flex items-center justify-center w-7 h-7 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground" data-tooltip="Refresh" aria-label="Refresh">
              <span class="spin-icon">${icon("spinner", 14, "animate-spin")}</span>
              <span class="normal-icon">${icon("refresh", 14)}</span>
            </button>
            <div class="relative account-menu">
              <button onclick="toggleAccountMenu(${account.id})"
                      class="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground" data-tooltip="More actions" aria-label="More actions">
                ${icon("more-vertical", 14)}
              </button>
              <div id="menu-${account.id}" class="account-menu-dropdown hidden absolute right-0 mt-1 w-40 bg-popover border rounded-md shadow-lg z-50">
                <button hx-post="/api/account/${account.id}/pause" hx-target="#account-${account.id}" hx-swap="outerHTML"
                        class="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-accent transition-colors ${account.is_paused ? "text-emerald-500" : "text-foreground"}">
                  ${account.is_paused ? icon("play", 12) : icon("pause", 12)}
                  ${account.is_paused ? "Resume" : "Pause"}
                </button>
                <button hx-get="/api/account/${account.id}/edit" hx-target="#account-${account.id}" hx-swap="outerHTML"
                        class="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-accent transition-colors text-foreground">
                  ${icon("edit", 12)}
                  Edit
                </button>
                <div class="border-t my-1"></div>
                <button onclick="openDeleteModal('${escapeHtml(account.github_username)}', ${account.id})"
                        class="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-red-400/10 transition-colors text-red-400">
                  ${icon("trash", 12)}
                  Remove
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      ${errorBanner(error)}

      <div class="p-4 space-y-2.5 flex-1">
        ${costBar(pct, cost, budget)}

        ${(sessions > 0 || linesAdded > 0 || commits > 0) ? `
        <div class="rounded border p-2.5 space-y-1.5">
          <p class="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
            ${icon("code", 10)}
            Productivity (This Month)
          </p>
          <div class="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
            <span class="flex items-center gap-1 text-foreground" data-tooltip="Sessions">
              ${icon("terminal", 10, "text-muted-foreground")}
              <span class="tabular-nums font-medium">${sessions}</span> sessions
            </span>
            <span class="flex items-center gap-1 text-emerald-500" data-tooltip="Lines added">
              <span class="tabular-nums font-medium">+${formatNumber(linesAdded)}</span>
            </span>
            <span class="flex items-center gap-1 text-red-400" data-tooltip="Lines removed">
              <span class="tabular-nums font-medium">-${formatNumber(linesRemoved)}</span>
            </span>
            ${commits > 0 ? `<span class="flex items-center gap-1 text-foreground" data-tooltip="Commits by Claude Code">
              ${icon("git-commit", 10, "text-muted-foreground")}
              <span class="tabular-nums font-medium">${commits}</span>
            </span>` : ""}
            ${prs > 0 ? `<span class="flex items-center gap-1 text-foreground" data-tooltip="PRs by Claude Code">
              ${icon("git-pull-request", 10, "text-muted-foreground")}
              <span class="tabular-nums font-medium">${prs}</span>
            </span>` : ""}
          </div>
        </div>
        ` : ""}

        ${details.length > 0 ? claudeModelTable(details) : ""}
      </div>

      ${noteSection(account.note)}
      <div class="px-4 py-2.5 border-t flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between bg-muted/30 rounded-b-md mt-auto">
        <span class="text-[11px] text-muted-foreground flex items-center gap-1" data-tooltip="Last fetched">
          ${icon("clock", 10)}
          ${fetchedAt}
        </span>
        <div class="flex items-center gap-2 flex-wrap">
          ${loginMethodBadge(account)}
          <span class="text-[11px] flex items-center gap-1 ${account.is_paused ? "text-amber-500" : account.pat_token ? "text-emerald-500" : "text-amber-500"}" data-tooltip="${account.is_paused ? "Auto-refresh paused" : account.pat_token ? "API key set" : "No API key"}">
            ${account.is_paused ? icon("pause", 10) + " Paused" : account.pat_token ? icon("check-circle", 10) + " Active" : icon("alert-triangle", 10) + " No key"}
          </span>
        </div>
      </div>
    </div>`;
}


//  Cost Bar (for Claude Code)

export function costBar(percentage, cost, budget, label = "Monthly cost", iconName = "dollar") {
  let barColor = "bg-emerald-500";
  let textCls = "text-emerald-500";
  if (percentage > 80) {
    barColor = "bg-red-500";
    textCls = "text-red-500";
  } else if (percentage > 50) {
    barColor = "bg-amber-500";
    textCls = "text-amber-500";
  }
  const width = Math.min(percentage, 100);

  return `
    <div class="w-full">
      <div class="flex items-center justify-between mb-1.5">
        <span class="text-xs font-medium ${textCls} flex items-center gap-1.5">
          ${icon(iconName, 12, textCls)}
          ${label}
        </span>
        <span class="text-xs font-semibold tabular-nums ${textCls}">${percentage.toFixed(1)}%</span>
      </div>
      <div class="w-full bg-secondary rounded-sm h-2 overflow-hidden">
        <div class="${barColor} h-full rounded-sm progress-fill" style="width: ${width}%"></div>
      </div>
      <div class="flex items-center justify-between text-xs mt-1.5">
        <span class="text-muted-foreground">
          <span class="font-semibold text-foreground tabular-nums">$${cost.toFixed(2)}</span> / $${budget.toFixed(2)} budget
        </span>
      </div>
    </div>`;
}


//  Claude Code Model Table

export function claudeModelTable(details) {
  if (!details || details.length === 0) return "";
  return `
    <div>
      <p class="text-[11px] font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
        ${icon("bar-chart", 10)}
        Model breakdown
      </p>
      <div class="rounded border overflow-hidden">
        <table class="w-full text-[11px]">
          <thead>
            <tr class="bg-muted/50">
              <th class="text-left px-2.5 py-1.5 font-medium text-muted-foreground">Model</th>
              <th class="text-right px-2.5 py-1.5 font-medium text-muted-foreground">Tokens</th>
              <th class="text-right px-2.5 py-1.5 font-medium text-muted-foreground">Cost</th>
            </tr>
          </thead>
          <tbody class="divide-y">
            ${details.map((d) => {
              const totalTokens = (d.input_tokens || 0) + (d.output_tokens || 0);
              return `
              <tr class="hover:bg-muted/30 transition-colors">
                <td class="px-2.5 py-1.5 text-foreground">${escapeHtml(d.model)}</td>
                <td class="px-2.5 py-1.5 text-right tabular-nums" data-tooltip="In: ${formatNumber(d.input_tokens || 0)} · Out: ${formatNumber(d.output_tokens || 0)}">${formatNumber(totalTokens)}</td>
                <td class="px-2.5 py-1.5 text-right tabular-nums ${d.net_amount > 0 ? "text-amber-500" : "text-muted-foreground"}">$${d.net_amount.toFixed(2)}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>`;
}


//  Empty State

export function emptyState() {
  return `
    <div class="flex flex-col items-center justify-center py-16 fade-in">
      <div class="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-5 text-muted-foreground">
        ${icon("users", 28)}
      </div>
      <h2 class="text-lg font-semibold mb-1.5">No accounts yet</h2>
      <p class="text-sm text-muted-foreground mb-5 text-center max-w-xs">Add a GitHub Copilot or Claude Code account to monitor your AI coding usage.</p>
      <a href="/add" class="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity text-sm font-medium" aria-label="Add your first account">
        ${icon("plus", 16)}
        Add Account
      </a>
    </div>`;
}


//  Add Account Form

export function addAccountForm(hasOAuthClientId) {
  return `
    <div class="max-w-lg mx-auto space-y-5">
      <div>
        <h2 class="text-lg font-semibold flex items-center gap-2">
          ${icon("user", 20, "text-primary")}
          Add Account
        </h2>
        <p class="text-sm text-muted-foreground mt-0.5">Monitor GitHub Copilot or Claude usage.</p>
      </div>

      <!-- Tab Switcher -->
      <div class="flex border-b">
        <button onclick="switchAddTab('copilot')" id="tab-copilot"
                class="add-tab flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 border-primary text-foreground transition-colors">
          ${icon("github", 16)}
          GitHub Copilot
        </button>
        <button onclick="switchAddTab('claude-web')" id="tab-claude-web"
                class="add-tab flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground transition-colors">
          ${icon("claude", 16)}
          Claude Pro/Max
        </button>
        <button onclick="switchAddTab('claude')" id="tab-claude"
                class="add-tab flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground transition-colors">
           ${icon("claude", 16)}
          Claude Code
        </button>
      </div>

      <!-- ===== Copilot Tab ===== -->
      <div id="panel-copilot">
      
      <!-- Device Flow -->
      <div class="bg-card border rounded-md overflow-hidden">
        <div class="p-4">
          <h3 class="text-sm font-semibold flex items-center gap-2 mb-1">
            ${icon("login", 16, "text-primary")}
            Login with GitHub
          </h3>
          <p class="text-xs text-muted-foreground mb-3">Sign in directly through your browser. Quick and seamless.</p>
          
          ${hasOAuthClientId ? `
          <button hx-post="/api/oauth/start" hx-target="#oauth-status" hx-swap="innerHTML"
                  class="w-full inline-flex items-center justify-center gap-2 px-3 py-2 bg-foreground text-background rounded-md hover:opacity-90 transition-opacity text-sm font-medium" aria-label="Authenticate via GitHub Device Flow">
            ${icon("github", 16)}
            Continue with GitHub
          </button>
          ` : `
          <div class="rounded-md border border-amber-500/20 overflow-hidden">
            <div class="px-3 py-2.5 bg-amber-500/10 flex items-start gap-2">
              <span class="flex-shrink-0 mt-0.5">${icon("alert-triangle", 14, "text-amber-600 dark:text-amber-400")}</span>
              <p class="text-xs text-amber-600 dark:text-amber-400">OAuth not configured. Set up a GitHub OAuth App to enable Device Login, or use a token below.</p>
            </div>
            <div class="p-3 space-y-3">
              <p class="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Setup Guide</p>
              <ol class="text-xs text-muted-foreground space-y-2">
                <li class="flex items-start gap-2.5">
                  <span class="flex-shrink-0 w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center">1</span>
                  <span class="pt-0.5">Go to <a href="https://github.com/settings/developers" target="_blank" class="text-primary hover:underline">github.com/settings/developers</a></span>
                </li>
                <li class="flex items-start gap-2.5">
                  <span class="flex-shrink-0 w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center">2</span>
                  <span class="pt-0.5">Click <strong class="text-foreground">"New OAuth App"</strong></span>
                </li>
                <li class="flex items-start gap-2.5">
                  <span class="flex-shrink-0 w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center">3</span>
                  <span class="pt-0.5">App name: <code class="bg-muted px-1 py-0.5 rounded-sm text-[11px]">KUOTA</code> · Homepage & Callback: <code class="bg-muted px-1 py-0.5 rounded-sm text-[11px]">http://localhost:3000</code></span>
                </li>
                <li class="flex items-start gap-2.5">
                  <span class="flex-shrink-0 w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center">4</span>
                  <span class="pt-0.5">Enable <strong class="text-foreground">"Device Flow"</strong>, then copy the <strong class="text-foreground">Client ID</strong></span>
                </li>
              </ol>
              <form hx-post="/api/settings/oauth-client" hx-target="#oauth-setup-result" hx-swap="innerHTML" class="flex gap-2 items-center">
                <input type="text" name="client_id" placeholder="Paste Client ID here..." required
                       class="input-field flex-1 px-2.5 py-1.5 bg-background border rounded text-foreground text-xs">
                <button type="submit" class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded text-xs font-medium whitespace-nowrap">
                  ${icon("save", 12)} Save
                </button>
              </form>
              <div id="oauth-setup-result"></div>
            </div>
          </div>
          `}
          <div id="oauth-status" class="mt-3"></div>
        </div>
      </div>
      
      <!-- Divider -->
      <div class="relative my-5">
        <div class="absolute inset-0 flex items-center"><div class="w-full border-t"></div></div>
        <div class="relative flex justify-center text-[10px] uppercase tracking-wider">
          <span class="bg-background px-2 text-muted-foreground">or</span>
        </div>
      </div>
      
      <!-- Direct PAT -->
      <div class="bg-card border rounded-md overflow-hidden">
        <div class="p-4">
          <h3 class="text-sm font-semibold flex items-center gap-2 mb-1">
            ${icon("key", 16, "text-emerald-500")}
            Direct Token Input
          </h3>
          <p class="text-xs text-muted-foreground mb-3">
            Paste a <a href="https://github.com/settings/tokens" target="_blank" class="text-primary hover:underline">Classic PAT</a> or 
            <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" class="text-primary hover:underline">Fine-grained PAT</a>.
          </p>
          
          <form hx-post="/api/account/add-pat" hx-target="#pat-result" hx-swap="innerHTML" hx-disabled-elt="find button[type='submit']" class="space-y-3">
            <div>
              <label class="block text-xs font-medium mb-1">Personal Access Token</label>
              <div class="flex gap-2">
                <input type="password" name="pat" id="pat-input" required placeholder="ghp_... or github_pat_..." 
                       class="input-field flex-1 px-2.5 py-1.5 bg-background border rounded text-foreground text-xs font-mono">
                <button type="button" hx-post="/api/account/detect-orgs" hx-include="#pat-input" hx-target="#org-detect-result" hx-swap="innerHTML"
                        class="detect-orgs-btn inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-secondary text-foreground border rounded text-xs font-medium hover:bg-accent transition-colors whitespace-nowrap">
                  <span class="inline-flex items-center">
                    <span class="spin-icon">${icon("spinner", 12, "animate-spin")}</span>
                    <span class="normal-icon">${icon("search", 12)}</span>
                  </span>
                  <span>Detect</span>
                </button>
              </div>
            </div>
            <div id="org-detect-result"></div>
            <div>
              <label class="block text-xs font-medium mb-1">Copilot Plan <span class="text-muted-foreground font-normal">(auto-detected via Detect)</span></label>
              <select name="plan" class="input-field w-full px-2.5 py-1.5 bg-background border rounded text-foreground text-xs">
                <option value="free">Free (50 req/month)</option>
                <option value="pro" selected>Pro (300 req/month)</option>
                <option value="pro_plus">Pro+ (1,500 req/month)</option>
                <option value="business">Business (300 req/month)</option>
                <option value="enterprise">Enterprise (1,000 req/month)</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-medium mb-1">Note <span class="text-muted-foreground font-normal">(optional)</span></label>
              <textarea name="note" maxlength="200" placeholder="Add a note for this account..." rows="2"
                        oninput="this.nextElementSibling.textContent = this.value.length + ' / 200'"
                        class="input-field w-full px-2.5 py-1.5 bg-background border rounded text-foreground text-xs resize-y"></textarea>
              <p class="text-[11px] text-muted-foreground mt-1 text-right">0 / 200</p>
            </div>
            <button type="submit" class="w-full inline-flex items-center justify-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity text-sm font-medium">
              ${icon("plus", 14)}
              Add Account
            </button>
          </form>
          <div id="pat-result" class="mt-3"></div>
        </div>
      </div>

      <!-- Help -->
      <div class="bg-primary/5 border border-primary/10 rounded-md p-3.5 mt-5">
        <h4 class="text-xs font-semibold flex items-center gap-1.5 mb-3">
          ${icon("info", 14, "text-primary")}
          How to create a token
        </h4>
        <div class="text-xs text-muted-foreground space-y-2.5">
          <div class="flex items-start gap-2.5">
            <span class="flex-shrink-0 w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center">1</span>
            <span class="pt-0.5"><strong class="text-foreground">Classic PAT</strong> - <a href="https://github.com/settings/tokens/new" target="_blank" class="text-primary hover:underline">Create here</a>. No special scopes needed.</span>
          </div>
          <div class="flex items-start gap-2.5">
            <span class="flex-shrink-0 w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center">2</span>
            <span class="pt-0.5"><strong class="text-foreground">Fine-grained</strong> - <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" class="text-primary hover:underline">Create here</a>. Set <strong class="text-foreground">Plan: Read-only</strong>.</span>
          </div>
          <div class="flex items-start gap-2.5">
            <span class="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500/15 text-amber-500 text-[10px] font-bold flex items-center justify-center">!</span>
            <span class="pt-0.5"><strong class="text-foreground">Copilot Business/Enterprise (org-managed)</strong>: Fine-grained PAT also needs <strong class="text-foreground">Organization Administration: Read-only</strong> permission on the org that manages your Copilot seat.</span>
          </div>
        </div>
      </div>

      </div><!-- end panel-copilot -->

      <!-- ===== Claude Pro/Max Tab ===== -->
      <div id="panel-claude-web" class="hidden space-y-5">
      
      <div class="bg-card border rounded-md overflow-hidden">
        <div class="p-4">
          <h3 class="text-sm font-semibold flex items-center gap-2 mb-1">
            ${icon("key", 16, "text-[#D97757]")}
            Claude Code OAuth Token
          </h3>
          <p class="text-xs text-muted-foreground mb-3">
            Uses OAuth credentials from <strong>Claude Code CLI</strong> to fetch usage data 
            via <code class="bg-muted px-1 py-0.5 rounded-sm text-[11px]">api.anthropic.com</code>.
          </p>
          
          <form hx-post="/api/account/add-claude-web" hx-target="#claude-web-result" hx-swap="innerHTML" hx-disabled-elt="find button[type='submit']" class="space-y-3">
            <!-- Auto-detect option -->
            <div class="bg-emerald-500/10 border border-emerald-500/20 rounded-md p-3">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" name="auto_detect" value="1" id="auto-detect-cb"
                       class="rounded border-muted accent-emerald-500"
                       onchange="document.getElementById('manual-token-fields').classList.toggle('hidden', this.checked)">
                <span class="text-xs font-medium text-emerald-400">Auto-detect from <code class="bg-muted px-1 py-0.5 rounded-sm text-[11px]">~/.claude/.credentials.json</code></span>
              </label>
              <p class="text-[11px] text-muted-foreground mt-1.5 ml-5">Reads tokens from locally installed Claude Code CLI.</p>
            </div>

            <div>
              <label class="block text-xs font-medium mb-1">Display Name</label>
              <input type="text" name="name" required placeholder="e.g., My Claude Pro" 
                     class="input-field w-full px-2.5 py-1.5 bg-background border rounded text-foreground text-xs">
            </div>

            <div id="manual-token-fields" class="space-y-3">
              <div>
                <label class="block text-xs font-medium mb-1">Access Token</label>
                <input type="password" name="access_token" placeholder="sk-ant-oat01-..." 
                       class="input-field w-full px-2.5 py-1.5 bg-background border rounded text-foreground text-xs font-mono">
              </div>
              <div>
                <label class="block text-xs font-medium mb-1">Refresh Token <span class="text-muted-foreground font-normal">(recommended)</span></label>
                <input type="password" name="refresh_token" placeholder="For auto-renewal - from credentials.json" 
                       class="input-field w-full px-2.5 py-1.5 bg-background border rounded text-foreground text-xs font-mono">
              </div>
            </div>

            <div>
              <label class="block text-xs font-medium mb-1">Plan</label>
              <select name="plan" class="input-field w-full px-2.5 py-1.5 bg-background border rounded text-foreground text-xs">
                <option value="pro" selected>Pro ($20/mo)</option>
                <option value="max">Max ($100/mo)</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-medium mb-1">Note <span class="text-muted-foreground font-normal">(optional)</span></label>
              <textarea name="note" maxlength="200" placeholder="Add a note for this account..." rows="2"
                        oninput="this.nextElementSibling.textContent = this.value.length + ' / 200'"
                        class="input-field w-full px-2.5 py-1.5 bg-background border rounded text-foreground text-xs resize-y"></textarea>
              <p class="text-[11px] text-muted-foreground mt-1 text-right">0 / 200</p>
            </div>
            <button type="submit" class="w-full inline-flex items-center justify-center gap-2 px-3 py-2 bg-[#D97757] text-white rounded-md hover:opacity-90 transition-opacity text-sm font-medium">
              ${icon("plus", 14)}
              Add Claude Account
            </button>
          </form>
          <div id="claude-web-result" class="mt-3"></div>
        </div>
      </div>

      <!-- Help -->
      <div class="bg-[#D97757]/5 border border-[#D97757]/10 rounded-md p-3.5">
        <h4 class="text-xs font-semibold flex items-center gap-1.5 mb-3">
          ${icon("info", 14, "text-[#D97757]")}
          How to set up
        </h4>
        <div class="text-xs text-muted-foreground space-y-2.5">
          <div class="flex items-start gap-2.5">
            <span class="flex-shrink-0 w-5 h-5 rounded-full bg-[#D97757]/15 text-[#D97757] text-[10px] font-bold flex items-center justify-center">1</span>
            <span class="pt-0.5">Install Claude Code: <code class="bg-muted px-1 py-0.5 rounded-sm text-[11px]">npm i -g @anthropic-ai/claude-code</code></span>
          </div>
          <div class="flex items-start gap-2.5">
            <span class="flex-shrink-0 w-5 h-5 rounded-full bg-[#D97757]/15 text-[#D97757] text-[10px] font-bold flex items-center justify-center">2</span>
            <span class="pt-0.5">Run <code class="bg-muted px-1 py-0.5 rounded-sm text-[11px]">claude</code> and log in with your Pro/Max account</span>
          </div>
          <div class="flex items-start gap-2.5">
            <span class="flex-shrink-0 w-5 h-5 rounded-full bg-[#D97757]/15 text-[#D97757] text-[10px] font-bold flex items-center justify-center">3</span>
            <span class="pt-0.5">Check <strong>Auto-detect</strong> above, or manually copy tokens from <code class="bg-muted px-1 py-0.5 rounded-sm text-[11px]">~/.claude/.credentials.json</code></span>
          </div>
          <div class="flex items-start gap-2.5 mt-1">
            <span class="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-500 text-[10px] font-bold flex items-center justify-center">✓</span>
            <span class="pt-0.5 text-emerald-400">Tokens auto-refresh. No manual updates needed.</span>
          </div>
          <p class="text-[10px] text-muted-foreground/60 mt-2 ml-7">⚠️ This feature uses an unofficial API and may change at any time.</p>
        </div>
      </div>

      </div><!-- end panel-claude-web -->

      <!-- ===== Claude Code Tab ===== -->
      <div id="panel-claude" class="hidden space-y-5">
      
      <div class="bg-card border rounded-md overflow-hidden">
        <div class="p-4">
          <h3 class="text-sm font-semibold flex items-center gap-2 mb-1">
            ${icon("key", 16, "text-[#D97757]")}
            Anthropic Admin API Key
          </h3>
          <p class="text-xs text-muted-foreground mb-3">
            Enter your <strong>Admin API Key</strong> (<code class="bg-muted px-1 py-0.5 rounded-sm text-[11px]">sk-ant-admin...</code>) from the 
            <a href="https://console.anthropic.com/settings/admin-keys" target="_blank" class="text-primary hover:underline">Anthropic Console</a>.
          </p>
          
          <form hx-post="/api/account/add-claude" hx-target="#claude-result" hx-swap="innerHTML" hx-disabled-elt="find button[type='submit']" class="space-y-3">
            <div>
              <label class="block text-xs font-medium mb-1">Display Name</label>
              <input type="text" name="name" required placeholder="e.g., My Team, Personal API" 
                     class="input-field w-full px-2.5 py-1.5 bg-background border rounded text-foreground text-xs">
            </div>
            <div>
              <label class="block text-xs font-medium mb-1">Admin API Key</label>
              <input type="password" name="api_key" required placeholder="sk-ant-admin-..." 
                     class="input-field w-full px-2.5 py-1.5 bg-background border rounded text-foreground text-xs font-mono">
            </div>
            <div>
              <label class="block text-xs font-medium mb-1">User Email <span class="text-muted-foreground font-normal">(optional)</span></label>
              <input type="email" name="user_email" placeholder="Filter to specific user (leave empty for org-wide)" 
                     class="input-field w-full px-2.5 py-1.5 bg-background border rounded text-foreground text-xs">
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium mb-1">Plan</label>
                <select name="plan" onchange="updateClaudeBudget(this.value)" class="input-field w-full px-2.5 py-1.5 bg-background border rounded text-foreground text-xs">
                  <option value="api" selected>API (Pay-as-you-go)</option>
                  <option value="pro">Pro ($20/mo)</option>
                  <option value="max">Max ($100/mo)</option>
                  <option value="team">Team ($150/mo)</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-medium mb-1">Monthly Budget ($)</label>
                <input type="number" name="budget" id="claude-budget" value="100" min="1" step="1" 
                       class="input-field w-full px-2.5 py-1.5 bg-background border rounded text-foreground text-xs tabular-nums">
              </div>
            </div>
            <div>
              <label class="block text-xs font-medium mb-1">Note <span class="text-muted-foreground font-normal">(optional)</span></label>
              <textarea name="note" maxlength="200" placeholder="Add a note for this account..." rows="2"
                        oninput="this.nextElementSibling.textContent = this.value.length + ' / 200'"
                        class="input-field w-full px-2.5 py-1.5 bg-background border rounded text-foreground text-xs resize-y"></textarea>
              <p class="text-[11px] text-muted-foreground mt-1 text-right">0 / 200</p>
            </div>
            <button type="submit" class="w-full inline-flex items-center justify-center gap-2 px-3 py-2 bg-[#D97757] text-white rounded-md hover:opacity-90 transition-opacity text-sm font-medium">
              ${icon("plus", 14)}
              Add Claude Code Account
            </button>
          </form>
          <div id="claude-result" class="mt-3"></div>
        </div>
      </div>

      <!-- Help -->
      <div class="bg-[#D97757]/5 border border-[#D97757]/10 rounded-md p-3.5">
        <h4 class="text-xs font-semibold flex items-center gap-1.5 mb-3">
          ${icon("info", 14, "text-[#D97757]")}
          How to get an Admin API Key
        </h4>
        <div class="text-xs text-muted-foreground space-y-2.5">
          <div class="flex items-start gap-2.5">
            <span class="flex-shrink-0 w-5 h-5 rounded-full bg-[#D97757]/15 text-[#D97757] text-[10px] font-bold flex items-center justify-center">1</span>
            <span class="pt-0.5">Go to <a href="https://console.anthropic.com/settings/admin-keys" target="_blank" class="text-primary hover:underline">console.anthropic.com/settings/admin-keys</a></span>
          </div>
          <div class="flex items-start gap-2.5">
            <span class="flex-shrink-0 w-5 h-5 rounded-full bg-[#D97757]/15 text-[#D97757] text-[10px] font-bold flex items-center justify-center">2</span>
            <span class="pt-0.5">Click <strong class="text-foreground">"Create Key"</strong> and copy the key</span>
          </div>
          <div class="flex items-start gap-2.5">
            <span class="flex-shrink-0 w-5 h-5 rounded-full bg-[#D97757]/15 text-[#D97757] text-[10px] font-bold flex items-center justify-center">3</span>
            <span class="pt-0.5">Requires <strong class="text-foreground">Admin</strong> role in Anthropic Console. Individual Pro/Max subscriptions don't have API access for usage tracking.</span>
          </div>
        </div>
      </div>

      </div><!-- end panel-claude -->

    </div>
    <script>
      function switchAddTab(tab) {
        document.querySelectorAll('.add-tab').forEach(function(el) {
          el.classList.remove('border-primary', 'text-foreground');
          el.classList.add('border-transparent', 'text-muted-foreground');
        });
        document.getElementById('tab-' + tab).classList.remove('border-transparent', 'text-muted-foreground');
        document.getElementById('tab-' + tab).classList.add('border-primary', 'text-foreground');
        document.getElementById('panel-copilot').classList.toggle('hidden', tab !== 'copilot');
        document.getElementById('panel-claude-web').classList.toggle('hidden', tab !== 'claude-web');
        document.getElementById('panel-claude').classList.toggle('hidden', tab !== 'claude');
      }
      var claudeBudgets = { api: 100, pro: 20, max: 100, team: 150, enterprise: 500 };
      function updateClaudeBudget(plan) {
        var el = document.getElementById('claude-budget');
        if (el && claudeBudgets[plan]) el.value = claudeBudgets[plan];
      }
    </script>`;
}


//  OAuth Device Code

export function oauthDeviceCode(userCode, verificationUri, flowId) {
  return `
    <div class="rounded-md bg-primary/5 border border-primary/20 p-4 fade-in space-y-3">
      <p class="text-xs font-medium text-center text-muted-foreground">Open the link and enter this code:</p>
      <div class="flex items-center justify-center">
        <code class="text-2xl font-mono font-bold tracking-[.3em] text-primary bg-primary/10 px-5 py-2.5 rounded-md">${userCode}</code>
      </div>
      <a href="${verificationUri}" target="_blank" 
         class="flex items-center justify-center gap-2 w-full px-3 py-2 bg-foreground text-background rounded-md hover:opacity-90 transition-opacity text-sm font-medium" aria-label="Open GitHub to enter the code">
        ${icon("external-link", 14)}
        Open GitHub
      </a>
      <div hx-get="/api/oauth/poll/${flowId}" hx-trigger="every 5s" hx-target="#oauth-status" hx-swap="innerHTML"
           class="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        ${icon("spinner", 12, "animate-spin")}
        Waiting for authorization...
      </div>
    </div>`;
}


//  Edit Account Form

export function editAccountForm(account) {
  const isClaude = account.account_type === "claude_code";
  const isClaudeWeb = account.account_type === "claude_web";
  const isAnyClaude = isClaude || isClaudeWeb;
  const accentColor = isAnyClaude ? "[#D97757]" : "primary";

  return `
    <div class="bg-card border border-${accentColor}/30 rounded-md fade-in" id="account-${account.id}">
      <div class="p-4 border-b bg-${accentColor}/5">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            ${isAnyClaude ? `
            <div class="w-8 h-8 rounded-full border border-${accentColor}/30 bg-${accentColor}/10 flex items-center justify-center text-${accentColor} censor-target">
              ${icon("claude", 16)}
            </div>` : `
            <img src="${escapeHtml(account.avatar_url || `https://github.com/${account.github_username}.png?size=80`)}" 
                 alt="" class="w-8 h-8 rounded-full border border-primary/30 censor-target"
                 onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><path d=%22M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2%22/><circle cx=%2212%22 cy=%227%22 r=%224%22/></svg>'">`}
            <div>
              <h3 class="text-sm font-semibold flex items-center gap-1.5">
                ${icon("edit", 14, `text-${accentColor}`)}
                Editing <span class="censor-target">${isAnyClaude ? escapeHtml(account.display_name || account.github_username) : "@" + escapeHtml(account.github_username)}</span>
              </h3>
              <p class="text-[11px] text-muted-foreground">${isClaudeWeb ? "Update OAuth tokens or plan" : isClaude ? "Update API key, plan, or budget" : "Update token or change plan"}</p>
            </div>
          </div>
          <button hx-get="/api/account/${account.id}/cancel" hx-target="#account-${account.id}" hx-swap="outerHTML"
                  class="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-accent transition-colors text-muted-foreground" data-tooltip="Cancel editing" aria-label="Cancel editing">
            ${icon("close", 16)}
          </button>
        </div>
      </div>
      <form hx-put="/api/account/${account.id}" hx-target="#account-${account.id}" hx-swap="outerHTML" hx-disabled-elt="find button[type='submit']" class="p-4 space-y-3">
        ${isClaudeWeb ? `
        <!-- Auto-detect option -->
        <div class="bg-emerald-500/10 border border-emerald-500/20 rounded-md p-2.5">
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" name="auto_detect" value="1"
                   class="rounded border-muted accent-emerald-500"
                   onchange="this.closest('form').querySelector('#edit-manual-fields-${account.id}').classList.toggle('hidden', this.checked)">
            <span class="text-xs font-medium text-emerald-400">Auto-detect from <code class="bg-muted px-1 py-0.5 rounded-sm text-[11px]">~/.claude/.credentials.json</code></span>
          </label>
        </div>
        <div id="edit-manual-fields-${account.id}" class="space-y-3">
          <div>
            <label class="block text-xs font-medium mb-1">Access Token</label>
            <input type="password" name="access_token" placeholder="Leave empty to keep current" 
                   class="input-field w-full px-2.5 py-1.5 bg-background border rounded text-foreground text-xs font-mono">
            <p class="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
              ${account.pat_token ? icon("check", 10, "text-emerald-500") + " Token set - leave empty to keep." : icon("alert-triangle", 10, "text-amber-500") + " Token expired. Run <code>claude</code> to re-login."}
            </p>
          </div>
          <div>
            <label class="block text-xs font-medium mb-1">Refresh Token</label>
            <input type="password" name="refresh_token" placeholder="Leave empty to keep current" 
                   class="input-field w-full px-2.5 py-1.5 bg-background border rounded text-foreground text-xs font-mono">
            <p class="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
              ${account.claude_cf_clearance ? icon("check", 10, "text-emerald-500") + " Set - tokens auto-refresh." : icon("alert-triangle", 10, "text-amber-500") + " Not set. Tokens won't auto-renew."}
            </p>
          </div>
        </div>
        <div>
          <label class="block text-xs font-medium mb-1">Plan</label>
          <select name="plan" class="input-field w-full px-2.5 py-1.5 bg-background border rounded text-foreground text-xs">
            <option value="pro" ${account.claude_plan === "pro" ? "selected" : ""}>Pro ($20/mo)</option>
            <option value="max" ${account.claude_plan === "max" ? "selected" : ""}>Max ($100/mo)</option>
          </select>
        </div>
        ` : isClaude ? `
        <div>
          <label class="block text-xs font-medium mb-1">Admin API Key</label>
          <input type="password" name="api_key" placeholder="Leave empty to keep current" 
                 class="input-field w-full px-2.5 py-1.5 bg-background border rounded text-foreground text-xs font-mono">
          <p class="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
            ${account.pat_token ? icon("check", 10, "text-emerald-500") + " Key set - leave empty to keep." : icon("alert-triangle", 10, "text-amber-500") + " No key. Paste one."}
          </p>
        </div>
        <div>
          <label class="block text-xs font-medium mb-1">User Email <span class="text-muted-foreground font-normal">(optional)</span></label>
          <input type="email" name="user_email" value="${escapeHtml(account.claude_user_email || "")}" placeholder="Filter to specific user" 
                 class="input-field w-full px-2.5 py-1.5 bg-background border rounded text-foreground text-xs censor-target">
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-medium mb-1">Plan</label>
            <select name="plan" class="input-field w-full px-2.5 py-1.5 bg-background border rounded text-foreground text-xs">
              <option value="api" ${account.claude_plan === "api" ? "selected" : ""}>API</option>
              <option value="pro" ${account.claude_plan === "pro" ? "selected" : ""}>Pro</option>
              <option value="max" ${account.claude_plan === "max" ? "selected" : ""}>Max</option>
              <option value="team" ${account.claude_plan === "team" ? "selected" : ""}>Team</option>
              <option value="enterprise" ${account.claude_plan === "enterprise" ? "selected" : ""}>Enterprise</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium mb-1">Budget ($)</label>
            <input type="number" name="budget" value="${account.monthly_budget || 100}" min="1" step="1" 
                   class="input-field w-full px-2.5 py-1.5 bg-background border rounded text-foreground text-xs tabular-nums">
          </div>
        </div>
        ` : `
        <div>
          <label class="block text-xs font-medium mb-1">Personal Access Token</label>
          <input type="password" name="pat" placeholder="Leave empty to keep current" 
                 class="input-field w-full px-2.5 py-1.5 bg-background border rounded text-foreground text-xs font-mono">
          <p class="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
            ${account.pat_token ? icon("check", 10, "text-emerald-500") + " Token set - leave empty to keep." : icon("alert-triangle", 10, "text-amber-500") + " No token. Paste one."}
          </p>
        </div>
        <div>
          <label class="block text-xs font-medium mb-1">Billing Source</label>
          <select name="billing_org" class="input-field w-full px-2.5 py-1.5 bg-background border rounded text-foreground text-xs">
            <option value=""${!account.billing_org ? " selected" : ""}>Personal (${escapeHtml(account.github_username)})</option>
            ${(account.github_orgs || "").split(",").filter(Boolean).map(org => 
              `<option value="${escapeHtml(org)}"${account.billing_org === org ? " selected" : ""}>${escapeHtml(org)}</option>`
            ).join("")}
          </select>
          <p class="text-[11px] text-muted-foreground mt-1">Select the org that manages your Copilot, or "Personal" if self-managed.</p>
        </div>
        <div>
          <label class="block text-xs font-medium mb-1">Copilot Plan <span class="text-muted-foreground font-normal">(auto-detected when new token is set)</span></label>
          <select name="plan" class="input-field w-full px-2.5 py-1.5 bg-background border rounded text-foreground text-xs">
            <option value="free" ${account.copilot_plan === "free" ? "selected" : ""}>Free (50 req/month)</option>
            <option value="pro" ${account.copilot_plan === "pro" ? "selected" : ""}>Pro (300 req/month)</option>
            <option value="pro_plus" ${account.copilot_plan === "pro_plus" ? "selected" : ""}>Pro+ (1,500 req/month)</option>
            <option value="business" ${account.copilot_plan === "business" ? "selected" : ""}>Business (300 req/month)</option>
            <option value="enterprise" ${account.copilot_plan === "enterprise" ? "selected" : ""}>Enterprise (1,000 req/month)</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium mb-1">Reset Date <span class="text-muted-foreground font-normal">(${account.billing_org ? "org — set manually" : "auto 1st of month, or override"})</span></label>
          <input type="date" name="reset_date" value="${escapeHtml(account.reset_date || getResetDateForAccount(account))}" 
                 class="input-field w-full px-2.5 py-1.5 bg-background border rounded text-foreground text-xs">
          <p class="text-[11px] text-muted-foreground mt-1">${account.billing_org ? "Organization billing cycle — set your org's reset date." : "Personal accounts reset on the 1st. Set a custom date to override."}</p>
        </div>
        `}
        <div>
          <label class="block text-xs font-medium mb-1">Note <span class="text-muted-foreground font-normal">(optional)</span></label>
          <textarea name="note" maxlength="200" placeholder="Add a note for this account..." rows="2"
                    oninput="this.nextElementSibling.textContent = this.value.length + ' / 200'"
                    class="input-field w-full px-2.5 py-1.5 bg-background border rounded text-foreground text-xs resize-y">${escapeHtml(account.note || "")}</textarea>
          <p class="text-[11px] text-muted-foreground mt-1 text-right">${(account.note || "").length} / 200</p>
        </div>
        <div class="flex gap-2">
          <button type="submit" class="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-${accentColor} text-${isAnyClaude ? "white" : "primary-foreground"} rounded-md hover:opacity-90 transition-opacity text-sm font-medium" aria-label="Save changes">
            ${icon("save", 14)}
            Save
          </button>
          <button type="button" hx-get="/api/account/${account.id}/cancel" hx-target="#account-${account.id}" hx-swap="outerHTML"
                  class="px-3 py-2 border rounded-md hover:bg-accent transition-colors text-sm font-medium" aria-label="Discard changes">
            Cancel
          </button>
        </div>
      </form>
    </div>`;
}


//  Alert Box

export function alertBox(type, message) {
  const styles = {
    success: { bg: "bg-emerald-500/10 border-emerald-500/20", text: "text-emerald-600 dark:text-emerald-400", ic: icon("check-circle", 16) },
    error:   { bg: "bg-red-500/10 border-red-500/20", text: "text-red-600 dark:text-red-400", ic: icon("alert-circle", 16) },
    warning: { bg: "bg-amber-500/10 border-amber-500/20", text: "text-amber-600 dark:text-amber-400", ic: icon("alert-triangle", 16) },
    info:    { bg: "bg-blue-500/10 border-blue-500/20", text: "text-blue-600 dark:text-blue-400", ic: icon("info", 16) },
  };
  const s = styles[type] || styles.info;
  return `
    <div class="${s.bg} border rounded-md p-3 fade-in">
      <div class="flex items-start gap-2 ${s.text}">
        <span class="flex-shrink-0 mt-px">${s.ic}</span>
        <p class="text-xs">${message}</p>
      </div>
    </div>`;
}


//  Settings Page

export function settingsPage(mysqlConfig, autoRefreshMinutes) {
  return `
    <div class="max-w-lg mx-auto space-y-5">
      <div>
        <h2 class="text-lg font-semibold flex items-center gap-2">
          ${icon("settings", 20, "text-primary")}
          Settings
        </h2>
        <p class="text-sm text-muted-foreground mt-0.5">Configure your monitoring preferences.</p>
      </div>

      <!-- Auto-Refresh Config -->
      <div class="bg-card border rounded-md overflow-hidden">
        <div class="p-4 border-b bg-muted/30">
          <h3 class="text-sm font-semibold flex items-center gap-2">
            ${icon("refresh", 16, "text-primary")}
            Auto-Refresh
          </h3>
          <p class="text-xs text-muted-foreground mt-0.5">Set how often all accounts are automatically refreshed.</p>
        </div>
        <form hx-post="/api/settings/auto-refresh" hx-target="#auto-refresh-result" hx-swap="innerHTML" class="p-4 space-y-3">
          <div>
            <label class="block text-xs font-medium mb-1">Interval (minutes)</label>
            <input type="number" name="minutes" value="${autoRefreshMinutes}" min="1" max="1440"
                   class="input-field w-full px-2.5 py-1.5 bg-background border rounded text-foreground text-xs">
            <p class="text-[11px] text-muted-foreground mt-1">Min: 1 minute · Max: 1440 minutes (24 hours)</p>
          </div>
          <button type="submit" class="w-full inline-flex items-center justify-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity text-sm font-medium">
            ${icon("save", 14)}
            Save & Apply
          </button>
        </form>
        <div id="auto-refresh-result" class="px-4 pb-4"></div>
      </div>

      <!-- MySQL Config -->
      <div class="bg-card border rounded-md overflow-hidden">
        <div class="p-4 border-b bg-muted/30">
          <h3 class="text-sm font-semibold flex items-center gap-2">
            ${icon("database", 16, "text-primary")}
            MySQL Backup
          </h3>
          <p class="text-xs text-muted-foreground mt-0.5">Sync data from SQLite to MySQL for backup.</p>
        </div>
        <form hx-post="/api/settings/mysql" hx-target="#mysql-result" hx-swap="innerHTML" class="p-4 space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-medium mb-1">Host</label>
              <input type="text" name="host" value="${mysqlConfig?.host || "127.0.0.1"}" 
                     class="input-field w-full px-2.5 py-1.5 bg-background border rounded text-foreground text-xs">
            </div>
            <div>
              <label class="block text-xs font-medium mb-1">Port</label>
              <input type="text" name="port" value="${mysqlConfig?.port || "3306"}" 
                     class="input-field w-full px-2.5 py-1.5 bg-background border rounded text-foreground text-xs">
            </div>
          </div>
          <div>
            <label class="block text-xs font-medium mb-1">Username</label>
            <input type="text" name="user" value="${mysqlConfig?.user || "root"}" 
                   class="input-field w-full px-2.5 py-1.5 bg-background border rounded text-foreground text-xs">
          </div>
          <div>
            <label class="block text-xs font-medium mb-1">Password</label>
            <input type="password" name="password" placeholder="${mysqlConfig?.password ? '••••••••' : ''}" 
                   class="input-field w-full px-2.5 py-1.5 bg-background border rounded text-foreground text-xs">
          </div>
          <div>
            <label class="block text-xs font-medium mb-1">Database</label>
            <input type="text" name="database" value="${mysqlConfig?.database || "copilot_quota"}" 
                   class="input-field w-full px-2.5 py-1.5 bg-background border rounded text-foreground text-xs">
          </div>
          <button type="submit" class="w-full inline-flex items-center justify-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity text-sm font-medium" aria-label="Save MySQL configuration">
            ${icon("save", 14)}
            Save Configuration
          </button>
        </form>
        <div id="mysql-result" class="px-4 pb-4"></div>
      </div>

      <!-- Sync -->
      <div class="bg-card border rounded-md overflow-hidden">
        <div class="p-4">
          <h3 class="text-sm font-semibold flex items-center gap-2 mb-1">
            ${icon("refresh", 16, "text-primary")}
            Data Sync
          </h3>
          <p class="text-xs text-muted-foreground mb-3">Push all local data to MySQL backup.</p>
          <button hx-post="/api/sync" hx-target="#sync-result" hx-swap="innerHTML"
                  class="w-full inline-flex items-center justify-center gap-2 px-3 py-2 border rounded-md hover:bg-accent transition-colors text-sm font-medium" data-tooltip="Push all local data to MySQL" aria-label="Push all local data to MySQL">
            ${icon("database", 14)}
            Sync to MySQL Now
          </button>
          <div id="sync-result" class="mt-3"></div>
        </div>
      </div>
    </div>`;
}
