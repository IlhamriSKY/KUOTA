/**
 * KUOTA Desktop Entry Point
 * 
 * Opens the app in a native webview window (Edge WebView2 on Windows)
 * instead of a browser tab.
 * 
 * Architecture (compiled mode):
 *   kuota.exe (main)  →  spawns kuota.exe with KUOTA_SERVER=1  →  HTTP server
 *                     →  opens native webview window
 * 
 * Architecture (dev mode):
 *   bun desktop.js (main)  →  spawns bun desktop-worker.js  →  HTTP server
 *                          →  opens native webview window
 */
import { dirname, join } from "path";
import { spawn } from "child_process";

const exePath = process.execPath || process.argv[0];
const appDir = dirname(exePath);
const isCompiledExe = exePath.endsWith(".exe") && !exePath.includes("bun");

// ── Server subprocess mode ──────────────────────────────────────────
// When KUOTA_SERVER=1, we act as the HTTP server (no webview)
if (process.env.KUOTA_SERVER === "1") {
  await import("./index.js");
  // Keep alive - server runs via Bun.serve() in index.js
} else {
  // ── Main process mode ───────────────────────────────────────────
  // Spawn server subprocess, then open native webview

  const PORT = process.env.PORT || "3000";
  const serverUrl = `http://localhost:${PORT}`;

  // Spawn server as a subprocess
  let serverProcess;
  if (isCompiledExe) {
    // Compiled exe: spawn self with KUOTA_SERVER=1
    serverProcess = spawn(exePath, [], {
      env: { ...process.env, KUOTA_SERVER: "1", PORT },
      stdio: "ignore",
      detached: false,
    });
  } else {
    // Dev mode: spawn bun with desktop-worker.js
    const workerPath = join(import.meta.dir, "desktop-worker.js");
    serverProcess = spawn(process.execPath, [workerPath], {
      env: { ...process.env, PORT },
      stdio: "ignore",
      detached: false,
    });
  }

  serverProcess.on("error", (err) => {
    console.error("[Desktop] Server process error:", err.message);
  });

  // Set webview DLL path BEFORE importing webview-bun
  // (webview-bun loads the DLL at import time via dlopen)
  if (isCompiledExe) {
    process.env.WEBVIEW_PATH = process.env.WEBVIEW_PATH || join(appDir, "libwebview.dll");
  }

  // Dynamic import so WEBVIEW_PATH is set before the DLL loads
  const { Webview, SizeHint } = await import("webview-bun");

  // Wait for server to actually be listening by polling HTTP
  async function waitForServer(url, maxAttempts = 60) {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const res = await fetch(url + "/health", { signal: AbortSignal.timeout(500) });
        if (res.ok) return true;
      } catch {
        // Server not ready yet
      }
      await new Promise(r => setTimeout(r, 500));
    }
    return false;
  }

  const ready = await waitForServer(serverUrl);
  if (!ready) {
    console.error("[Desktop] Server failed to start after 30s");
    serverProcess.kill();
    process.exit(1);
  }

  console.log(`[Desktop] Opening KUOTA at ${serverUrl}`);

  // Create native webview window
  const webview = new Webview(false, {
    width: 1280,
    height: 850,
    hint: SizeHint.NONE,
  });

  webview.title = "KUOTA - Copilot & Claude Code Quota Monitor";

  // Set window icon via Win32 API (HWND + SendMessage WM_SETICON)
  try {
    const icoPath = isCompiledExe
      ? join(appDir, "app-icon.ico")
      : join(import.meta.dir, "..", "public", "app-icon.ico");

    if ((await import("fs")).existsSync(icoPath)) {
      const { dlopen, ptr, FFIType } = await import("bun:ffi");
      const user32 = dlopen("user32.dll", {
        SendMessageW: { args: [FFIType.pointer, FFIType.u32, FFIType.pointer, FFIType.pointer], returns: FFIType.pointer },
        LoadImageW:   { args: [FFIType.pointer, FFIType.pointer, FFIType.u32, FFIType.i32, FFIType.i32, FFIType.u32], returns: FFIType.pointer },
      });

      const WM_SETICON = 0x0080;
      const ICON_SMALL = 0;
      const ICON_BIG = 1;
      const IMAGE_ICON = 1;
      const LR_LOADFROMFILE = 0x0010;

      // Encode ICO path as UTF-16LE for LoadImageW
      const pathBuf = Buffer.from(icoPath + "\0", "utf16le");
      const hwnd = webview.unsafeWindowHandle;

      // Load small icon (16x16) and big icon (32x32)
      const hIconSmall = user32.symbols.LoadImageW(null, ptr(pathBuf), IMAGE_ICON, 16, 16, LR_LOADFROMFILE);
      const hIconBig   = user32.symbols.LoadImageW(null, ptr(pathBuf), IMAGE_ICON, 32, 32, LR_LOADFROMFILE);

      if (hIconSmall) user32.symbols.SendMessageW(hwnd, WM_SETICON, ICON_SMALL, hIconSmall);
      if (hIconBig)   user32.symbols.SendMessageW(hwnd, WM_SETICON, ICON_BIG, hIconBig);

      console.log("[Desktop] Window icon set");
    }
  } catch (e) {
    console.log("[Desktop] Icon skipped:", e.message);
  }

  webview.navigate(serverUrl);

  // Run main event loop (blocks until window is closed)
  webview.run();

  // Clean up when window is closed
  console.log("[Desktop] Window closed, shutting down...");
  serverProcess.kill();
  process.exit(0);
}
