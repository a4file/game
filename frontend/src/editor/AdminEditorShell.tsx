import { useEffect, useState } from "react";
import axios from "axios";
import { BibleEditorPanel } from "./BibleEditorPanel";
import { exportJson } from "./importExport";
import { SheetTable } from "./sheets/SheetTable";
import { sheetSchemas } from "./sheets/schemas";
import { generateRowsWithAi, assistCellWithAi } from "./ai/editorAiClient";
import type { SheetBundle } from "../rpg/types";
import { getApiBaseUrl } from "../apiBase";

const tabsConst = ["maps", "characters", "monsters", "skills", "weapons", "items", "equipments"] as const;
type SheetTab = (typeof tabsConst)[number];
type EditorPanel = SheetTab | "bible";

interface Props {
  bundle: SheetBundle;
  onUpdateBundle: (next: SheetBundle) => void;
}

export const AdminEditorShell = ({ bundle, onUpdateBundle }: Props) => {
  const [panel, setPanel] = useState<EditorPanel>("characters");
  const [prompt, setPrompt] = useState("");
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const tabs = tabsConst;
  const safeSkills = Array.isArray(bundle.skills) ? bundle.skills : [];
  const sheetPanel = panel === "bible" ? null : panel;

  const validateBundle = (candidate: SheetBundle): string[] => {
    const issues: string[] = [];
    if (!Array.isArray(candidate.skills)) {
      issues.push("skills 배열이 없습니다.");
      return issues;
    }
    const skillIds = new Set(candidate.skills.map((skill) => skill.id));
    candidate.characters.forEach((character, idx) => {
      if (!Array.isArray(character.skillIds)) {
        issues.push(`characters[${idx}].skillIds가 배열이 아닙니다.`);
        return;
      }
      character.skillIds.forEach((skillId) => {
        if (!skillIds.has(skillId)) issues.push(`characters[${idx}]에 존재하지 않는 skillId(${skillId})`);
      });
    });
    candidate.monsters.forEach((monster, idx) => {
      if (!Array.isArray(monster.skillIds)) {
        issues.push(`monsters[${idx}].skillIds가 배열이 아닙니다.`);
        return;
      }
      monster.skillIds.forEach((skillId) => {
        if (!skillIds.has(skillId)) issues.push(`monsters[${idx}]에 존재하지 않는 skillId(${skillId})`);
      });
    });
    return issues.slice(0, 6);
  };

  const saveToBackend = async () => {
    const issues = validateBundle(bundle);
    if (issues.length > 0) {
      setError(issues.join("\n"));
      setPreview("[ERR] validation failed");
      return;
    }
    setError("");
    const api = axios.create({ baseURL: getApiBaseUrl() });
    const { data } = await api.post<SheetBundle>("/editor/sheets", bundle);
    onUpdateBundle(data);
    setPreview("[SYS] backend synced");
  };

  const reloadFromBackend = async () => {
    setError("");
    setLoading(true);
    try {
      const api = axios.create({ baseURL: getApiBaseUrl() });
      const { data } = await api.get<SheetBundle>("/editor/sheets");
      onUpdateBundle(data);
      setPreview(`[SYS] backend reloaded (v${data.version})`);
    } catch (e) {
      setError("백엔드에서 시트 데이터를 가져오지 못했습니다. 서버 상태를 확인하세요.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reloadFromBackend();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = sheetPanel ? ((bundle[sheetPanel] as Array<Record<string, unknown>>) ?? []) : [];
  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const pageStart = (clampedPage - 1) * pageSize;
  const pagedRows = rows.slice(pageStart, pageStart + pageSize);

  const applyRows = (nextRows: Array<Record<string, unknown>>) => {
    if (!sheetPanel) return;
    const merged = [...rows];
    merged.splice(pageStart, nextRows.length, ...nextRows);
    onUpdateBundle({
      ...bundle,
      [sheetPanel]: merged as never
    });
  };

  const idPrefixMap: Record<string, string> = {
    maps: "st-",
    characters: "c-",
    monsters: "m-",
    skills: "sk-",
    weapons: "w-",
    items: "i-",
    equipments: "e-"
  };

  const createDefaultRow = (): Record<string, unknown> => {
    if (!sheetPanel) return {};
    const columns = sheetSchemas[String(sheetPanel)] ?? [];
    const nextIndex = rows.length + 1;
    const nextId = `${idPrefixMap[String(sheetPanel)] ?? "row-"}${String(nextIndex).padStart(3, "0")}`;
    const row: Record<string, unknown> = {};
    for (const column of columns) {
      if (column === "id") row[column] = nextId;
      else if (column === "name") row[column] = `${sheetPanel}-${String(nextIndex).padStart(3, "0")}`;
      else if (column === "monsterIds" || column === "skillIds" || column === "storyPages") row[column] = [];
      else if (column === "description" || column === "effect") row[column] = "";
      else if (column === "rarity") row[column] = 3;
      else if (column === "element") row[column] = "fire";
      else if (column === "slot") row[column] = String(sheetPanel) === "equipments" ? "armor" : "weapon";
      else if (column === "type") row[column] = "consumable";
      else if (column === "kind") row[column] = "attack";
      else if (column === "powerMultiplier") row[column] = 1.1;
      else if (column === "cooldown") row[column] = 1;
      else if (column === "maxPages") row[column] = 20;
      else row[column] = 0;
    }
    return row;
  };

  const addRow = () => {
    if (!sheetPanel) return;
    onUpdateBundle({
      ...bundle,
      [sheetPanel]: [...rows, createDefaultRow()] as never
    });
    setPreview(`[SYS] ${sheetPanel} row added`);
  };

  const duplicateRow = (index: number) => {
    if (!sheetPanel) return;
    const absoluteIndex = pageStart + index;
    const source = rows[absoluteIndex];
    if (!source) return;
    const copy = { ...source, id: `${String(source.id ?? "row")}-copy-${Date.now()}` };
    const next = [...rows];
    next.splice(absoluteIndex + 1, 0, copy);
    onUpdateBundle({ ...bundle, [sheetPanel]: next as never });
    setPreview(`[SYS] ${sheetPanel} row duplicated`);
  };

  const deleteRow = (index: number) => {
    if (!sheetPanel) return;
    const absoluteIndex = pageStart + index;
    const next = rows.filter((_, idx) => idx !== absoluteIndex);
    onUpdateBundle({ ...bundle, [sheetPanel]: next as never });
    setPreview(`[SYS] ${sheetPanel} row deleted`);
  };

  const onGenerate = async () => {
    if (!sheetPanel) return;
    const text = await generateRowsWithAi(sheetPanel, prompt);
    setPreview(text);
  };

  const onAssistFirstCell = async () => {
    if (!sheetPanel || !rows[0]) return;
    const suggestion = await assistCellWithAi(sheetPanel, rows[0], "name", "더 매력적인 네이밍으로 개선");
    setPreview(suggestion);
  };

  return (
    <section className="admin-shell">
      <h3>ADMIN SHEET EDITOR</h3>
      <div className="tab-row">
        {tabs.map((name) => (
          <button
            key={name}
            onClick={() => {
              setPanel(name);
              setPage(1);
            }}
            className={panel === name ? "active" : ""}
          >
            {name}
          </button>
        ))}
        <button type="button" className={panel === "bible" ? "active" : ""} onClick={() => setPanel("bible")}>
          bible
        </button>
        <button onClick={() => exportJson(`sheet-${bundle.version}`, bundle)}>export json</button>
        <button onClick={reloadFromBackend}>{loading ? "reloading..." : "reload backend"}</button>
        {sheetPanel && <button onClick={addRow}>add row</button>}
        {sheetPanel && <button onClick={saveToBackend}>save backend</button>}
      </div>
      {panel === "bible" ? (
        <BibleEditorPanel />
      ) : (
        <>
          <p>
            rows: {rows.length} | version: {bundle.version} | page: {clampedPage}/{totalPages}
          </p>
          <div className="row-actions" style={{ marginBottom: 8 }}>
            <button type="button" onClick={() => setPage((prev) => Math.max(1, prev - 1))}>
              prev
            </button>
            <button type="button" onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}>
              next
            </button>
          </div>
          <SheetTable
            sheetName={panel}
            rows={pagedRows}
            onChange={applyRows}
            skillOptions={safeSkills.map((skill) => ({ id: skill.id, name: skill.name }))}
            onDeleteRow={deleteRow}
            onDuplicateRow={duplicateRow}
            onAddRow={addRow}
          />
          <div className="ai-panel">
            <input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="AI 프롬프트 입력" />
            <button onClick={onGenerate}>generate rows</button>
            <button onClick={onAssistFirstCell}>assist first cell</button>
          </div>
        </>
      )}
      {error && <pre className="preview error-preview">{error}</pre>}
      {preview && <pre className="preview">{preview}</pre>}
    </section>
  );
};

