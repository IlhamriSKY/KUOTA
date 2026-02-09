// Copy vendor assets from node_modules to public/
import { mkdirSync, copyFileSync, existsSync } from "fs";
import { join, dirname } from "path";

const ROOT = join(import.meta.dir, "..");
const PUBLIC = join(ROOT, "public");

const assets = [
  {
    src: join(ROOT, "node_modules/htmx.org/dist/htmx.min.js"),
    dest: join(PUBLIC, "js/htmx.min.js"),
  },
];

for (const { src, dest } of assets) {
  if (!existsSync(src)) {
    console.warn(`[copy-assets] Source not found: ${src.split("node_modules")[1] || src}`);
    continue;
  }
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  console.log(`[copy-assets] ${src.split("node_modules/")[1] || src} → ${dest.split("public/")[1] || dest}`);
}
