/**
 * Copies backend/data/sheets.json → public/sheets-fallback.json so static /
 * CDN deploys can load game data without the Express API (e.g. Vercel frontend-only).
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = join(__dirname, "..");
const repoRoot = join(frontendRoot, "..");
const src = join(repoRoot, "backend", "data", "sheets.json");
const destDir = join(frontendRoot, "public");
const dest = join(destDir, "sheets-fallback.json");

if (!existsSync(src)) {
  console.warn(`[copy-sheets-fallback] skip: missing ${src} (monorepo backend 경로가 없을 수 있음)`);
  process.exit(0);
}

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log(`[copy-sheets-fallback] ${dest}`);
