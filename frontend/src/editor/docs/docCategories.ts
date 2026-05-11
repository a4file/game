/** DOCS 탭 문서 카테고리 (설정 / 종족 / 기술 / 조직 / 역사) */
export type DocCategoryId = "settings" | "races" | "tech" | "orgs" | "history";

export type DocFileRow = {
  name: string;
  label: string;
  category: DocCategoryId;
};

export const DOC_CATEGORY_ORDER: ReadonlyArray<{ id: DocCategoryId; label: string; hint: string }> = [
  { id: "settings", label: "설정", hint: "세계 규칙, 톤, 콘텐츠 기준" },
  { id: "races", label: "종족", hint: "종족·외형·문화" },
  { id: "tech", label: "기술", hint: "과학·마법·장비 체계" },
  { id: "orgs", label: "조직", hint: "국가, 파벌, 기업, 집단" },
  { id: "history", label: "역사", hint: "연대기, 사건, 신화" }
];

const DOC_CATEGORY_IDS = new Set<string>(DOC_CATEGORY_ORDER.map((c) => c.id));

const categoryByFilename: Record<string, DocCategoryId> = {
  "00-world-bible.md": "settings",
  "01-factions.md": "orgs",
  "02-content-standards.md": "settings",
  "03-tone-and-taboos.md": "settings"
};

export const inferDocCategoryFromFilename = (name: string): DocCategoryId => categoryByFilename[name] ?? "settings";

export const normalizeDocCategory = (raw: unknown, fileName: string): DocCategoryId => {
  if (typeof raw === "string" && DOC_CATEGORY_IDS.has(raw)) return raw as DocCategoryId;
  return inferDocCategoryFromFilename(fileName);
};

export const normalizeDocFileRow = (row: { name?: unknown; label?: unknown; category?: unknown }): DocFileRow | null => {
  const name = typeof row.name === "string" ? row.name : "";
  if (!name.endsWith(".md")) return null;
  const label = typeof row.label === "string" ? row.label : name;
  const category = normalizeDocCategory(row.category, name);
  return { name, label, category };
};

export const groupDocFilesByCategory = (files: DocFileRow[]): Record<DocCategoryId, DocFileRow[]> => {
  const empty: Record<DocCategoryId, DocFileRow[]> = {
    settings: [],
    races: [],
    tech: [],
    orgs: [],
    history: []
  };
  for (const f of files) {
    const key = f.category in empty ? f.category : "settings";
    empty[key].push(f);
  }
  for (const { id } of DOC_CATEGORY_ORDER) {
    empty[id].sort((a, b) => a.name.localeCompare(b.name));
  }
  return empty;
};
