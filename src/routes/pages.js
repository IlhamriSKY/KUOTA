import { Hono } from "hono";
import { renderDashboard } from "../views/dashboard.js";
import { layout } from "../views/layout.js";
import { addAccountForm, settingsPage } from "../views/components.js";
import { getClientId } from "../services/oauth.js";
import { getMysqlConfig } from "../db/mysql.js";
import { getAutoRefreshMinutes } from "../index.js";

const pages = new Hono();

// Dashboard
pages.get("/", (c) => {
  return c.html(renderDashboard());
});

// Add account page
pages.get("/add", (c) => {
  const hasOAuth = !!getClientId();
  return c.html(layout("Add Account", addAccountForm(hasOAuth)));
});

// Settings page
pages.get("/settings", (c) => {
  const mysqlConfig = getMysqlConfig();
  return c.html(layout("Settings", settingsPage(mysqlConfig, getAutoRefreshMinutes())));
});

export default pages;
