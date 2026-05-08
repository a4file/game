import { useEffect, useState } from "react";
import axios from "axios";
import { BibleEditorPanel } from "./BibleEditorPanel";
import { CharacterProfileEditor } from "./CharacterProfileEditor";
import { EditorSafeBoundary } from "./EditorSafeBoundary";
import { SheetProfileEditor } from "./SheetProfileEditor";
import { exportJson } from "./importExport";
import { sheetSchemas } from "./sheets/schemas";
import { generateRowsWithAi, assistCellWithAi } from "./ai/editorAiClient";
import type { SheetBundle } from "../rpg/types";
import { getApiBaseUrl } from "../apiBase";
import { formatApiFailure } from "../apiErrors";

const tabsConst = ["stories", "maps", "characters", "monsters", "storyBranches", "skills", "weapons", "items", "equipments"] as const;
type SheetTab = (typeof tabsConst)[number];
type EditorPanel = SheetTab | "bible";

const panelTitles: Record<EditorPanel, string> = {
  stories: "스토리 시트",
  maps: "맵 / 스테이지",
  characters: "캐릭터",
  monsters: "몬스터",
  storyBranches: "스토리 분기",
  skills: "스킬",
  weapons: "무기",
  items: "아이템",
  equipments: "장비",
  bible: "World Bible (docs)"
};

interface Props {
  bundle: SheetBundle;
  onUpdateBundle: (next: SheetBundle) => void;
}

export const AdminEditorShell = ({ bundle, onUpdateBundle }: Props) => {
  const [panel, setPanel] = useState<EditorPanel>("stories");
  const [prompt, setPrompt] = useState("");
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
    try {
      const api = axios.create({ baseURL: getApiBaseUrl(), timeout: 30_000 });
      const url = `${getApiBaseUrl().replace(/\/?$/, "")}/editor/sheets`;
      const { data } = await api.post<SheetBundle>("/editor/sheets", bundle);
      onUpdateBundle(data);
      setPreview(`[SYS] backend synced (${url})`);
    } catch (e) {
      const detail = formatApiFailure(e, "POST /editor/sheets").join("\n");
      console.warn("[TerminalRPG]", detail);
      setError(detail);
      setPreview("[ERR] 저장 실패 — 콘솔(F12)에서 [TerminalRPG] 로그 확인");
    }
  };

  const reloadFromBackend = async () => {
    setError("");
    setLoading(true);
    try {
      const api = axios.create({ baseURL: getApiBaseUrl(), timeout: 30_000 });
      const { data } = await api.get<SheetBundle>("/editor/sheets");
      onUpdateBundle(data);
      setPreview(`[SYS] backend reloaded (v${data.version})`);
    } catch (e) {
      const detail = formatApiFailure(e, "GET /editor/sheets").join("\n");
      console.warn("[TerminalRPG]", detail);
      setError(detail);
      setPreview("[ERR] 에디터용 시트 로드 실패 — `diag`/콘솔 확인");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reloadFromBackend();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = sheetPanel ? ((bundle[sheetPanel] as Array<Record<string, unknown>>) ?? []) : [];

  const applyFullSheet = (nextRows: Array<Record<string, unknown>>) => {
    if (!sheetPanel) return;
    onUpdateBundle({
      ...bundle,
      [sheetPanel]: nextRows as never
    });
  };

  const idPrefixMap: Record<string, string> = {
    stories: "story-",
    maps: "st-",
    characters: "c-",
    monsters: "m-",
    storyBranches: "sb-",
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
      else if (column === "title") row[column] = `분기 ${nextIndex}`;
      else if (column === "chapter") row[column] = nextIndex;
      else if (column === "event") row[column] = "새 장면 본문을 입력하세요.";
      else if (column.startsWith("option")) row[column] = column === "optionA" ? "선택 A" : column === "optionB" ? "선택 B" : "선택 C";
      else if (column.startsWith("flag")) row[column] = `branch_${nextIndex}_${column.slice(-1)}`;
      else if (column === "monsterIds" || column === "skillIds" || column === "storyPages") row[column] = [];
      else if (column === "characters" || column === "monsters" || column === "systems") row[column] = [];
      else if (column === "theme") row[column] = "새로운 이야기의 주제";
      else if (column === "world") row[column] = "새로운 이야기의 무대";
      else if (column === "beats") {
        row[column] = Array.from({ length: 12 }, (_, beatIndex) => ({
          id: `beat-${String(beatIndex + 1).padStart(2, "0")}`,
          title: `Beat ${beatIndex + 1}`,
          sequences: [
            {
              id: `sequence-${String(beatIndex + 1).padStart(2, "0")}-01`,
              title: `Sequence ${beatIndex + 1}-1`,
              scenes: [
                {
                  id: `scene-${String(beatIndex + 1).padStart(2, "0")}-01-01`,
                  title: `Scene ${beatIndex + 1}-1-1`,
                  event: "장면 본문을 입력하세요.",
                  dramaticBeats: ["긴장 상승", "반전", "감정 여운"]
                }
              ]
            }
          ]
        }));
      }
      else if (column === "description" || column === "effect") row[column] = "";
      else if (column === "rarity") row[column] = "normal";
      else if (column === "eventType") row[column] = "adventure";
      else if (column === "eventTier") row[column] = "common";
      else if (column === "rewardHint") row[column] = "작은 보급과 기록 단서를 얻는다.";
      else if (column === "riskHint") row[column] = "상황 악화 시 체력과 자원을 소모할 수 있다.";
      else if (column === "element") row[column] = "fire";
      else if (column === "className") row[column] = "방랑자";
      else if (column === "nation") row[column] = "무소속";
      else if (column === "slot") row[column] = String(sheetPanel) === "equipments" ? "armor" : "weapon";
      else if (column === "type") row[column] = "consumable";
      else if (column === "kind") row[column] = "attack";
      else if (column === "powerMultiplier") row[column] = 1.1;
      else if (column === "cooldown") row[column] = 1;
      else if (column === "str") row[column] = 12;
      else if (column === "agi") row[column] = 10;
      else if (column === "luk") row[column] = 8;
      else if (column === "intel") row[column] = 9;
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
      <h3 className="admin-shell-title">ADMIN SHEET EDITOR</h3>
      <div className="editor-layout">
        <aside className="editor-tree">
          <p className="tree-folder">sheet/</p>
          <p className="tree-folder">world · 세계</p>
          {(["stories", "maps", "characters", "monsters", "storyBranches"] as const).map((name) => (
            <button
              key={name}
              className={`tree-item ${panel === name ? "active" : ""}`}
              onClick={() => {
                setPanel(name);
              }}
            >
              <span className="tree-item-id">{name}</span>
              <span className="tree-item-label">{panelTitles[name]}</span>
            </button>
          ))}
          <p className="tree-folder">systems · 시스템</p>
          {(["skills", "weapons", "equipments", "items"] as const).map((name) => (
            <button
              key={name}
              className={`tree-item ${panel === name ? "active" : ""}`}
              onClick={() => {
                setPanel(name);
              }}
            >
              <span className="tree-item-id">{name}</span>
              <span className="tree-item-label">{panelTitles[name]}</span>
            </button>
          ))}
          <p className="tree-folder">docs · 문서</p>
          <button type="button" className={`tree-item ${panel === "bible" ? "active" : ""}`} onClick={() => setPanel("bible")}>
            <span className="tree-item-id">bible</span>
            <span className="tree-item-label">{panelTitles.bible}</span>
          </button>
        </aside>
        <div className="editor-content">
          <div className="editor-toolbar">
            <div className="editor-toolbar-main">
              <span className="editor-panel-title">{panelTitles[panel]}</span>
              <span className="editor-meta">
                {sheetPanel ? `${rows.length} rows` : ""} · v{bundle.version}
              </span>
            </div>
            <div className="tab-row">
              <button type="button" onClick={() => exportJson(`sheet-${bundle.version}`, bundle)}>
                export json
              </button>
              <button type="button" onClick={reloadFromBackend}>
                {loading ? "reloading..." : "reload backend"}
              </button>
              {sheetPanel && (
                <button type="button" onClick={addRow}>
                  add row
                </button>
              )}
              {sheetPanel && (
                <button type="button" className="primary" onClick={saveToBackend}>
                  save backend
                </button>
              )}
            </div>
          </div>
          {panel === "bible" ? (
            <EditorSafeBoundary title="World Bible">
              <BibleEditorPanel />
            </EditorSafeBoundary>
          ) : panel === "characters" ? (
            <>
              <CharacterProfileEditor
                rows={rows}
                onChange={(nextRows) => onUpdateBundle({ ...bundle, characters: nextRows as SheetBundle["characters"] })}
                skillOptions={safeSkills.map((skill) => ({ id: skill.id, name: skill.name }))}
              />
              <div className="ai-panel">
                <input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="AI 프롬프트 입력" />
                <button type="button" onClick={onGenerate}>
                  generate rows
                </button>
                <button type="button" onClick={onAssistFirstCell}>
                  assist first cell
                </button>
              </div>
            </>
          ) : sheetPanel ? (
            <>
              <SheetProfileEditor
                sheetName={sheetPanel}
                title={panelTitles[sheetPanel]}
                rows={rows}
                onChange={applyFullSheet}
                skillOptions={safeSkills.map((skill) => ({ id: skill.id, name: skill.name }))}
              />
              <div className="ai-panel">
                <input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="AI 프롬프트 입력" />
                <button type="button" onClick={onGenerate}>
                  generate rows
                </button>
                <button type="button" onClick={onAssistFirstCell}>
                  assist first cell
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
      {error && <pre className="preview error-preview">{error}</pre>}
      {preview && <pre className="preview">{preview}</pre>}
    </section>
  );
};

