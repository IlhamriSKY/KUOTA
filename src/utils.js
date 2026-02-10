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

/**
 * Validate email format.
 * @param {string} email - Email to validate
 * @returns {string|null} Valid email or null
 */
export function validateEmail(email) {
  if (!email || typeof email !== "string") return null;
  const trimmed = email.trim();
  // Basic email validation regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(trimmed) ? trimmed : null;
}

/**
 * Validate GitHub organization name format.
 * GitHub org names: 1-39 chars, alphanumeric + hyphens, cannot start/end with hyphen
 * @param {string} org - Organization name
 * @returns {string|null} Valid org name or null
 */
export function validateOrgName(org) {
  if (!org || typeof org !== "string") return null;
  const trimmed = org.trim();
  // GitHub org name constraints
  const orgRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
  return orgRegex.test(trimmed) ? trimmed : null;
}

/**
 * Validate GitHub username format.
 * GitHub usernames: alphanumeric + hyphens, max 39 chars
 * @param {string} username - Username
 * @returns {string|null} Valid username or null
 */
export function validateUsername(username) {
  if (!username || typeof username !== "string") return null;
  const trimmed = username.trim();
  const usernameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
  return usernameRegex.test(trimmed) ? trimmed : null;
}

/**
 * Validate and sanitize note text.
 * @param {string} note - Note text
 * @param {number} maxLength - Maximum length (default 200)
 * @returns {string} Sanitized note
 */
export function validateNote(note, maxLength = 200) {
  if (!note || typeof note !== "string") return "";
  return note.trim().slice(0, maxLength);
}

/**
 * Validate port number.
 * @param {string|number} port - Port number
 * @returns {number|null} Valid port or null
 */
export function validatePort(port) {
  const p = parseInt(port, 10);
  if (!Number.isFinite(p) || p < 1 || p > 65535) return null;
  return p;
}

/**
 * Sanitize error message to prevent sensitive data exposure.
 * Removes tokens, keys, passwords, and other sensitive patterns.
 * @param {string} message - Error message
 * @returns {string} Sanitized message
 */
export function sanitizeError(message) {
  if (!message || typeof message !== "string") return "An error occurred";

  let sanitized = message;

  // Remove tokens (ghp_, gho_, sk-ant-, Bearer, etc.)
  sanitized = sanitized.replace(/\b(ghp|gho|ghs|github_pat)_[a-zA-Z0-9_]+/gi, "[TOKEN_REDACTED]");
  sanitized = sanitized.replace(/\bsk-ant-[a-zA-Z0-9_-]+/gi, "[API_KEY_REDACTED]");
  sanitized = sanitized.replace(/Bearer\s+[a-zA-Z0-9._-]+/gi, "Bearer [REDACTED]");

  // Remove email addresses
  sanitized = sanitized.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, "[EMAIL_REDACTED]");

  // Remove password-like patterns
  sanitized = sanitized.replace(/password[=:]\s*['"]?[^'"\s]+['"]?/gi, "password=[REDACTED]");

  // Remove authorization headers
  sanitized = sanitized.replace(/authorization:\s*['"]?[^'"\s]+['"]?/gi, "authorization: [REDACTED]");

  // Remove x-api-key headers
  sanitized = sanitized.replace(/x-api-key:\s*['"]?[^'"\s]+['"]?/gi, "x-api-key: [REDACTED]");

  return sanitized;
}

/**
 * Create safe error response for user display.
 * @param {Error|string} error - Error object or message
 * @param {string} fallback - Fallback message if error cannot be parsed
 * @returns {string} Safe error message
 */
export function getSafeErrorMessage(error, fallback = "An error occurred") {
  if (!error) return fallback;

  const message = typeof error === "string" ? error : error.message || fallback;
  return sanitizeError(message);
}

/**
 * Toggle account dropdown menu visibility.
 * @param {number} accountId - Account ID
 */
export function toggleAccountMenu(accountId) {
  const menu = document.getElementById(`menu-${accountId}`);
  if (!menu) return;

  const isHidden = menu.classList.contains("hidden");

  // Close all other menus first
  document.querySelectorAll(".account-menu-dropdown").forEach(m => {
    if (m !== menu) m.classList.add("hidden");
  });

  // Toggle current menu
  if (isHidden) {
    menu.classList.remove("hidden");
  } else {
    menu.classList.add("hidden");
  }
}

// Close dropdown when clicking outside
if (typeof document !== "undefined") {
  document.addEventListener("click", (e) => {
    // If click is not on a menu button or inside a menu
    if (!e.target.closest(".account-menu")) {
      document.querySelectorAll(".account-menu-dropdown").forEach(menu => {
        menu.classList.add("hidden");
      });
    }
  });
}
