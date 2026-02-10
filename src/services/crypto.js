import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { getAppRoot } from "../utils.js";

const SECRET_FILE = join(getAppRoot(), ".secret");

function getSecret() {
  if (process.env.APP_SECRET) return process.env.APP_SECRET;
  if (existsSync(SECRET_FILE)) return readFileSync(SECRET_FILE, "utf-8").trim();
  const secret = randomBytes(32).toString("hex");
  writeFileSync(SECRET_FILE, secret, { encoding: "utf-8", mode: 0o600 });
  return secret;
}

const SECRET = getSecret();
const KEY = scryptSync(SECRET, "copilot-quota-salt", 32);
const ALGO = "aes-256-gcm";

export function encrypt(text) {
  if (!text) return "";
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGO, KEY, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${tag}:${encrypted}`;
}

export function decrypt(data) {
  if (!data) return "";
  try {
    const [ivHex, tagHex, encrypted] = data.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const decipher = createDecipheriv(ALGO, KEY, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (e) {
    console.error("[crypto] Decryption failed - data may be corrupt or key changed");
    return "";
  }
}
