/**
 * docs/mythic-archive → frontend/public/mythic-archive + bible-manifest.json
 * 배포(API 실패)·로컬에서 World Bible 탭용 정적 폴백.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const SRC = join(ROOT, "docs", "mythic-archive");
const DEST_DIR = join(__dirname, "..", "public", "mythic-archive");
const MANIFEST = join(__dirname, "..", "public", "bible-manifest.json");

const labelMap = {
  "00-world-bible.md": "World Bible",
  "01-factions.md": "Factions",
  "02-content-standards.md": "Content standards",
  "03-tone-and-taboos.md": "Tone & taboos"
};

/** 설정 | 종족 | 기술 | 조직 | 역사 — API·프론트와 동일 */
const categoryMap = {
  "00-world-bible.md": "settings",
  "01-factions.md": "orgs",
  "02-content-standards.md": "settings",
  "03-tone-and-taboos.md": "settings"
};

if (!existsSync(SRC)) {
  console.warn(`[copy-mythic-archive] skip: missing ${SRC}`);
  process.exit(0);
}

mkdirSync(DEST_DIR, { recursive: true });
const mdFiles = readdirSync(SRC).filter((n) => n.endsWith(".md"));
const files = [];
for (const name of mdFiles) {
  const srcPath = join(SRC, name);
  if (!statSync(srcPath).isFile()) continue;
  copyFileSync(srcPath, join(DEST_DIR, name));
  files.push({
    name,
    label: labelMap[name] ?? name,
    category: categoryMap[name] ?? "settings"
  });
}
files.sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(MANIFEST, `${JSON.stringify({ files }, null, 2)}\n`, "utf8");
console.log(`[copy-mythic-archive] ${files.length} files → ${DEST_DIR}, manifest ok`);
