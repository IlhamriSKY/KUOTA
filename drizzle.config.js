import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.js",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: "./data/quota.db",
  },
});
