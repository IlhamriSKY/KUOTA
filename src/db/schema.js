import { sqliteTable, text, integer, real, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// --- Accounts ---
export const accounts = sqliteTable("accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  github_username: text("github_username").notNull().unique(),
  avatar_url: text("avatar_url").default(""),
  display_name: text("display_name").default(""),
  oauth_token: text("oauth_token").default(""),
  pat_token: text("pat_token").default(""),
  copilot_plan: text("copilot_plan").default("pro"),
  is_favorite: integer("is_favorite").default(0),
  account_type: text("account_type").default("copilot"),
  claude_user_email: text("claude_user_email").default(""),
  claude_plan: text("claude_plan").default(""),
  monthly_budget: real("monthly_budget").default(0),
  claude_org_id: text("claude_org_id").default(""),
  claude_cf_clearance: text("claude_cf_clearance").default(""),
  claude_token_expires_at: integer("claude_token_expires_at").default(0),
  github_orgs: text("github_orgs").default(""),
  billing_org: text("billing_org").default(""),
  login_method: text("login_method").default(""),
  note: text("note").default(""),
  is_paused: integer("is_paused").default(0),
  created_at: text("created_at").default(sql`(datetime('now'))`),
  updated_at: text("updated_at").default(sql`(datetime('now'))`),
});

// --- Usage History ---
export const usageHistory = sqliteTable("usage_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  account_id: integer("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  gross_quantity: real("gross_quantity").default(0),
  included_quantity: real("included_quantity").default(0),
  net_amount: real("net_amount").default(0),
  plan_limit: integer("plan_limit").default(300),
  percentage: real("percentage").default(0),
  sessions: integer("sessions").default(0),
  lines_added: integer("lines_added").default(0),
  lines_removed: integer("lines_removed").default(0),
  commits: integer("commits").default(0),
  pull_requests: integer("pull_requests").default(0),
  session_usage_pct: real("session_usage_pct").default(0),
  weekly_usage_pct: real("weekly_usage_pct").default(0),
  weekly_reset_at: text("weekly_reset_at").default(""),
  extra_usage_enabled: integer("extra_usage_enabled").default(0),
  extra_usage_spent: real("extra_usage_spent").default(0),
  extra_usage_limit: real("extra_usage_limit").default(0),
  extra_usage_balance: real("extra_usage_balance").default(0),
  extra_usage_reset_at: text("extra_usage_reset_at").default(""),
  fetched_at: text("fetched_at").default(sql`(datetime('now'))`),
}, (table) => ({
  accountPeriodUnique: uniqueIndex("uq_account_period").on(table.account_id, table.year, table.month),
}));

// --- Usage Detail ---
export const usageDetail = sqliteTable("usage_detail", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  history_id: integer("history_id").notNull().references(() => usageHistory.id, { onDelete: "cascade" }),
  model: text("model").default(""),
  quantity: real("quantity").default(0),
  price_per_unit: real("price_per_unit").default(0.04),
  net_amount: real("net_amount").default(0),
  input_tokens: integer("input_tokens").default(0),
  output_tokens: integer("output_tokens").default(0),
  cache_read_tokens: integer("cache_read_tokens").default(0),
  cache_creation_tokens: integer("cache_creation_tokens").default(0),
});

// --- App Settings ---
export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").default(""),
});
