import { drizzle } from "drizzle-orm/mysql2";
import { mysqlTable, int, varchar, double, datetime } from "drizzle-orm/mysql-core";
import mysql from "mysql2/promise";
import { sql } from "drizzle-orm";
import { getSetting } from "./sqlite.js";
import { decrypt } from "../services/crypto.js";

// --- MySQL Schema (mirrors SQLite schema with MySQL-specific types) ---
// Only syncs public data - no tokens/secrets stored in MySQL.
const mysqlAccounts = mysqlTable("accounts", {
  id: int("id").primaryKey(),
  github_username: varchar("github_username", { length: 255 }).notNull().unique(),
  avatar_url: varchar("avatar_url", { length: 1024 }).default(""),
  display_name: varchar("display_name", { length: 255 }).default(""),
  copilot_plan: varchar("copilot_plan", { length: 20 }).default("pro"),
  created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
  updated_at: datetime("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

const mysqlUsageHistory = mysqlTable("usage_history", {
  id: int("id").primaryKey(),
  account_id: int("account_id").notNull(),
  year: int("year").notNull(),
  month: int("month").notNull(),
  gross_quantity: double("gross_quantity").default(0),
  included_quantity: double("included_quantity").default(0),
  net_amount: double("net_amount").default(0),
  plan_limit: int("plan_limit").default(300),
  percentage: double("percentage").default(0),
  fetched_at: datetime("fetched_at").default(sql`CURRENT_TIMESTAMP`),
});

const mysqlUsageDetail = mysqlTable("usage_detail", {
  id: int("id").primaryKey(),
  history_id: int("history_id").notNull(),
  model: varchar("model", { length: 255 }).default(""),
  quantity: double("quantity").default(0),
  price_per_unit: double("price_per_unit").default(0.04),
  net_amount: double("net_amount").default(0),
});

let pool = null;
let mysqlDb = null;

export function getMysqlConfig() {
  return {
    host: getSetting("mysql_host") || process.env.MYSQL_HOST || "127.0.0.1",
    port: parseInt(getSetting("mysql_port") || process.env.MYSQL_PORT || "3306"),
    user: getSetting("mysql_user") || process.env.MYSQL_USER || "root",
    password: (() => {
      const stored = getSetting("mysql_password");
      if (!stored) return process.env.MYSQL_PASSWORD || "";
      // Encrypted passwords contain colons (iv:tag:cipher)
      if (stored.includes(":")) return decrypt(stored);
      return stored;
    })(),
    database: getSetting("mysql_database") || process.env.MYSQL_DATABASE || "copilot_quota",
  };
}

async function ensurePool() {
  if (pool) return true;
  const config = getMysqlConfig();
  try {
    const dbName = config.database.replace(/[^a-zA-Z0-9_]/g, "");
    if (!dbName) throw new Error("Invalid database name");

    const tempConn = await mysql.createConnection({
      host: config.host, port: config.port, user: config.user, password: config.password,
    });
    await tempConn.execute(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
    await tempConn.end();

    pool = mysql.createPool({ ...config, waitForConnections: true, connectionLimit: 5, queueLimit: 0 });
    mysqlDb = drizzle(pool);
    return true;
  } catch (err) {
    console.error("MySQL connection failed:", err.message);
    return false;
  }
}

// --- DDL: Create tables from Drizzle schema definitions ---
// Raw DDL is required here because MySQL connection is dynamic (configured at runtime).
// These definitions mirror the mysqlTable schemas above.
const CREATE_TABLES = [
  `CREATE TABLE IF NOT EXISTS accounts (
    id INT PRIMARY KEY, github_username VARCHAR(255) NOT NULL UNIQUE,
    avatar_url VARCHAR(1024) DEFAULT '', display_name VARCHAR(255) DEFAULT '',
    copilot_plan VARCHAR(20) DEFAULT 'pro',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS usage_history (
    id INT PRIMARY KEY, account_id INT NOT NULL, year INT NOT NULL, month INT NOT NULL,
    gross_quantity DOUBLE DEFAULT 0, included_quantity DOUBLE DEFAULT 0,
    net_amount DOUBLE DEFAULT 0, plan_limit INT DEFAULT 300, percentage DOUBLE DEFAULT 0,
    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_account_period (account_id, year, month)
  )`,
  `CREATE TABLE IF NOT EXISTS usage_detail (
    id INT PRIMARY KEY, history_id INT NOT NULL, model VARCHAR(255) DEFAULT '',
    quantity DOUBLE DEFAULT 0, price_per_unit DOUBLE DEFAULT 0.04, net_amount DOUBLE DEFAULT 0
  )`,
];

async function ensureTables() {
  if (!await ensurePool()) return false;
  try {
    for (const ddl of CREATE_TABLES) {
      await pool.execute(ddl);
    }
    return true;
  } catch (err) {
    console.error("MySQL table creation failed:", err.message);
    return false;
  }
}

export async function syncToMysql(data) {
  if (!await ensureTables()) throw new Error("Cannot connect to MySQL or create tables");

  for (const acc of data.accounts) {
    await mysqlDb.insert(mysqlAccounts).values({
      id: acc.id, github_username: acc.github_username,
      avatar_url: acc.avatar_url, display_name: acc.display_name,
      copilot_plan: acc.copilot_plan,
      created_at: acc.created_at ? new Date(acc.created_at) : new Date(),
      updated_at: acc.updated_at ? new Date(acc.updated_at) : new Date(),
    }).onDuplicateKeyUpdate({
      set: {
        avatar_url: sql`VALUES(avatar_url)`, display_name: sql`VALUES(display_name)`,
        copilot_plan: sql`VALUES(copilot_plan)`, updated_at: sql`VALUES(updated_at)`,
      },
    });
  }

  for (const uh of data.usage_history) {
    await mysqlDb.insert(mysqlUsageHistory).values({
      id: uh.id, account_id: uh.account_id, year: uh.year, month: uh.month,
      gross_quantity: uh.gross_quantity, included_quantity: uh.included_quantity,
      net_amount: uh.net_amount, plan_limit: uh.plan_limit, percentage: uh.percentage,
      fetched_at: uh.fetched_at ? new Date(uh.fetched_at) : new Date(),
    }).onDuplicateKeyUpdate({
      set: {
        gross_quantity: sql`VALUES(gross_quantity)`, included_quantity: sql`VALUES(included_quantity)`,
        net_amount: sql`VALUES(net_amount)`, plan_limit: sql`VALUES(plan_limit)`,
        percentage: sql`VALUES(percentage)`, fetched_at: sql`VALUES(fetched_at)`,
      },
    });
  }

  for (const ud of data.usage_detail) {
    await mysqlDb.insert(mysqlUsageDetail).values({
      id: ud.id, history_id: ud.history_id, model: ud.model,
      quantity: ud.quantity, price_per_unit: ud.price_per_unit, net_amount: ud.net_amount,
    }).onDuplicateKeyUpdate({
      set: {
        model: sql`VALUES(model)`, quantity: sql`VALUES(quantity)`,
        price_per_unit: sql`VALUES(price_per_unit)`, net_amount: sql`VALUES(net_amount)`,
      },
    });
  }

  return true;
}

