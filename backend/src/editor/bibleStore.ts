import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const BIBLE_WHITELIST = new Set([
  "00-world-bible.md",
  "01-factions.md",
  "02-content-standards.md",
  "03-tone-and-taboos.md"
]);

const MAX_CHARS = 900_000;

const isVercel = process.env.VERCEL === "1";

const bundledMythicDir = (): string => path.join(__dirname, "..", "vercel-bundle", "mythic-archive");

const writableMythicDir = (): string => path.join("/tmp", "mythic-archive");

/** Repo root `docs/mythic-archive` (local). Vercel: writable copy under /tmp (read falls back to build bundle). */
export const mythicArchiveDir = (): string =>
  isVercel ? writableMythicDir() : path.resolve(__dirname, "..", "..", "..", "docs", "mythic-archive");

export const listBibleWhitelist = (): string[] => [...BIBLE_WHITELIST].sort();

export const bibleFileLabel = (name: string): string => {
  const map: Record<string, string> = {
    "00-world-bible.md": "World Bible",
    "01-factions.md": "Factions",
    "02-content-standards.md": "Content standards",
    "03-tone-and-taboos.md": "Tone & taboos"
  };
  return map[name] ?? name;
};

/** Returns canonical filename or null if not allowed. */
export const assertBibleFile = (raw: string): string | null => {
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const name = path.basename(decoded);
  if (!BIBLE_WHITELIST.has(name)) return null;
  return name;
};

const readBibleFromPath = async (dir: string, name: string): Promise<string> =>
  readFile(path.join(dir, name), "utf8");

export const readBibleFile = async (raw: string): Promise<string> => {
  const name = assertBibleFile(raw);
  if (!name) throw new Error("INVALID_BIBLE_FILE");
  if (isVercel) {
    try {
      return await readBibleFromPath(writableMythicDir(), name);
    } catch {
      return readBibleFromPath(bundledMythicDir(), name);
    }
  }
  return readBibleFromPath(mythicArchiveDir(), name);
};

export const writeBibleFile = async (raw: string, content: string): Promise<void> => {
  const name = assertBibleFile(raw);
  if (!name) throw new Error("INVALID_BIBLE_FILE");
  if (typeof content !== "string") throw new Error("INVALID_CONTENT");
  if (content.length > MAX_CHARS) throw new Error("CONTENT_TOO_LARGE");
  const dir = isVercel ? writableMythicDir() : mythicArchiveDir();
  await mkdir(dir, { recursive: true });
  const fp = path.join(dir, name);
  await writeFile(fp, content, "utf8");
};
