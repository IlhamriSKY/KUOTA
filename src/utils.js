/**
 * Escape special HTML characters to prevent XSS.
 * @param {string} str - Untrusted string
 * @returns {string} HTML-safe string
 */
export function escapeHtml(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Validate that a parsed integer is a finite number.
 * @param {string} value - Raw string to parse
 * @returns {number|null} Parsed integer or null if invalid
 */
export function parseId(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Allowed copilot plan values */
const VALID_PLANS = ["free", "pro", "pro_plus", "business", "enterprise"];

/**
 * Validate copilot plan value.
 * @param {string} plan
 * @returns {string|null} Valid plan or null
 */
export function validatePlan(plan) {
  return VALID_PLANS.includes(plan) ? plan : null;
}

/** Allowed Claude Code plan values */
const VALID_CLAUDE_PLANS = ["api", "pro", "max", "team", "enterprise"];

/**
 * Validate Claude Code plan value.
 * @param {string} plan
 * @returns {string|null} Valid plan or null
 */
export function validateClaudePlan(plan) {
  return VALID_CLAUDE_PLANS.includes(plan) ? plan : null;
}

/**
 * Format a number with K/M suffix.
 * @param {number} n
 * @returns {string}
 */
export function formatNumber(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(Math.round(n));
}
