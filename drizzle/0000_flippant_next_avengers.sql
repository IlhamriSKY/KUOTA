CREATE TABLE IF NOT EXISTS `accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`github_username` text NOT NULL,
	`avatar_url` text DEFAULT '',
	`display_name` text DEFAULT '',
	`oauth_token` text DEFAULT '',
	`pat_token` text DEFAULT '',
	`copilot_plan` text DEFAULT 'pro',
	`is_favorite` integer DEFAULT 0,
	`account_type` text DEFAULT 'copilot',
	`claude_user_email` text DEFAULT '',
	`claude_plan` text DEFAULT '',
	`monthly_budget` real DEFAULT 0,
	`claude_org_id` text DEFAULT '',
	`claude_cf_clearance` text DEFAULT '',
	`claude_token_expires_at` integer DEFAULT 0,
	`github_orgs` text DEFAULT '',
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `accounts_github_username_unique` ON `accounts` (`github_username`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text DEFAULT ''
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `usage_detail` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`history_id` integer NOT NULL,
	`model` text DEFAULT '',
	`quantity` real DEFAULT 0,
	`price_per_unit` real DEFAULT 0.04,
	`net_amount` real DEFAULT 0,
	`input_tokens` integer DEFAULT 0,
	`output_tokens` integer DEFAULT 0,
	`cache_read_tokens` integer DEFAULT 0,
	`cache_creation_tokens` integer DEFAULT 0,
	FOREIGN KEY (`history_id`) REFERENCES `usage_history`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `usage_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`year` integer NOT NULL,
	`month` integer NOT NULL,
	`gross_quantity` real DEFAULT 0,
	`included_quantity` real DEFAULT 0,
	`net_amount` real DEFAULT 0,
	`plan_limit` integer DEFAULT 300,
	`percentage` real DEFAULT 0,
	`sessions` integer DEFAULT 0,
	`lines_added` integer DEFAULT 0,
	`lines_removed` integer DEFAULT 0,
	`commits` integer DEFAULT 0,
	`pull_requests` integer DEFAULT 0,
	`session_usage_pct` real DEFAULT 0,
	`weekly_usage_pct` real DEFAULT 0,
	`weekly_reset_at` text DEFAULT '',
	`extra_usage_enabled` integer DEFAULT 0,
	`extra_usage_spent` real DEFAULT 0,
	`extra_usage_limit` real DEFAULT 0,
	`extra_usage_balance` real DEFAULT 0,
	`extra_usage_reset_at` text DEFAULT '',
	`fetched_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_account_period` ON `usage_history` (`account_id`,`year`,`month`);