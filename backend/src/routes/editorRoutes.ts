import { Router } from "express";
import {
  assertBibleFile,
  bibleFileLabel,
  listBibleWhitelist,
  readBibleFile,
  writeBibleFile
} from "../editor/bibleStore";
import { EditableSheetName, getSheets, patchSheet, replaceSheets } from "../editor/store";
import { validateSheetBundle } from "../editor/validators";
import { generateWithOpenRouter } from "../ai/openRouterClient";

export const editorRouter = Router();

editorRouter.get("/bible", (_req, res) => {
  const files = listBibleWhitelist().map((name) => ({ name, label: bibleFileLabel(name) }));
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
    `Return JSON array rows for ${sheet}. Keep it compact.\nPrompt: ${prompt}`
  );
  return res.json({ preview: generated ?? "[]", source: generated ? "ai" : "fallback" });
});

editorRouter.post("/ai/assist-cell", async (req, res) => {
  const { sheet, row, field, instruction } = req.body ?? {};
  const generated = await generateWithOpenRouter(
    `You are sheet editor helper. sheet=${sheet}, field=${field}, row=${JSON.stringify(row)}, instruction=${instruction}. Return one improved cell value only.`
  );
  return res.json({ suggestion: generated ?? "", source: generated ? "ai" : "fallback" });
});

