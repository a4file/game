import { SheetBundle } from "../types";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import seedData from "../../data/sheets.json";

export type EditableSheetName = "maps" | "characters" | "monsters" | "skills" | "weapons" | "items" | "equipments";

const seed: SheetBundle = seedData as SheetBundle;

let currentBundle: SheetBundle = structuredClone(seed);
let loaded = false;

const isVercel = process.env.VERCEL === "1";

const dataDirPath = path.resolve(process.cwd(), "data");
const sheetsFilePathLocal = path.join(dataDirPath, "sheets.json");
/** Vercel serverless: seed from build bundle; persist under /tmp (ephemeral across cold starts). */
const vercelBundleSheetsPath = path.join(__dirname, "..", "vercel-bundle", "sheets.json");
const vercelPersistSheetsPath = path.join("/tmp", "terminal-rpg-sheets.json");

const sheetsPersistPath = (): string => (isVercel ? vercelPersistSheetsPath : sheetsFilePathLocal);

const sheetsInitialReadPath = (): string =>
  isVercel ? vercelBundleSheetsPath : sheetsFilePathLocal;

const toStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map((entry) => String(entry));
  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
};

const normalizeBundle = (raw: unknown): SheetBundle => {
  const incoming = (raw ?? {}) as Record<string, unknown>;
  const normalizedSkills = Array.isArray(incoming.skills)
    ? incoming.skills.map((skill, index) => {
        const row = (skill ?? {}) as Record<string, unknown>;
        return {
          id: String(row.id ?? `sk-auto-${index + 1}`),
          name: String(row.name ?? `스킬 ${index + 1}`),
          description: String(row.description ?? "설명이 없는 스킬"),
          powerMultiplier: Number(row.powerMultiplier ?? 1.1),
          cooldown: Number(row.cooldown ?? 1),
          kind: (row.kind as "attack" | "buff" | "debuff" | "support") ?? "attack"
        };
      })
    : [];

  const skillNameToId = new Map(normalizedSkills.map((skill) => [skill.name, skill.id]));

  return {
    version: Number(incoming.version ?? 1),
    maps: Array.isArray(incoming.maps)
      ? (incoming.maps as Array<Record<string, unknown>>).map((map, index) => ({
          id: String(map.id ?? `st-${String(index + 1).padStart(3, "0")}`),
          name: String(map.name ?? `스테이지 ${index + 1}`),
          recommendedPower: Number(map.recommendedPower ?? 100 + index * 10),
          monsterIds: toStringArray(map.monsterIds)
        }))
      : [],
    characters: Array.isArray(incoming.characters)
      ? (incoming.characters as Array<Record<string, unknown>>).map((character, index) => {
          const legacySkill = character.skill ? String(character.skill) : null;
          const mappedSkill = legacySkill ? skillNameToId.get(legacySkill) : null;
          const skillIds = toStringArray(character.skillIds);
          return {
            id: String(character.id ?? `c-${String(index + 1).padStart(3, "0")}`),
            name: String(character.name ?? `캐릭터 ${index + 1}`),
            description: String(character.description ?? "설명 없음"),
            rarity: Number(character.rarity ?? 3) as 3 | 4 | 5,
            element: (character.element as "fire" | "water" | "nature" | "machine") ?? "fire",
            atk: Number(character.atk ?? 30),
            hp: Number(character.hp ?? 120),
            skillIds: skillIds.length > 0 ? skillIds : mappedSkill ? [mappedSkill] : [],
            maxPages: Number(character.maxPages ?? 20),
            storyPages: toStringArray(character.storyPages)
          };
        })
      : [],
    monsters: Array.isArray(incoming.monsters)
      ? (incoming.monsters as Array<Record<string, unknown>>).map((monster, index) => {
          const legacySkill = monster.skill ? String(monster.skill) : null;
          const mappedSkill = legacySkill ? skillNameToId.get(legacySkill) : null;
          const skillIds = toStringArray(monster.skillIds);
          return {
            id: String(monster.id ?? `m-${String(index + 1).padStart(3, "0")}`),
            name: String(monster.name ?? `몬스터 ${index + 1}`),
            element: (monster.element as "fire" | "water" | "nature" | "machine") ?? "fire",
            atk: Number(monster.atk ?? 20),
            hp: Number(monster.hp ?? 100),
            skillIds: skillIds.length > 0 ? skillIds : mappedSkill ? [mappedSkill] : []
          };
        })
      : [],
    skills: normalizedSkills,
    weapons: Array.isArray(incoming.weapons) ? (incoming.weapons as SheetBundle["weapons"]) : [],
    items: Array.isArray(incoming.items) ? (incoming.items as SheetBundle["items"]) : [],
    equipments: Array.isArray(incoming.equipments) ? (incoming.equipments as SheetBundle["equipments"]) : []
  };
};

const persist = async (): Promise<void> => {
  const target = sheetsPersistPath();
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(currentBundle, null, 2), "utf-8");
};

export const ensureSheetsLoaded = async (): Promise<void> => {
  if (loaded) return;
  loaded = true;
  const tryParse = async (filePath: string): Promise<boolean> => {
    try {
      const raw = await readFile(filePath, "utf-8");
      currentBundle = normalizeBundle(JSON.parse(raw));
      return true;
    } catch {
      return false;
    }
  };
  if (isVercel) {
    if (await tryParse(vercelPersistSheetsPath)) return;
    if (await tryParse(vercelBundleSheetsPath)) return;
    currentBundle = normalizeBundle(seed);
    await persist();
    return;
  }
  if (await tryParse(sheetsFilePathLocal)) return;
  currentBundle = normalizeBundle(seed);
  await persist();
};

export const getSheets = async (): Promise<SheetBundle> => {
  await ensureSheetsLoaded();
  return currentBundle;
};

export const replaceSheets = async (next: SheetBundle): Promise<SheetBundle> => {
  await ensureSheetsLoaded();
  currentBundle = { ...normalizeBundle(next), version: currentBundle.version + 1 };
  await persist();
  return currentBundle;
};

export const patchSheet = async (
  key: EditableSheetName,
  rows: Array<Record<string, unknown>>
): Promise<SheetBundle> => {
  await ensureSheetsLoaded();
  currentBundle = {
    ...currentBundle,
    [key]: rows as never,
    version: currentBundle.version + 1
  };
  await persist();
  return currentBundle;
};

