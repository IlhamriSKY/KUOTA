import { Hono } from "hono";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import pages from "./routes/pages.js";
import api, { refreshAccount } from "./routes/api.js";
import { getAllAccounts, getSetting } from "./db/sqlite.js";
import { escapeHtml, validatePort, sanitizeError, getAppRoot } from "./utils.js";
import { encrypt, decrypt } from "./services/crypto.js";

// Set CWD to app root (important for static file serving in compiled exe)
try { process.chdir(getAppRoot()); } catch {}

// Startup validation
async function validateStartup() {
  const errors = [];

  try {
    // Validate encryption
    const testData = "test_encryption_" + Date.now();
    const encrypted = encrypt(testData);
    const decrypted = decrypt(encrypted);

    if (decrypted !== testData) {
      errors.push("Encryption validation failed: decrypted data does not match original");
    }
  } catch (err) {
    errors.push(`Encryption validation failed: ${err.message}`);
  }

  try {
    // Validate database access
    getAllAccounts();
  } catch (err) {
    errors.push(`Database validation failed: ${err.message}`);
  }

  // Validate PORT
  const portEnv = process.env.PORT || "3000";
  if (!validatePort(portEnv)) {
    errors.push(`Invalid PORT value: ${portEnv}. Must be between 1-65535`);
  }

  if (errors.length > 0) {
    console.error("\nStartup validation failed:\n");
    errors.forEach(err => console.error(`  - ${err}`));
    console.error("\nPlease fix these issues before starting the server.\n");
    process.exit(1);
  }

  console.log("[Startup] Validation passed");
}

// Run validation before starting
await validateStartup();

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
const CACHE_LONG = "public, max-age=604800";  // 1 week
const CACHE_SHORT = "public, max-age=86400";  // 1 day

for (const path of ["/css/*", "/js/*"]) {
  app.use(path, async (c, next) => { await next(); c.header("Cache-Control", CACHE_SHORT); });
}
for (const path of ["/fonts/*", "/icons/*", "/favicon.ico"]) {
  app.use(path, async (c, next) => { await next(); c.header("Cache-Control", CACHE_LONG); });
}
app.use("/manifest.json", async (c, next) => {
  await next();
  c.header("Cache-Control", CACHE_SHORT);
  c.header("Content-Type", "application/manifest+json");
});
app.use("/sw.js", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-cache");
  c.header("Content-Type", "application/javascript");
});

// Static files
for (const path of ["/css/*", "/js/*", "/fonts/*", "/icons/*", "/manifest.json", "/sw.js", "/favicon.ico"]) {
  app.use(path, serveStatic({ root: "./public" }));
}

// Health check endpoints
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.get("/ready", (c) => {
  try {
    // Check database
    getAllAccounts();

    // Check encryption
    const test = encrypt("test");
    decrypt(test);

    return c.json({
      ready: true,
      timestamp: new Date().toISOString(),
      checks: {
        database: "ok",
        encryption: "ok",
      }
    });
  } catch (err) {
    return c.json({
      ready: false,
      error: sanitizeError(err.message),
      timestamp: new Date().toISOString(),
    }, 503);
  }
});

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

let autoRefreshTimer = null;

function getAutoRefreshInterval() {
  return getAutoRefreshMinutes() * 60 * 1000;
}

async function autoRefreshAll() {
  console.log("[Auto-refresh] Starting scheduled refresh...");
  const accounts = getAllAccounts();
  for (const acc of accounts) {
    if (acc.is_paused) {
      console.log(`[Auto-refresh] ${acc.github_username} (paused, skipped)`);
      continue;
    }
    try {
      await refreshAccount(acc);
      console.log(`[Auto-refresh] ${acc.github_username} done`);
    } catch (err) {
      console.error(`[Auto-refresh] ${acc.github_username} failed: ${err.message}`);
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

let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n[${signal}] Shutting down gracefully...`);

  // Clear auto-refresh timer
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    console.log("[Shutdown] Auto-refresh timer cleared");
  }

  // Close MySQL pool if exists
  try {
    const { closeMysqlPool } = await import("./db/mysql.js");
    await closeMysqlPool();
    console.log("[Shutdown] MySQL connections closed");
  } catch (err) {
    // MySQL module might not export closeMysqlPool, that's ok
  }

  console.log("[Shutdown] Cleanup complete");
  process.exit(0);
}

// Handle shutdown signals
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught errors
process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught exception:", sanitizeError(err.message));
  console.error(err.stack);
  gracefulShutdown("UNCAUGHT_EXCEPTION");
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("[FATAL] Unhandled rejection at:", promise);
  console.error("Reason:", sanitizeError(String(reason)));
  gracefulShutdown("UNHANDLED_REJECTION");
});

const PORT = validatePort(process.env.PORT || "3000") || 3000;

const serverUrl = `http://localhost:${PORT}`;

// Explicitly start server (works both as main entry and when imported by subprocess)
Bun.serve({
  port: PORT,
  fetch: app.fetch,
});

console.log(`\nKUOTA - Copilot & Claude Code Quota Monitor\n${'='.repeat(44)}\n  ${serverUrl}\n  Auto-refresh: every ${getAutoRefreshMinutes()} min\n  Press Ctrl+C to stop\n`);
