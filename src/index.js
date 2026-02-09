import { Hono } from "hono";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import pages from "./routes/pages.js";
import api, { refreshAccount } from "./routes/api.js";
import { getAllAccounts, getSetting } from "./db/sqlite.js";
import { escapeHtml } from "./utils.js";

// === Auto-refresh config ===
function getAutoRefreshMinutes() {
  const dbVal = getSetting("auto_refresh_minutes");
  if (dbVal !== null && dbVal !== undefined) return Math.max(1, parseInt(dbVal) || 60);
  return Math.max(1, parseInt(process.env.AUTO_REFRESH_MINUTES || "60"));
}
const app = new Hono();

// Middleware
app.use("*", logger());

// Security headers
app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("X-XSS-Protection", "1; mode=block");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
});

// Cache headers middleware (must be before serveStatic)
app.use("/css/*", async (c, next) => {
  await next();
  c.header("Cache-Control", "public, max-age=86400");
});
app.use("/js/*", async (c, next) => {
  await next();
  c.header("Cache-Control", "public, max-age=86400");
});
app.use("/fonts/*", async (c, next) => {
  await next();
  c.header("Cache-Control", "public, max-age=604800");
});
app.use("/icons/*", async (c, next) => {
  await next();
  c.header("Cache-Control", "public, max-age=604800");
});
app.use("/manifest.json", async (c, next) => {
  await next();
  c.header("Cache-Control", "public, max-age=86400");
  c.header("Content-Type", "application/manifest+json");
});
app.use("/sw.js", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-cache");
  c.header("Content-Type", "application/javascript");
});
app.use("/favicon.ico", async (c, next) => {
  await next();
  c.header("Cache-Control", "public, max-age=604800");
});

// Static files
app.use("/css/*", serveStatic({ root: "./public" }));
app.use("/js/*", serveStatic({ root: "./public" }));
app.use("/fonts/*", serveStatic({ root: "./public" }));
app.use("/icons/*", serveStatic({ root: "./public" }));
app.use("/manifest.json", serveStatic({ root: "./public" }));
app.use("/sw.js", serveStatic({ root: "./public" }));
app.use("/favicon.ico", serveStatic({ root: "./public" }));

// Mount routes
app.route("/", pages);
app.route("/api", api);

// 404
app.notFound((c) => {
  return c.html(`
    <!DOCTYPE html>
    <html class="dark"><head><meta charset="UTF-8"><title>404</title>
    <link rel="stylesheet" href="/css/styles.css"></head>
    <body class="min-h-screen flex items-center justify-center">
      <div class="text-center">
        <h1 class="text-6xl font-bold mb-4 text-muted-foreground">404</h1>
        <p class="text-lg mb-6">Page not found</p>
        <a href="/" class="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90">Go Home</a>
      </div>
    </body></html>
  `, 404);
});

// Error handler
app.onError((err, c) => {
  console.error("Server error:", err);
  return c.html(`
    <!DOCTYPE html>
    <html class="dark"><head><meta charset="UTF-8"><title>Error</title>
    <link rel="stylesheet" href="/css/styles.css"></head>
    <body class="min-h-screen flex items-center justify-center">
      <div class="text-center">
        <h1 class="text-4xl font-bold mb-4 text-destructive">Error</h1>
        <p class="text-lg mb-6 text-muted-foreground">${escapeHtml(err.message)}</p>
        <a href="/" class="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90">Go Home</a>
      </div>
    </body></html>
  `, 500);
});

// === Scheduled auto-refresh ===
let autoRefreshTimer = null;

function getAutoRefreshInterval() {
  return getAutoRefreshMinutes() * 60 * 1000;
}

async function autoRefreshAll() {
  console.log("[Auto-refresh] Starting scheduled refresh...");
  const accounts = getAllAccounts();
  for (const acc of accounts) {
    if (acc.is_paused) {
      console.log(`[Auto-refresh] ⏸ ${acc.github_username} (paused, skipped)`);
      continue;
    }
    try {
      await refreshAccount(acc);
      console.log(`[Auto-refresh] ✓ ${acc.github_username}`);
    } catch (err) {
      console.error(`[Auto-refresh] ✗ ${acc.github_username}: ${err.message}`);
    }
  }
  console.log("[Auto-refresh] Complete.");
}

function startAutoRefresh() {
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  const interval = getAutoRefreshInterval();
  autoRefreshTimer = setInterval(autoRefreshAll, interval);
  console.log(`[Auto-refresh] Scheduled every ${getAutoRefreshMinutes()} minute(s)`);
}

startAutoRefresh();
export { getAutoRefreshMinutes, startAutoRefresh };

// === Start server ===
const PORT = parseInt(process.env.PORT || "3000");

console.log(`
╔══════════════════════════════════════════════╗
║                   KUOTA                      ║
║   Copilot & Claude Code Quota Monitor        ║
║                                              ║
║   http://localhost:${PORT}                      ║
║                                              ║
║   Auto-refresh: every ${String(getAutoRefreshMinutes()).padEnd(2)} min               ║
║   Press Ctrl+C to stop                       ║
╚══════════════════════════════════════════════╝
`);

export default {
  port: PORT,
  fetch: app.fetch,
};
