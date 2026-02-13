import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { eq, desc, asc, sql, getTableColumns } from "drizzle-orm";
import { join } from "path";
import { mkdirSync, existsSync, readFileSync } from "fs";
import { accounts, usageHistory, usageDetail, appSettings } from "./schema.js";
import { getAppRoot } from "../utils.js";

// Database setup ---
const APP_ROOT = getAppRoot();
const DATA_DIR = join(APP_ROOT, "data");
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

const sqlite = new Database(join(DATA_DIR, "quota.db"), { create: true });
sqlite.exec("PRAGMA journal_mode = WAL");
sqlite.exec("PRAGMA foreign_keys = ON");

const db = drizzle(sqlite);

// Custom migration runner ---
// Drizzle's built-in migrate() generates CREATE TABLE without IF NOT EXISTS,
// which fails on existing databases. This custom runner patches the SQL at runtime.
function runMigrations() {
  const migrationsFolder = join(APP_ROOT, "drizzle");
  const journalPath = join(migrationsFolder, "meta/_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf-8"));

  // Ensure migration tracking table exists
  sqlite.exec(`CREATE TABLE IF NOT EXISTS __drizzle_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hash TEXT NOT NULL,
    created_at NUMERIC
  )`);

  const applied = new Set(
    sqlite.query("SELECT hash FROM __drizzle_migrations").all().map(r => r.hash)
  );

  for (const entry of journal.entries) {
    const sqlPath = join(migrationsFolder, `${entry.tag}.sql`);
    let migrationSQL = readFileSync(sqlPath, "utf-8");

    // Compute hash from original content (same as Drizzle uses internally)
    const hash = new Bun.CryptoHasher("sha256").update(migrationSQL).digest("hex");

    if (applied.has(hash)) continue;

    // Patch: add IF NOT EXISTS to CREATE TABLE and CREATE UNIQUE INDEX
    migrationSQL = migrationSQL
      .replace(/CREATE TABLE `/g, "CREATE TABLE IF NOT EXISTS `")
      .replace(/CREATE UNIQUE INDEX `/g, "CREATE UNIQUE INDEX IF NOT EXISTS `")
      .replace(/CREATE INDEX `/g, "CREATE INDEX IF NOT EXISTS `");

    // Split on Drizzle's statement breakpoint and execute each
    const statements = migrationSQL.split("--> statement-breakpoint").map(s => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      sqlite.exec(stmt);
    }

    sqlite.query("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)").run(hash, Date.now());
  }
}

runMigrations();

// Schema migrations (additive) ---
// Add new columns safely for existing databases
try { sqlite.exec("ALTER TABLE accounts ADD COLUMN login_method TEXT DEFAULT ''"); } catch {}
try { sqlite.exec("ALTER TABLE accounts ADD COLUMN note TEXT DEFAULT ''"); } catch {}
try { sqlite.exec("ALTER TABLE accounts ADD COLUMN is_paused INTEGER DEFAULT 0"); } catch {}
try { sqlite.exec("ALTER TABLE accounts ADD COLUMN billing_org TEXT DEFAULT ''"); } catch {}
try { sqlite.exec("ALTER TABLE accounts ADD COLUMN last_activity_at TEXT DEFAULT ''"); } catch {}
try { sqlite.exec("ALTER TABLE accounts ADD COLUMN last_activity_editor TEXT DEFAULT ''"); } catch {}
try { sqlite.exec("ALTER TABLE accounts ADD COLUMN reset_date TEXT DEFAULT ''"); } catch {}
try { sqlite.exec("ALTER TABLE accounts ADD COLUMN github_email TEXT DEFAULT ''"); } catch {}


// Constants ---
export const PLAN_LIMITS = { free: 50, pro: 300, pro_plus: 1500, business: 300, enterprise: 1000 };
export const CLAUDE_CODE_BUDGETS = { api: 100, pro: 20, max: 100, team: 150, enterprise: 500 };

// Allowed update columns (derived from schema, excluding auto-managed fields) ---
const AUTO_MANAGED = new Set(["id", "created_at", "updated_at"]);
const ALLOWED_ACCOUNT_COLUMNS = new Set(
  Object.keys(getTableColumns(accounts)).filter(k => !AUTO_MANAGED.has(k))
);

// Account CRUD ---
export function getAllAccounts() {
  return db.select().from(accounts).orderBy(desc(accounts.is_favorite), asc(accounts.is_paused), asc(accounts.id)).all();
}

export function getAccountById(id) {
  return db.select().from(accounts).where(eq(accounts.id, id)).get();
}

export function getAccountByUsername(username) {
  return db.select().from(accounts).where(eq(accounts.github_username, username)).get();
}

export function createAccount({ github_username, avatar_url, display_name, oauth_token, pat_token, copilot_plan }) {
  return db.insert(accounts).values({
    github_username,
    avatar_url: avatar_url || "",
    display_name: display_name || "",
    oauth_token: oauth_token || "",
    pat_token: pat_token || "",
    copilot_plan: copilot_plan || "pro",
  }).run();
}

export function toggleFavorite(id) {
  db.update(accounts)
    .set({
      is_favorite: sql`CASE WHEN ${accounts.is_favorite} = 1 THEN 0 ELSE 1 END`,
      updated_at: sql`datetime('now')`,
    })
    .where(eq(accounts.id, id))
    .run();
  return db.select({ is_favorite: accounts.is_favorite }).from(accounts).where(eq(accounts.id, id)).get();
}

export function togglePause(id) {
  db.update(accounts)
    .set({
      is_paused: sql`CASE WHEN ${accounts.is_paused} = 1 THEN 0 ELSE 1 END`,
      updated_at: sql`datetime('now')`,
    })
    .where(eq(accounts.id, id))
    .run();
  return db.select({ is_paused: accounts.is_paused }).from(accounts).where(eq(accounts.id, id)).get();
}

export function updateAccount(id, fields) {
  const updateData = {};
  for (const [k, v] of Object.entries(fields)) {
    if (!ALLOWED_ACCOUNT_COLUMNS.has(k)) continue;
    updateData[k] = v;
  }
  if (Object.keys(updateData).length === 0) return;
  updateData.updated_at = sql`datetime('now')`;
  db.update(accounts).set(updateData).where(eq(accounts.id, id)).run();
}

export function deleteAccount(id) {
  db.delete(accounts).where(eq(accounts.id, id)).run();
}

// Usage History ---
export function upsertUsageHistory({ account_id, year, month, gross_quantity, included_quantity, net_amount, plan_limit, percentage, sessions, lines_added, lines_removed, commits, pull_requests, session_usage_pct, weekly_usage_pct, weekly_reset_at, extra_usage_enabled, extra_usage_spent, extra_usage_limit, extra_usage_balance, extra_usage_reset_at }) {
  const values = {
    account_id, year, month, gross_quantity, included_quantity, net_amount, plan_limit, percentage,
    sessions: sessions || 0, lines_added: lines_added || 0, lines_removed: lines_removed || 0,
    commits: commits || 0, pull_requests: pull_requests || 0,
    session_usage_pct: session_usage_pct || 0, weekly_usage_pct: weekly_usage_pct || 0,
    weekly_reset_at: weekly_reset_at || "", extra_usage_enabled: extra_usage_enabled ? 1 : 0,
    extra_usage_spent: extra_usage_spent || 0, extra_usage_limit: extra_usage_limit || 0,
    extra_usage_balance: extra_usage_balance || 0, extra_usage_reset_at: extra_usage_reset_at || "",
    fetched_at: sql`datetime('now', 'localtime')`,
  };

  // Build conflict update set dynamically - excludes target columns
  const targetKeys = new Set(["account_id", "year", "month"]);
  const conflictSet = {};
  for (const key of Object.keys(values)) {
    if (targetKeys.has(key)) continue;
    conflictSet[key] = sql.raw(`excluded.${key}`);
  }

  return db.insert(usageHistory).values(values)
    .onConflictDoUpdate({ target: [usageHistory.account_id, usageHistory.year, usageHistory.month], set: conflictSet })
    .run();
}

export function getLatestUsage(account_id) {
  return db.select().from(usageHistory)
    .where(eq(usageHistory.account_id, account_id))
    .orderBy(desc(usageHistory.year), desc(usageHistory.month))
    .limit(1)
    .get();
}

// Usage Detail ---
export function clearUsageDetails(history_id) {
  db.delete(usageDetail).where(eq(usageDetail.history_id, history_id)).run();
}

export function insertUsageDetail({ history_id, model, quantity, price_per_unit, net_amount, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens }) {
  db.insert(usageDetail).values({
    history_id, model, quantity, price_per_unit, net_amount,
    input_tokens: input_tokens || 0, output_tokens: output_tokens || 0,
    cache_read_tokens: cache_read_tokens || 0, cache_creation_tokens: cache_creation_tokens || 0,
  }).run();
}

export function getUsageDetails(history_id) {
  return db.select().from(usageDetail).where(eq(usageDetail.history_id, history_id)).all();
}

// Settings ---
export function getSetting(key) {
  const row = db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, key)).get();
  return row ? row.value : null;
}

export function setSetting(key, value) {
  db.insert(appSettings).values({ key, value }).onConflictDoUpdate({
    target: appSettings.key,
    set: { value: sql`excluded.value` },
  }).run();
}

// Strict mode (privacy) ---
export function getStrictMode() {
  const val = getSetting("strict_mode");
  // Default to true if not set
  if (val === null || val === undefined) return true;
  return val === "true" || val === "1";
}

// Export all data for sync ---
export function getAllData() {
  return {
    accounts: db.select().from(accounts).all(),
    usage_history: db.select().from(usageHistory).all(),
    usage_detail: db.select().from(usageDetail).all(),
    app_settings: db.select().from(appSettings).all(),
  };
}

