#!/usr/bin/env bun
/**
 * Build KUOTA as a standalone .exe
 * 
 * Double-click kuota.exe → native app window opens (no browser needed)
 * 
 * Uses Edge WebView2 (built into Windows 10/11) for the native window.
 * Uses Bun's --compile with --windows-hide-console and --windows-icon.
 */

import { join } from "path";
import { existsSync, mkdirSync, cpSync, rmSync } from "fs";

const ROOT = join(import.meta.dir, "..");
const DIST = join(ROOT, "dist");
const FRESH = process.argv.includes("--fresh");

console.log("KUOTA - Build Standalone EXE");
console.log("=".repeat(40));
if (FRESH) console.log("   Mode: FRESH (no database, no secrets)");
console.log();

// Step 1: Run normal build
console.log("Step 1: Building assets (CSS, icons, fonts)...");
const buildResult = Bun.spawnSync(["bun", "run", "build"], { cwd: ROOT, stdio: ["inherit", "inherit", "inherit"] });
if (buildResult.exitCode !== 0) {
  console.error("Asset build failed");
  process.exit(1);
}
console.log("Assets built\n");

// Step 2: Clean & create dist folder
console.log("Step 2: Preparing dist folder...");
if (existsSync(DIST)) rmSync(DIST, { recursive: true });
mkdirSync(DIST, { recursive: true });
console.log("dist/ ready\n");

// Step 3: Compile to exe with native Windows flags
console.log("Step 3: Compiling kuota.exe...");
const compileArgs = [
  "bun", "build",
  "--compile",
  "--target", "bun-windows-x64",
  "--minify",
  "--windows-hide-console",
  `--windows-title=KUOTA`,
  `--windows-description=Copilot & Claude Code Quota Monitor`,
  `--windows-version=1.0.0.0`,
  "--outfile", join(DIST, "kuota.exe"),
  join(ROOT, "src/desktop.js"),
];

console.log("   Flags: --minify --windows-hide-console");
const compileResult = Bun.spawnSync(compileArgs, { cwd: ROOT, stdio: ["inherit", "inherit", "inherit"] });

if (compileResult.exitCode !== 0) {
  console.error("Compilation failed");
  process.exit(1);
}
console.log("kuota.exe compiled\n");

// Step 3b: Set exe icon and GUI subsystem
console.log("Step 3b: Setting exe icon and GUI subsystem...");
try {
  const exePathFull = join(DIST, "kuota.exe");
  const icoPath = join(ROOT, "public/app-icon.ico");

  // Use rcedit to set the exe icon (replaces Bun's default icon)
  if (existsSync(icoPath)) {
    const { rcedit } = await import("rcedit");
    await rcedit(exePathFull, {
      icon: icoPath,
      "version-string": {
        ProductName: "KUOTA",
        FileDescription: "Copilot & Claude Code Quota Monitor",
        CompanyName: "KUOTA",
        LegalCopyright: "MIT License",
      },
      "file-version": "1.0.0.0",
      "product-version": "1.0.0.0",
    });
    console.log("   Icon set via rcedit");
  }

  // Ensure PE subsystem is GUI (no console flash on double-click)
  const { readFileSync, writeFileSync } = await import("fs");
  const exeBuffer = readFileSync(exePathFull);
  const peOffset = exeBuffer.readUInt32LE(60);
  if (exeBuffer.readUInt32LE(peOffset) === 0x00004550) {
    const subsystemOffset = peOffset + 0x5c;
    const current = exeBuffer.readUInt16LE(subsystemOffset);
    if (current !== 2) {
      exeBuffer.writeUInt16LE(2, subsystemOffset); // IMAGE_SUBSYSTEM_WINDOWS_GUI
      writeFileSync(exePathFull, exeBuffer);
      console.log("   Patched subsystem to GUI (was " + current + ")");
    } else {
      console.log("   Already GUI subsystem");
    }
  }
} catch (e) {
  console.log("   Icon/PE patch error:", e.message);
}
console.log();

// Step 4: Copy runtime files
console.log("Step 4: Copying runtime files...");

cpSync(join(ROOT, "public"), join(DIST, "public"), { recursive: true });
console.log("   public/");

cpSync(join(ROOT, "drizzle"), join(DIST, "drizzle"), { recursive: true });
console.log("   drizzle/");

if (FRESH) {
  // Fresh build: empty data folder, no secrets (app generates on first run)
  mkdirSync(join(DIST, "data"), { recursive: true });
  console.log("   data/ (empty - fresh)");
  console.log("   .secret (skipped - will auto-generate)");
} else {
  const dataDir = join(ROOT, "data");
  if (existsSync(dataDir)) {
    cpSync(dataDir, join(DIST, "data"), { recursive: true });
    console.log("   data/ (existing database copied)");
  } else {
    mkdirSync(join(DIST, "data"), { recursive: true });
    console.log("   data/ (empty)");
  }

  const secretFile = join(ROOT, ".secret");
  if (existsSync(secretFile)) {
    cpSync(secretFile, join(DIST, ".secret"));
    console.log("   .secret");
  }
}

const webviewDll = join(ROOT, "node_modules/webview-bun/build/libwebview.dll");
if (existsSync(webviewDll)) {
  cpSync(webviewDll, join(DIST, "libwebview.dll"));
  console.log("   libwebview.dll");
} else {
  console.error("libwebview.dll not found!");
  process.exit(1);
}

const appIcon = join(ROOT, "public/app-icon.ico");
if (existsSync(appIcon)) {
  cpSync(appIcon, join(DIST, "app-icon.ico"));
  console.log("   app-icon.ico");
}

console.log("Done\n");

console.log("=".repeat(40));
console.log("BUILD COMPLETE!");
console.log("=".repeat(40));
console.log();
console.log("Double-click kuota.exe to launch");
console.log();
console.log("dist/");
console.log("  kuota.exe       (app + hidden console)");
console.log("  libwebview.dll  (webview runtime)");
console.log("  public/         (static assets)");
console.log("  drizzle/        (db migrations)");
console.log(`  data/           ${FRESH ? '(empty)' : '(database)'}`);
if (FRESH) {
console.log();
console.log("Fresh build - no user data included");
}
