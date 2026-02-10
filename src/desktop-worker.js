/**
 * KUOTA Server subprocess.
 * Spawned by desktop.js (dev mode) to run the HTTP server
 * while the main process hosts the native webview window.
 */

// Import the server entry point (starts Hono server via Bun.serve())
await import("./index.js");
