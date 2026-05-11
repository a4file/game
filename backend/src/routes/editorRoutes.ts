import { Router } from "express";
import {
  assertBibleFile,
  bibleFileCategory,
  bibleFileLabel,
  listBibleWhitelist,
  readBibleFile,
  writeBibleFile
} from "../editor/bibleStore";
import { EditableSheetName, getSheets, patchSheet, replaceSheets } from "../editor/store";
import { validateSheetBundle } from "../editor/validators";
import { generateWithOpenRouter } from "../ai/openRouterClient";
import { hasTmdbApiKey, tmdbGetPerson, tmdbSearchPersons } from "../tmdb/tmdbClient";

export const editorRouter = Router();

editorRouter.get("/bible", (_req, res) => {
  const files = listBibleWhitelist().map((name) => ({
    name,
    label: bibleFileLabel(name),
    category: bibleFileCategory(name)
  }));
  return res.json({ files });
});

editorRouter.get("/bible/:fileName", async (req, res) => {
  const safe = assertBibleFile(req.params.fileName ?? "");
  if (!safe) {
    return res.status(400).json({ error: { code: "INVALID_BIBLE_FILE", message: "Unknown or disallowed bible file" } });
  }
  try {
    const content = await readBibleFile(safe);
    return res.json({ name: safe, content });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Bible file not found on disk" } });
    }
    throw err;
  }
});

editorRouter.put("/bible/:fileName", async (req, res) => {
  const safe = assertBibleFile(req.params.fileName ?? "");
  if (!safe) {
    return res.status(400).json({ error: { code: "INVALID_BIBLE_FILE", message: "Unknown or disallowed bible file" } });
  }
  const content = req.body?.content;
  if (typeof content !== "string") {
    return res.status(400).json({ error: { code: "INVALID_BODY", message: "content string is required" } });
  }
  try {
    await writeBibleFile(safe, content);
    return res.json({ ok: true, name: safe });
  } catch (err) {
    const message = err instanceof Error ? err.message : "WRITE_FAILED";
    if (message === "CONTENT_TOO_LARGE") {
      return res.status(400).json({ error: { code: "CONTENT_TOO_LARGE", message: "Content exceeds limit" } });
    }
    throw err;
  }
});

editorRouter.get("/tmdb/person-search", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (q.length < 2) {
    return res.status(400).json({ error: { code: "QUERY_TOO_SHORT", message: "검색어는 2글자 이상이어야 합니다." } });
  }
  if (!hasTmdbApiKey()) {
    return res.status(503).json({
      error: {
        code: "TMDB_DISABLED",
        message: "서버에 TMDB_API_KEY 또는 TMDB_READ_ACCESS_TOKEN이 없습니다. backend/.env에 넣고 재시작하세요."
      }
    });
  }
  try {
    const page = Math.min(50, Math.max(1, Number(req.query.page) || 1));
    const payload = await tmdbSearchPersons(q, page);
    return res.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "TMDB request failed";
    return res.status(502).json({ error: { code: "TMDB_UPSTREAM", message } });
  }
});

editorRouter.get("/tmdb/person/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: { code: "INVALID_ID", message: "Invalid person id" } });
  }
  if (!hasTmdbApiKey()) {
    return res.status(503).json({
      error: { code: "TMDB_DISABLED", message: "서버에 TMDB_API_KEY 또는 TMDB_READ_ACCESS_TOKEN이 없습니다." }
    });
  }
  try {
    const detail = await tmdbGetPerson(id);
    return res.json(detail);
  } catch (err) {
    const message = err instanceof Error ? err.message : "TMDB request failed";
    const status = message.includes("not found") ? 404 : 502;
    return res.status(status).json({ error: { code: "TMDB_UPSTREAM", message } });
  }
});

editorRouter.get("/sheets", async (_req, res) => {
  res.json(await getSheets());
});

editorRouter.post("/sheets", async (req, res) => {
  if (!validateSheetBundle(req.body)) {
    return res.status(400).json({ error: { code: "INVALID_SHEET_BUNDLE", message: "Payload must match sheet schema" } });
  }
  return res.json(await replaceSheets(req.body));
});

editorRouter.patch("/sheet/:name", async (req, res) => {
  const sheetName = req.params.name as EditableSheetName;
  const editable: EditableSheetName[] = [
    "stories",
    "maps",
    "characters",
    "monsters",
    "storyBranches",
    "skills",
    "weapons",
    "items",
    "equipments"
  ];
  if (!editable.includes(sheetName)) {
    return res.status(400).json({ error: { code: "INVALID_SHEET", message: "Unsupported sheet name" } });
  }
  const rows = req.body?.rows;
  if (!Array.isArray(rows)) {
    return res.status(400).json({ error: { code: "INVALID_ROWS", message: "rows array is required" } });
  }
  const next = await patchSheet(sheetName, rows as Array<Record<string, unknown>>);
  return res.json(next);
});

editorRouter.post("/ai/generate-rows", async (req, res) => {
  const { sheet, prompt } = req.body ?? {};
  if (typeof sheet !== "string" || typeof prompt !== "string") {
    return res.status(400).json({ error: { code: "INVALID_PROMPT", message: "sheet and prompt are required" } });
  }
  const generated = await generateWithOpenRouter(
    `You are assisting a film / serialized drama production bible (not a combat RPG). Sheet "${sheet}" is a data table for locations, cast, props, or beat descriptions.\nReturn ONLY a compact JSON array of row objects suitable for this sheet. No game stats unless the sheet clearly needs numbers.\nUser prompt:\n${prompt}`
  );
  return res.json({ preview: generated ?? "[]", source: generated ? "ai" : "fallback" });
});

editorRouter.post("/ai/assist-cell", async (req, res) => {
  const { sheet, row, field, instruction } = req.body ?? {};
  const generated = await generateWithOpenRouter(
    `You help write a screenplay / production sheet cell (cinematic tone, not RPG combat). sheet=${sheet}, field=${field}, current row=${JSON.stringify(row)}. Instruction: ${instruction}. Reply with ONE cell value only, plain text, no JSON wrapper.`
  );
  return res.json({ suggestion: generated ?? "", source: generated ? "ai" : "fallback" });
});

