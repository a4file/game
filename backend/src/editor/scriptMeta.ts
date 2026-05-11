import type { ScriptBlock, ScriptMeta, ScreenplayIntExt } from "../types";

export const DEFAULT_SCRIPT_META: ScriptMeta = {
  scriptTitle: "",
  episodeTitle: "",
  draftLabel: "",
  writtenBy: "",
  basedOn: "",
  contact: "",
  revisionNote: "",
  pageNumberStart: 1
};

export function mergeScriptMeta(raw: ScriptMeta | undefined | null): ScriptMeta {
  const r: Partial<ScriptMeta> = raw ?? {};
  const page = Number(r.pageNumberStart);
  return {
    scriptTitle: r.scriptTitle != null ? String(r.scriptTitle) : "",
    episodeTitle: r.episodeTitle != null ? String(r.episodeTitle) : "",
    draftLabel: r.draftLabel != null ? String(r.draftLabel) : "",
    writtenBy: r.writtenBy != null ? String(r.writtenBy) : "",
    basedOn: r.basedOn != null ? String(r.basedOn) : "",
    contact: r.contact != null ? String(r.contact) : "",
    revisionNote: r.revisionNote != null ? String(r.revisionNote) : "",
    pageNumberStart: Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1
  };
}

const BLOCK_TYPES = new Set(["action", "character", "parenthetical", "dialogue", "transition", "general"]);

const newBlockId = (): string => `blk-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export function normalizeScriptBlocks(raw: unknown): ScriptBlock[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, i) => {
    const o = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const typeRaw = String(o.type ?? "action");
    const type = BLOCK_TYPES.has(typeRaw) ? (typeRaw as ScriptBlock["type"]) : "action";
    const id = typeof o.id === "string" && o.id.trim() ? o.id : `${newBlockId()}-${i}`;
    const text = String(o.text ?? "");
    const cueName = typeof o.cueName === "string" && o.cueName.trim() ? o.cueName.trim() : undefined;
    const extension = typeof o.extension === "string" && o.extension.trim() ? o.extension.trim() : undefined;
    return { id, type, text, ...(cueName ? { cueName } : {}), ...(extension ? { extension } : {}) };
  });
}

export function normalizeScreenplayIntExt(raw: unknown): ScreenplayIntExt | "" {
  const s = String(raw ?? "").trim();
  if (s === "INT" || s === "EXT" || s === "INT_EXT") return s;
  return "";
}
