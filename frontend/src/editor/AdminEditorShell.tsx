import { useEffect, useMemo, useState, type ReactNode } from "react";
import axios from "axios";
import { BibleEditorPanel } from "./BibleEditorPanel";
import { CharacterProfileEditor } from "./CharacterProfileEditor";
import { EditorSafeBoundary } from "./EditorSafeBoundary";
import { SheetProfileEditor } from "./SheetProfileEditor";
import { exportJson } from "./importExport";
import { generateRowsWithAi, assistCellWithAi } from "./ai/editorAiClient";
import type { ScriptMeta, SheetBundle } from "../rpg/types";
import { getApiBaseUrl } from "../apiBase";
import { formatApiFailure } from "../apiErrors";
import {
  normalizeStorySheetShape,
  normalizeStoriesInBundle,
  STORY_BEAT_COUNT,
  STORY_SEQUENCE_COUNT
} from "../rpg/story/beatsNormalize";
import { StoryBeatsEditor } from "./story/StoryBeatsEditor";
import { orphanStoryBranches, StoryWorldPanel } from "./story/StoryWorldPanel";
import { DOC_CATEGORY_ORDER } from "./docs/docCategories";
import { mergeScriptMeta } from "../rpg/story/scriptMeta";
import { storyToScreenplayText } from "../rpg/story/screenplayExport";

type TopSection = "stories" | "systems" | "docs";
type StoryPane = "overview" | "world" | "beats";
type SystemsDataSheet = "maps" | "characters" | "monsters" | "skills" | "weapons" | "equipments" | "items";
type SystemsSheet = SystemsDataSheet | "orphanBranches";

const SYSTEM_NAV_ORDER: SystemsDataSheet[] = ["maps", "characters", "monsters", "skills", "weapons", "equipments", "items"];

const systemsTitles: Record<SystemsDataSheet, string> = {
  maps: "로케이션",
  characters: "인물",
  monsters: "대립·위협",
  skills: "연출 블록",
  weapons: "소품(무기류)",
  equipments: "의상·착용 소품",
  items: "오브젝트"
};

interface Props {
  bundle: SheetBundle;
  onUpdateBundle: (next: SheetBundle) => void;
}

export const AdminEditorShell = ({ bundle, onUpdateBundle }: Props) => {
  const [topSection, setTopSection] = useState<TopSection>("stories");
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  const [storyPane, setStoryPane] = useState<StoryPane>("overview");
  const [systemsPanel, setSystemsPanel] = useState<SystemsSheet>("skills");
  const [prompt, setPrompt] = useState("");
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const safeSkills = Array.isArray(bundle.skills) ? bundle.skills : [];
  const skillOptions = safeSkills.map((skill) => ({ id: skill.id, name: skill.name }));

  const commitBundle = (next: SheetBundle) => {
    onUpdateBundle(normalizeStoriesInBundle(next));
  };

  const selectedStory = useMemo(
    () => bundle.stories.find((s) => s.id === selectedStoryId) ?? null,
    [bundle.stories, selectedStoryId]
  );

  const storiesSorted = useMemo(
    () => [...bundle.stories].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })),
    [bundle.stories]
  );

  useEffect(() => {
    if (bundle.stories.length === 0) {
      setSelectedStoryId(null);
      return;
    }
    if (!selectedStoryId || !bundle.stories.some((s) => s.id === selectedStoryId)) {
      const sorted = [...bundle.stories].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
      setSelectedStoryId(sorted[0]?.id ?? null);
    }
  }, [bundle.stories, selectedStoryId]);

  const validateBundle = (candidate: SheetBundle): string[] => {
    const issues: string[] = [];
    if (!Array.isArray(candidate.skills)) {
      issues.push("skills 배열이 없습니다.");
      return issues;
    }
    const skillIds = new Set(candidate.skills.map((skill) => skill.id));
    const itemIds = new Set((candidate.items ?? []).map((i) => i.id));
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
    candidate.stories.forEach((story, idx) => {
      if (!Array.isArray(story.mapIds)) issues.push(`stories[${idx}].mapIds가 배열이 아닙니다.`);
      if (Array.isArray(story.objectIds)) {
        story.objectIds.forEach((oid) => {
          if (!itemIds.has(oid)) issues.push(`stories[${idx}] objectIds에 없는 item id: ${oid}`);
        });
      }
      if (!Array.isArray(story.plotSequences) || story.plotSequences.length !== STORY_SEQUENCE_COUNT) {
        issues.push(`stories[${idx}] plotSequences는 정확히 ${STORY_SEQUENCE_COUNT}개여야 합니다.`);
      }
      if (story.beats.length !== STORY_BEAT_COUNT) {
        issues.push(`stories[${idx}] beats는 정확히 ${STORY_BEAT_COUNT}개여야 합니다 (현재 ${story.beats.length}).`);
      }
    });
    return issues.slice(0, 12);
  };

  const saveToBackend = async () => {
    const normalized = normalizeStoriesInBundle(bundle);
    const issues = validateBundle(normalized);
    if (issues.length > 0) {
      setError(issues.join("\n"));
      setPreview("[ERR] validation failed");
      return;
    }
    setError("");
    try {
      const api = axios.create({ baseURL: getApiBaseUrl(), timeout: 30_000 });
      const url = `${getApiBaseUrl().replace(/\/?$/, "")}/editor/sheets`;
      const { data } = await api.post<SheetBundle>("/editor/sheets", normalized);
      commitBundle(data);
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
      commitBundle(data);
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

  const nextStoryIdAndTitle = (): { id: string; title: string } => {
    let max = 0;
    for (const s of bundle.stories) {
      const m = /^story-(\d+)$/.exec(s.id);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    const n = max + 1;
    const id = `story-${String(n).padStart(3, "0")}`;
    return { id, title: `STORY${n}` };
  };

  const addStory = () => {
    const { id: nextId, title: nextTitle } = nextStoryIdAndTitle();
    const blank = normalizeStorySheetShape({
      id: nextId,
      title: nextTitle,
      theme: "",
      world: "",
      mapIds: [],
      characters: [],
      monsters: [],
      objectIds: [],
      castDocFactions: [],
      castDocRules: [],
      castDocEvents: [],
      castDocGoals: [],
      systems: [],
      plotSequences: [],
      beats: []
    });
    commitBundle({
      ...bundle,
      stories: [...bundle.stories, blank]
    });
    setSelectedStoryId(blank.id);
    setStoryPane("overview");
    setTopSection("stories");
    setPreview(`[SYS] story added: ${blank.id}`);
  };

  const deleteStory = (id: string) => {
    if (!window.confirm("이 스토리를 삭제할까요?")) return;
    const nextStories = bundle.stories.filter((s) => s.id !== id);
    const prefix = `${id}-`;
    const nextBranches = bundle.storyBranches.filter((b) => !b.id.startsWith(prefix));
    commitBundle({
      ...bundle,
      stories: nextStories,
      storyBranches: nextBranches
    });
    const sortedNext = [...nextStories].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    setSelectedStoryId(sortedNext[0]?.id ?? null);
    setPreview("[SYS] story removed");
  };

  const duplicateStory = (id: string) => {
    const src = bundle.stories.find((s) => s.id === id);
    if (!src) return;
    const copy = normalizeStorySheetShape({
      ...src,
      id: `${src.id}-copy-${Date.now()}`,
      title: `${src.title} (복사)`
    });
    commitBundle({ ...bundle, stories: [...bundle.stories, copy] });
    setSelectedStoryId(copy.id);
    setPreview(`[SYS] story duplicated: ${copy.id}`);
  };

  const systemsRows =
    systemsPanel === "orphanBranches"
      ? (orphanStoryBranches(bundle) as unknown as Array<Record<string, unknown>>)
      : ((bundle[systemsPanel] as unknown as Array<Record<string, unknown>>) ?? []);

  const applySystemsSheet = (nextRows: Array<Record<string, unknown>>) => {
    if (systemsPanel === "orphanBranches") {
      const storyOwned = bundle.storyBranches.filter((b) => bundle.stories.some((s) => b.id.startsWith(`${s.id}-`)));
      commitBundle({
        ...bundle,
        storyBranches: [...storyOwned, ...(nextRows as unknown as SheetBundle["storyBranches"])]
      });
      return;
    }
    commitBundle({
      ...bundle,
      [systemsPanel]: nextRows as never
    });
  };

  const onGenerate = async () => {
    if (topSection !== "systems" || systemsPanel === "orphanBranches") return;
    const text = await generateRowsWithAi(systemsPanel, prompt);
    setPreview(text);
  };

  const onAssistFirstCell = async () => {
    if (topSection !== "systems" || systemsPanel === "orphanBranches" || !systemsRows[0]) return;
    const suggestion = await assistCellWithAi(
      systemsPanel,
      systemsRows[0],
      "name",
      "영화 시나리오 크레딧에 어울리는 이름으로 다듬어 줘. 전투·스탯 말고 장르 톤만."
    );
    setPreview(suggestion);
  };

  const addSystemsRow = () => {
    if (systemsPanel === "orphanBranches") return;
    const panel = systemsPanel;
    const rows = (bundle[panel] as Array<Record<string, unknown>>) ?? [];
    const prefixes: Record<string, string> = {
      maps: "st-",
      characters: "c-",
      monsters: "m-",
      skills: "sk-",
      weapons: "w-",
      items: "i-",
      equipments: "e-"
    };
    const nextIndex = rows.length + 1;
    const nextId = `${prefixes[panel] ?? "row-"}${String(nextIndex).padStart(3, "0")}`;
    const row: Record<string, unknown> = { id: nextId, name: `${panel}-${String(nextIndex).padStart(3, "0")}` };
    if (panel === "maps") {
      Object.assign(row, { recommendedPower: 1, monsterIds: [] });
    } else if (panel === "characters") {
      Object.assign(row, {
        description: "",
        appearance: "",
        personality: "",
        generationPrompt: "",
        rarity: "normal",
        className: "",
        nation: "",
        element: "fire",
        str: 10,
        agi: 10,
        luk: 10,
        intel: 10,
        atk: 10,
        hp: 100,
        skillIds: [],
        maxPages: 99,
        storyPages: []
      });
    } else if (panel === "monsters") {
      Object.assign(row, { rarity: "normal", element: "fire", str: 10, agi: 10, luk: 10, intel: 10, atk: 10, hp: 100, skillIds: [] });
    } else if (panel === "skills") {
      Object.assign(row, { description: "", powerMultiplier: 1.1, cooldown: 1, kind: "attack" });
    } else if (panel === "weapons" || panel === "equipments") {
      Object.assign(row, { slot: panel === "equipments" ? "armor" : "weapon", rarity: "normal", skillIds: [], atk: 0, hp: 0 });
    } else if (panel === "items") {
      Object.assign(row, { type: "consumable", effect: "", amount: 0 });
    }
    commitBundle({ ...bundle, [panel]: [...rows, row] } as SheetBundle);
    setPreview(`[SYS] ${panel} row added`);
  };

  const systemsAiPanel: ReactNode =
    topSection === "systems" && systemsPanel !== "orphanBranches" ? (
      <div className="ai-panel">
        <input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="AI 프롬프트 입력" />
        <button type="button" onClick={() => void onGenerate()}>
          generate rows
        </button>
        <button type="button" onClick={() => void onAssistFirstCell()}>
          assist first cell
        </button>
      </div>
    ) : null;

  return (
    <section className="admin-shell">
      <div className="editor-layout">
        <aside className="editor-tree editor-tree--story-first">
          <div className="editor-top-nav" role="navigation" aria-label="에디터 상단 구역">
            <button type="button" className={`editor-top-nav-btn ${topSection === "stories" ? "active" : ""}`} onClick={() => setTopSection("stories")}>
              <span className="editor-top-nav-title">STORY</span>
              <span className="editor-top-nav-sub">영화 1편 단위 서사 · 씬/비트</span>
            </button>
            <button type="button" className={`editor-top-nav-btn ${topSection === "systems" ? "active" : ""}`} onClick={() => setTopSection("systems")}>
              <span className="editor-top-nav-title">SYSTEM</span>
              <span className="editor-top-nav-sub">세계 규칙 · 능력 · 물리법칙</span>
            </button>
            <button type="button" className={`editor-top-nav-btn ${topSection === "docs" ? "active" : ""}`} onClick={() => setTopSection("docs")}>
              <span className="editor-top-nav-title">DOCS</span>
              <span className="editor-top-nav-sub">설정 · 종족 · 기술 · 조직 · 역사</span>
            </button>
          </div>

          {topSection === "stories" && (
            <div className="editor-tree-pane-stack">
              <div className="editor-tree-pane editor-tree-pane--head">
                <div className="tree-folder-row">
                  <span className="tree-folder tree-folder--inline">stories</span>
                  <button type="button" className="tree-folder-add" onClick={addStory} title="새 스토리 추가" aria-label="새 스토리 추가">
                    +
                  </button>
                </div>
              </div>
              <div className="editor-tree-pane editor-tree-pane--scroll">
                {storiesSorted.length === 0 ? (
                  <p className="editor-story-empty">스토리가 없습니다. 위 + 로 추가하세요.</p>
                ) : (
                  <div className="editor-story-dropdown-stack">
                    <label className="editor-story-select-label" htmlFor="editor-story-select">
                      스토리 선택
                    </label>
                    <select
                      id="editor-story-select"
                      className="editor-story-select"
                      value={selectedStoryId ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (!v) return;
                        setSelectedStoryId(v);
                        setStoryPane("overview");
                      }}
                    >
                      {storiesSorted.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.id} — {s.title || "(제목 없음)"}
                        </option>
                      ))}
                    </select>
                    {selectedStoryId ? (
                      <>
                        <div className="story-tree-children story-tree-children--story-dropdown" role="tablist" aria-label="스토리 하위 화면">
                          <button type="button" className={`tree-item tree-item--child ${storyPane === "overview" ? "active" : ""}`} onClick={() => setStoryPane("overview")}>
                            개요
                          </button>
                          <button type="button" className={`tree-item tree-item--child editor-story-tab-casting ${storyPane === "world" ? "active" : ""}`} onClick={() => setStoryPane("world")}>
                            캐스팅보드
                          </button>
                          <button type="button" className={`tree-item tree-item--child ${storyPane === "beats" ? "active" : ""}`} onClick={() => setStoryPane("beats")}>
                            비트 / 시퀀스
                          </button>
                        </div>
                        <div className="editor-story-row-actions">
                          <button type="button" className="editor-story-row-btn" onClick={() => duplicateStory(selectedStoryId)}>
                            복사
                          </button>
                          <button type="button" className="editor-story-row-btn editor-story-row-btn--danger" onClick={() => deleteStory(selectedStoryId)}>
                            삭제
                          </button>
                        </div>
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          )}

          {topSection === "systems" && (
            <div className="editor-tree-pane-stack">
              <div className="editor-tree-pane editor-tree-pane--head">
                <p className="tree-folder tree-folder--pane-head">systems</p>
              </div>
              <div className="editor-tree-pane editor-tree-pane--scroll">
              {SYSTEM_NAV_ORDER.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={`tree-item ${systemsPanel === name ? "active" : ""}`}
                  onClick={() => setSystemsPanel(name)}
                >
                  <span className="tree-item-id">{name}</span>
                  <span className="tree-item-label">{systemsTitles[name]}</span>
                </button>
              ))}
              <button
                type="button"
                className={`tree-item ${systemsPanel === "orphanBranches" ? "active" : ""}`}
                onClick={() => setSystemsPanel("orphanBranches")}
              >
                <span className="tree-item-id">orphans</span>
                <span className="tree-item-label">미할당 스토리 분기</span>
              </button>
              </div>
            </div>
          )}

          {topSection === "docs" && (
            <div className="editor-tree-pane-stack">
              <div className="editor-tree-pane editor-tree-pane--head">
                <div className="tree-folder-row tree-folder-row--single">
                  <span className="tree-folder tree-folder--inline">docs</span>
                </div>
              </div>
              <div className="editor-tree-pane editor-tree-pane--scroll">
                <p className="docs-tree-lead">카테고리별 문서는 오른쪽 패널 목록에서 고릅니다.</p>
                {DOC_CATEGORY_ORDER.map((c) => (
                  <div key={c.id} className="docs-tree-category">
                    <span className="docs-tree-cat-title">{c.label}</span>
                    <span className="docs-tree-cat-hint">{c.hint}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>

        <div className="editor-content">
          <div className="editor-toolbar">
            <div className="editor-toolbar-main">
              <span className="editor-panel-title">
                {topSection === "stories" && (selectedStory ? `${selectedStory.title}` : "스토리")}
                {topSection === "systems" &&
                  (systemsPanel === "orphanBranches" ? "미할당 스토리 분기" : systemsTitles[systemsPanel as SystemsDataSheet])}
                {topSection === "docs" && "DOCS · Mythic Archive"}
              </span>
              <span className="editor-meta">
                {topSection === "systems" && systemsPanel !== "orphanBranches" ? `${systemsRows.length} rows · ` : ""}
                v{bundle.version}
              </span>
            </div>
            <div className="tab-row">
              <button type="button" onClick={() => exportJson(`sheet-${bundle.version}`, bundle)}>
                export json
              </button>
              <button type="button" onClick={reloadFromBackend}>
                {loading ? "reloading..." : "reload backend"}
              </button>
              {topSection === "systems" && systemsPanel !== "orphanBranches" && (
                <button type="button" onClick={addSystemsRow}>
                  add row
                </button>
              )}
              <button type="button" className="primary" onClick={saveToBackend}>
                save backend
              </button>
            </div>
          </div>

          {topSection === "docs" && (
            <EditorSafeBoundary title="DOCS">
              <BibleEditorPanel />
            </EditorSafeBoundary>
          )}

          {topSection === "systems" && systemsPanel === "maps" && (
            <>
              <SheetProfileEditor sheetName="maps" title={systemsTitles.maps} rows={systemsRows} onChange={applySystemsSheet} skillOptions={skillOptions} />
              {systemsAiPanel}
            </>
          )}

          {topSection === "systems" && systemsPanel === "characters" && (
            <>
              <CharacterProfileEditor rows={systemsRows} onChange={applySystemsSheet} skillOptions={skillOptions} />
              {systemsAiPanel}
            </>
          )}

          {topSection === "systems" && systemsPanel === "monsters" && (
            <>
              <SheetProfileEditor sheetName="monsters" title={systemsTitles.monsters} rows={systemsRows} onChange={applySystemsSheet} skillOptions={skillOptions} />
              {systemsAiPanel}
            </>
          )}

          {topSection === "systems" && systemsPanel === "skills" && (
            <>
              <SheetProfileEditor sheetName="skills" title={systemsTitles.skills} rows={systemsRows} onChange={applySystemsSheet} skillOptions={skillOptions} />
              {systemsAiPanel}
            </>
          )}

          {topSection === "systems" && systemsPanel === "weapons" && (
            <>
              <SheetProfileEditor sheetName="weapons" title={systemsTitles.weapons} rows={systemsRows} onChange={applySystemsSheet} skillOptions={skillOptions} />
              {systemsAiPanel}
            </>
          )}

          {topSection === "systems" && systemsPanel === "equipments" && (
            <>
              <SheetProfileEditor sheetName="equipments" title={systemsTitles.equipments} rows={systemsRows} onChange={applySystemsSheet} skillOptions={skillOptions} />
              {systemsAiPanel}
            </>
          )}

          {topSection === "systems" && systemsPanel === "items" && (
            <>
              <SheetProfileEditor sheetName="items" title={systemsTitles.items} rows={systemsRows} onChange={applySystemsSheet} skillOptions={skillOptions} />
              {systemsAiPanel}
            </>
          )}

          {topSection === "systems" && systemsPanel === "orphanBranches" && (
            <SheetProfileEditor
              sheetName="storyBranches"
              title="스토리 ID 접두사에 매칭되지 않는 분기"
              rows={systemsRows}
              onChange={applySystemsSheet}
              skillOptions={skillOptions}
            />
          )}

          {topSection === "stories" && selectedStory && storyPane === "overview" && (
            <div className="story-overview detail-grid">
              {(() => {
                const sm = mergeScriptMeta(selectedStory.scriptMeta);
                const patchScriptMeta = (patch: Partial<ScriptMeta>) =>
                  commitBundle({
                    ...bundle,
                    stories: bundle.stories.map((s) =>
                      s.id === selectedStory.id ? { ...s, scriptMeta: mergeScriptMeta({ ...sm, ...patch }) } : s
                    )
                  });
                return (
                  <fieldset className="story-overview-script-meta">
                    <legend>극본 메타 (표지·내보내기)</legend>
                    <div className="detail-grid">
                      <label>
                        극본 제목 (비우면 스토리 title)
                        <input value={sm.scriptTitle} onChange={(e) => patchScriptMeta({ scriptTitle: e.target.value })} placeholder="스크린플레이 표지 제목" />
                      </label>
                      <label>
                        에피소드 / 부제
                        <input value={sm.episodeTitle} onChange={(e) => patchScriptMeta({ episodeTitle: e.target.value })} />
                      </label>
                      <label>
                        초고 / 리비전
                        <input value={sm.draftLabel} onChange={(e) => patchScriptMeta({ draftLabel: e.target.value })} placeholder="Draft 2026-05-09" />
                      </label>
                      <label className="detail-span-2">
                        작가 (Written by)
                        <input value={sm.writtenBy} onChange={(e) => patchScriptMeta({ writtenBy: e.target.value })} />
                      </label>
                      <label className="detail-span-2">
                        원작 (Based on)
                        <input value={sm.basedOn} onChange={(e) => patchScriptMeta({ basedOn: e.target.value })} />
                      </label>
                      <label className="detail-span-2">
                        연락처 / 저작권 한 줄
                        <input value={sm.contact} onChange={(e) => patchScriptMeta({ contact: e.target.value })} />
                      </label>
                      <label className="detail-span-2">
                        비고
                        <input value={sm.revisionNote} onChange={(e) => patchScriptMeta({ revisionNote: e.target.value })} />
                      </label>
                      <label>
                        자동 씬 번호 시작값
                        <input
                          type="number"
                          min={1}
                          value={sm.pageNumberStart}
                          onChange={(e) => patchScriptMeta({ pageNumberStart: Math.max(1, Number(e.target.value) || 1) })}
                          title="씬 번호가 0인 장면의 연번 시작값"
                        />
                      </label>
                    </div>
                    <div className="story-overview-actions story-overview-script-meta-actions">
                      <button
                        type="button"
                        onClick={() => {
                          const text = storyToScreenplayText(selectedStory, bundle);
                          void navigator.clipboard.writeText(text);
                          setPreview("[SYS] 극본 플레인 텍스트를 클립보드에 복사했습니다.");
                        }}
                      >
                        극본 텍스트 클립보드 복사
                      </button>
                    </div>
                  </fieldset>
                );
              })()}
              <label className="detail-span-2">
                id
                <input value={selectedStory.id} readOnly />
              </label>
              <label className="detail-span-2">
                title
                <input
                  value={selectedStory.title}
                  onChange={(e) =>
                    commitBundle({
                      ...bundle,
                      stories: bundle.stories.map((s) => (s.id === selectedStory.id ? { ...s, title: e.target.value } : s))
                    })
                  }
                />
              </label>
              <label className="detail-span-2">
                theme
                <input
                  value={selectedStory.theme}
                  onChange={(e) =>
                    commitBundle({
                      ...bundle,
                      stories: bundle.stories.map((s) => (s.id === selectedStory.id ? { ...s, theme: e.target.value } : s))
                    })
                  }
                />
              </label>
              <label className="detail-span-2">
                world (설명)
                <textarea
                  rows={3}
                  value={selectedStory.world}
                  onChange={(e) =>
                    commitBundle({
                      ...bundle,
                      stories: bundle.stories.map((s) => (s.id === selectedStory.id ? { ...s, world: e.target.value } : s))
                    })
                  }
                />
              </label>
              <label className="detail-span-2">
                systems (줄바꿈 = 한 항목)
                <textarea
                  rows={4}
                  value={selectedStory.systems.join("\n")}
                  onChange={(e) =>
                    commitBundle({
                      ...bundle,
                      stories: bundle.stories.map((s) =>
                        s.id === selectedStory.id
                          ? {
                              ...s,
                              systems: e.target.value
                                .split("\n")
                                .map((line) => line.trim())
                                .filter(Boolean)
                            }
                          : s
                      )
                    })
                  }
                />
              </label>
              <div className="detail-span-2 story-overview-actions">
                <button type="button" onClick={() => duplicateStory(selectedStory.id)}>
                  스토리 복제
                </button>
                <button type="button" className="danger" onClick={() => deleteStory(selectedStory.id)}>
                  스토리 삭제
                </button>
              </div>
              <p className="detail-span-2 story-overview-hint">맵·캐릭터·몬스터·분기 연결은 왼쪽 메뉴의 「캐스팅보드」에서 하세요.</p>
            </div>
          )}

          {topSection === "stories" && selectedStory && storyPane === "world" && (
            <StoryWorldPanel bundle={bundle} story={selectedStory} onUpdateBundle={commitBundle} />
          )}

          {topSection === "stories" && selectedStory && storyPane === "beats" && (
            <StoryBeatsEditor
              story={selectedStory}
              bundle={bundle}
              onChange={(next) =>
                commitBundle({
                  ...bundle,
                  stories: bundle.stories.map((s) => (s.id === selectedStory.id ? normalizeStorySheetShape(next) : s))
                })
              }
            />
          )}

          {topSection === "stories" && !selectedStory && <p className="sheet-profile-empty">스토리를 추가하거나 번들을 불러오세요.</p>}
        </div>
      </div>
      {error && <pre className="preview error-preview">{error}</pre>}
      {preview && <pre className="preview">{preview}</pre>}
    </section>
  );
};
