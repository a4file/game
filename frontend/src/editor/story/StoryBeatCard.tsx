import { useMemo, useState } from "react";
import type { ScreenplayIntExt, ScriptBlock, ScriptBlockType, SheetBundle, StoryBeat, StoryScene, StorySequence, StorySheet } from "../../rpg/types";
import { buildSceneSlugline } from "../../rpg/story/screenplayExport";
import { emptyScriptBlock } from "../../rpg/story/scriptMeta";

type BeatPane = "narrative" | "scenes";

type SceneCastKey =
  | "castCharacterId"
  | "castMonsterId"
  | "castMapId"
  | "castObjectId"
  | "castDocFaction"
  | "castDocRule"
  | "castDocEvent"
  | "castDocGoal";

interface Props {
  storyId: string;
  story: StorySheet;
  bundle: SheetBundle;
  beat: StoryBeat;
  beatIndex: number;
  narrativeTip: string;
  onUpdateBeat: (beat: StoryBeat) => void;
  onUpdateSequence: (seqIndex: number, seq: StorySequence) => void;
  onUpdateScene: (seqIndex: number, sceneIndex: number, scene: StoryScene) => void;
  defaultSequence: () => StorySequence;
  defaultScene: () => StoryScene;
}

const llmBeatBase = (storyId: string, beatOneBased: number) => `story:${storyId}:beat:${beatOneBased}`;

const SCRIPT_BLOCK_LABELS: Record<ScriptBlockType, string> = {
  action: "지문",
  character: "캐릭터 큐",
  parenthetical: "말꼬리표",
  dialogue: "대사",
  transition: "전환",
  general: "특수 줄"
};

export const StoryBeatCard = ({
  storyId,
  story,
  bundle,
  beat,
  beatIndex,
  narrativeTip,
  onUpdateBeat,
  onUpdateSequence,
  onUpdateScene,
  defaultSequence,
  defaultScene
}: Props) => {
  const [pane, setPane] = useState<BeatPane>("narrative");
  const beatOne = beatIndex + 1;
  const base = llmBeatBase(storyId, beatOne);

  const sceneCastingRows = useMemo(() => {
    const charName = (id: string) => bundle.characters.find((c) => c.id === id)?.name ?? id;
    const monName = (id: string) => bundle.monsters.find((m) => m.id === id)?.name ?? id;
    const mapName = (id: string) => bundle.maps.find((m) => m.id === id)?.name ?? id;
    const itemName = (id: string) => bundle.items.find((i) => i.id === id)?.name ?? id;
    const docLabel = (name: string) => name.replace(/\.md$/i, "") || name;
    const rows: Array<{ field: SceneCastKey; label: string; ids: string[]; fmt: (id: string) => string; llm: string }> = [
      { field: "castCharacterId", label: "인물", ids: story.characters, fmt: charName, llm: "cast_character_id" },
      { field: "castMonsterId", label: "대립·위협", ids: story.monsters, fmt: monName, llm: "cast_monster_id" },
      { field: "castMapId", label: "로케이션", ids: story.mapIds, fmt: mapName, llm: "cast_map_id" },
      { field: "castObjectId", label: "핵심 오브젝트", ids: story.objectIds, fmt: itemName, llm: "cast_object_id" },
      { field: "castDocFaction", label: "DOCS · 세력", ids: story.castDocFactions, fmt: docLabel, llm: "cast_doc_faction" },
      { field: "castDocRule", label: "DOCS · 규칙", ids: story.castDocRules, fmt: docLabel, llm: "cast_doc_rule" },
      { field: "castDocEvent", label: "DOCS · 사건", ids: story.castDocEvents, fmt: docLabel, llm: "cast_doc_event" },
      { field: "castDocGoal", label: "DOCS · 서사 방향", ids: story.castDocGoals, fmt: docLabel, llm: "cast_doc_goal" }
    ];
    return rows;
  }, [story, bundle]);

  const updateBeatMeta = (patch: Partial<StoryBeat>) => {
    onUpdateBeat({ ...beat, ...patch });
  };

  return (
    <details className="story-beat-block" open>
      <summary className="story-beat-summary" title={narrativeTip}>
        <span className="story-beat-index">비트 {beatOne}</span>
        <span className="story-beat-range" title="권장 씬 구간">
          {beat.sceneRangeLabel}
        </span>
        <input
          className="story-beat-title-input"
          value={beat.title}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => updateBeatMeta({ title: e.target.value })}
          title="비트 제목"
          data-llm-key={`${base}:title`}
        />
      </summary>
      <div className="story-beat-body">
        <div className="story-beat-inner-workspace" role="tablist" aria-label={`비트 ${beatOne} 편집 구역`}>
          <button
            type="button"
            role="tab"
            aria-selected={pane === "narrative"}
            className={`story-inner-tab ${pane === "narrative" ? "active" : ""}`}
            onClick={() => setPane("narrative")}
          >
            비트 서사
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={pane === "scenes"}
            className={`story-inner-tab ${pane === "scenes" ? "active" : ""}`}
            onClick={() => setPane("scenes")}
          >
            씬 그룹 · 씬
          </button>
        </div>

        {pane === "narrative" && (
          <fieldset className="story-llm-fieldset">
            <legend className="story-llm-legend">서사 메타 (한 비트 = 한 화면)</legend>
            <p className="story-llm-hint">LLM 프롬프트에 붙일 때는 이 블록만 잘라 쓰면 됩니다.</p>
            <div className="detail-grid story-beat-meta-grid">
              <label className="detail-span-2">
                씬 구간 라벨
                <input
                  value={beat.sceneRangeLabel}
                  onChange={(e) => updateBeatMeta({ sceneRangeLabel: e.target.value })}
                  title="예: 씬 1~8"
                  data-llm-key={`${base}:scene_range_label`}
                  placeholder="예: 씬 1~8"
                />
              </label>
              <label className="detail-span-2">
                역할 (서사)
                <textarea
                  rows={3}
                  value={beat.narrativeRole}
                  onChange={(e) => updateBeatMeta({ narrativeRole: e.target.value })}
                  title="이 비트의 서사적 역할"
                  data-llm-key={`${base}:narrative_role`}
                  placeholder="이 비트에서 관객/플레이어가 알아야 할 서사적 역할을 한 문단으로."
                />
              </label>
              <label className="detail-span-2">
                핵심 (한 줄)
                <input
                  value={beat.narrativeCore}
                  onChange={(e) => updateBeatMeta({ narrativeCore: e.target.value })}
                  title="핵심 질문·요약"
                  data-llm-key={`${base}:narrative_core`}
                  placeholder="한 줄 훅 / 핵심 질문."
                />
              </label>
              <label className="detail-span-2">
                필수 요소
                <textarea
                  rows={3}
                  value={beat.requiredElements}
                  onChange={(e) => updateBeatMeta({ requiredElements: e.target.value })}
                  title="루틴, 반전 등 필수 요소"
                  data-llm-key={`${base}:required_elements`}
                  placeholder="반드시 넣을 장치·복선·장르 루틴을 bullet로."
                />
              </label>
              <label className="detail-span-2">
                감정 축
                <input
                  value={beat.emotionAxis}
                  onChange={(e) => updateBeatMeta({ emotionAxis: e.target.value })}
                  title="감정 상태 변화"
                  data-llm-key={`${base}:emotion_axis`}
                  placeholder="시작 감정 → 끝 감정."
                />
              </label>
            </div>
          </fieldset>
        )}

        {pane === "scenes" && (
          <fieldset className="story-llm-fieldset">
            <legend className="story-llm-legend">씬 그룹 · 씬 (한 화면 = 씬 단위 입력)</legend>
            <p className="story-llm-hint">시퀀스·씬별 LLM 생성 시 아래 키로 필드를 지정할 수 있습니다.</p>
            <div className="story-beat-seq-toolbar">
              <span className="story-beat-seq-label">씬 그룹</span>
              <button
                type="button"
                onClick={() =>
                  onUpdateBeat({
                    ...beat,
                    sequences: [...beat.sequences, defaultSequence()]
                  })
                }
              >
                + 씬 그룹
              </button>
            </div>
            {beat.sequences.map((seq, seqIndex) => {
              const gKey = `${base}:scene_group:${seqIndex + 1}`;
              return (
                <div key={seq.id} className="story-sequence-block" data-llm-scope={gKey}>
                  <div className="story-sequence-head">
                    <label>
                      씬 그룹 제목
                      <input
                        value={seq.title}
                        onChange={(e) => onUpdateSequence(seqIndex, { ...seq, title: e.target.value })}
                        title="이 비트 안의 씬 묶음 이름"
                        data-llm-key={`${gKey}:title`}
                        placeholder="묶음의 목적 (예: 추격 파트 전체)."
                      />
                    </label>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => {
                        const nextSeq = beat.sequences.filter((_, i) => i !== seqIndex);
                        onUpdateBeat({ ...beat, sequences: nextSeq.length > 0 ? nextSeq : [defaultSequence()] });
                      }}
                    >
                      씬 그룹 삭제
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateSequence(seqIndex, {
                          ...seq,
                          scenes: [...seq.scenes, defaultScene()]
                        })
                      }
                    >
                      + 씬
                    </button>
                  </div>
                  {seq.scenes.map((scene, sceneIndex) => {
                    const sKey = `${gKey}:scene:${sceneIndex + 1}`;
                    const mapRow = scene.castMapId ? bundle.maps.find((m) => m.id === scene.castMapId) : undefined;
                    const slugPreviewN = scene.sceneNumber > 0 ? scene.sceneNumber : 1;
                    const slugPreview = buildSceneSlugline(scene, mapRow, slugPreviewN);
                    const patchBlocks = (next: ScriptBlock[]) => onUpdateScene(seqIndex, sceneIndex, { ...scene, scriptBlocks: next });
                    return (
                      <div key={scene.id} className="story-scene-block" data-llm-scope={sKey}>
                        <div className="story-scene-block-head">씬 {sceneIndex + 1}</div>
                        <fieldset className="story-scene-casting story-llm-fieldset story-llm-fieldset--nested">
                          <legend className="story-llm-legend">씬 캐스팅 (보드 연결만)</legend>
                          <p className="story-llm-hint story-llm-hint--inline">
                            LLM이 영상·글을 쓸 때 <strong>누가·어디서·무엇이</strong> 기준이 되도록, 캐스팅보드에 묶인 id만 고릅니다. 목록이 비면 「캐스팅보드」에서 먼저 연결하세요.
                          </p>
                          <div className="story-scene-casting-grid">
                            {sceneCastingRows.map((row) => {
                              const raw = scene[row.field];
                              const cur = typeof raw === "string" && row.ids.includes(raw) ? raw : "";
                              return (
                                <label key={row.field} className="story-scene-casting-field">
                                  <span className="story-scene-casting-label">{row.label}</span>
                                  <select
                                    className="story-scene-casting-select"
                                    value={cur}
                                    disabled={row.ids.length === 0}
                                    data-llm-key={`${sKey}:${row.llm}`}
                                    onChange={(e) => onUpdateScene(seqIndex, sceneIndex, { ...scene, [row.field]: e.target.value })}
                                  >
                                    <option value="">{row.ids.length === 0 ? "캐스팅 없음" : "— 미지정 —"}</option>
                                    {row.ids.map((id) => (
                                      <option key={id} value={id}>
                                        {row.fmt(id)} ({id})
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              );
                            })}
                          </div>
                        </fieldset>
                        <div className="detail-grid">
                          <label className="detail-span-2">
                            씬 제목 (한 줄)
                            <input
                              value={scene.title}
                              onChange={(e) => onUpdateScene(seqIndex, sceneIndex, { ...scene, title: e.target.value })}
                              title="씬 한 줄 제목"
                              data-llm-key={`${sKey}:title`}
                              placeholder="장면을 한 줄로 요약한 제목."
                            />
                          </label>
                          <label className="detail-span-2">
                            본문 (event / 시나리오 본문)
                            <textarea
                              rows={5}
                              value={scene.event}
                              onChange={(e) => onUpdateScene(seqIndex, sceneIndex, { ...scene, event: e.target.value })}
                              title="장면 본문"
                              data-llm-key={`${sKey}:event`}
                              placeholder="대사·지문·연출. LLM이 채울 때는 맥락만 주고 이 칸을 비워 두세요."
                            />
                          </label>
                          <label>
                            목표
                            <input
                              value={scene.sceneGoal}
                              onChange={(e) => onUpdateScene(seqIndex, sceneIndex, { ...scene, sceneGoal: e.target.value })}
                              title="이 씬에서 원하는 것"
                              data-llm-key={`${sKey}:goal`}
                              placeholder="캐릭터가 이번 씬에서 얻고자 하는 것."
                            />
                          </label>
                          <label>
                            충돌
                            <input
                              value={scene.sceneConflict}
                              onChange={(e) => onUpdateScene(seqIndex, sceneIndex, { ...scene, sceneConflict: e.target.value })}
                              title="방해 요소"
                              data-llm-key={`${sKey}:conflict`}
                              placeholder="저항·적·내적 갈등."
                            />
                          </label>
                          <label>
                            변화
                            <input
                              value={scene.sceneChange}
                              onChange={(e) => onUpdateScene(seqIndex, sceneIndex, { ...scene, sceneChange: e.target.value })}
                              title="시작과 끝의 차이"
                              data-llm-key={`${sKey}:change`}
                              placeholder="씬 끝에서 달라진 사실·관계·상태."
                            />
                          </label>
                          <label>
                            감정 비트
                            <input
                              value={scene.emotionBeat}
                              onChange={(e) => onUpdateScene(seqIndex, sceneIndex, { ...scene, emotionBeat: e.target.value })}
                              title="어느 감정 단계인지"
                              data-llm-key={`${sKey}:emotion_beat`}
                              placeholder="감정 호흡 (상승/하강/반전)."
                            />
                          </label>
                          <label className="detail-span-2">
                            dramatic beats (줄바꿈 = 한 항목)
                            <textarea
                              rows={3}
                              value={scene.dramaticBeats.join("\n")}
                              onChange={(e) =>
                                onUpdateScene(seqIndex, sceneIndex, {
                                  ...scene,
                                  dramaticBeats: e.target.value
                                    .split("\n")
                                    .map((s) => s.trim())
                                    .filter(Boolean)
                                })
                              }
                              title="추가 드라마틱 비트 목록"
                              data-llm-key={`${sKey}:dramatic_beats`}
                              placeholder="한 줄에 하나씩 마이크로 비트."
                            />
                          </label>
                        </div>

                        <fieldset className="story-screenplay-fieldset story-llm-fieldset story-llm-fieldset--nested">
                          <legend className="story-llm-legend">극본 슬러그 & 블록</legend>
                          <p className="story-llm-hint story-llm-hint--inline">
                            내보내기 시 슬러그라인이 먼저 오고, 블록이 비어 있으면 위 <strong>본문(event)</strong>만 지문으로 붙습니다. 스토리 개요의 극본 메타에서 표지·작가 줄을 넣을 수 있습니다.
                          </p>
                          <p className="story-slug-preview">
                            슬러그 미리보기 (번호 {scene.sceneNumber > 0 ? scene.sceneNumber : "자동"}): <code>{slugPreview}</code>
                          </p>
                          <div className="detail-grid story-screenplay-slug-grid">
                            <label>
                              씬 번호 (0 = 자동 연번)
                              <input
                                type="number"
                                min={0}
                                value={scene.sceneNumber}
                                onChange={(e) =>
                                  onUpdateScene(seqIndex, sceneIndex, { ...scene, sceneNumber: Math.max(0, Number(e.target.value) || 0) })
                                }
                                data-llm-key={`${sKey}:scene_number`}
                              />
                            </label>
                            <label>
                              INT / EXT
                              <select
                                value={scene.intExt ?? ""}
                                onChange={(e) =>
                                  onUpdateScene(seqIndex, sceneIndex, { ...scene, intExt: e.target.value as ScreenplayIntExt | "" })
                                }
                                data-llm-key={`${sKey}:int_ext`}
                              >
                                <option value="">— 맵 기본 —</option>
                                <option value="INT">INT.</option>
                                <option value="EXT">EXT.</option>
                                <option value="INT_EXT">INT./EXT.</option>
                              </select>
                            </label>
                            <label className="detail-span-2">
                              로케이션 (주) — 비우면 캐스팅 맵 이름
                              <input
                                value={scene.locationPrimary}
                                onChange={(e) => onUpdateScene(seqIndex, sceneIndex, { ...scene, locationPrimary: e.target.value })}
                                data-llm-key={`${sKey}:location_primary`}
                                placeholder="예: BARBERSHOP"
                              />
                            </label>
                            <label className="detail-span-2">
                              로케이션 (부) — 슬러그 -- 뒤
                              <input
                                value={scene.locationSecondary}
                                onChange={(e) => onUpdateScene(seqIndex, sceneIndex, { ...scene, locationSecondary: e.target.value })}
                                data-llm-key={`${sKey}:location_secondary`}
                                placeholder="예: PARRIS ISLAND MARINE BASE"
                              />
                            </label>
                            <label>
                              시간대
                              <input
                                value={scene.timeOfDay}
                                onChange={(e) => onUpdateScene(seqIndex, sceneIndex, { ...scene, timeOfDay: e.target.value })}
                                data-llm-key={`${sKey}:time_of_day`}
                                placeholder="DAY, NIGHT…"
                              />
                            </label>
                            <label className="detail-span-2">
                              슬러그 한 줄 덮어쓰기 (있으면 위 조합 무시)
                              <input
                                value={scene.sluglineOverride}
                                onChange={(e) => onUpdateScene(seqIndex, sceneIndex, { ...scene, sluglineOverride: e.target.value })}
                                data-llm-key={`${sKey}:slugline_override`}
                              />
                            </label>
                          </div>

                          <div className="script-blocks-editor" aria-label="극본 블록">
                            {(scene.scriptBlocks ?? []).map((block, bi) => (
                              <div key={block.id} className="script-block-row">
                                <div className="script-block-row-head">
                                  <select
                                    value={block.type}
                                    onChange={(e) => {
                                      const t = e.target.value as ScriptBlockType;
                                      patchBlocks(
                                        (scene.scriptBlocks ?? []).map((b, j) =>
                                          j === bi ? { ...b, type: t, ...(t !== "character" ? { cueName: undefined, extension: undefined } : {}) } : b
                                        )
                                      );
                                    }}
                                    aria-label={`블록 ${bi + 1} 유형`}
                                  >
                                    {(Object.keys(SCRIPT_BLOCK_LABELS) as ScriptBlockType[]).map((k) => (
                                      <option key={k} value={k}>
                                        {SCRIPT_BLOCK_LABELS[k]}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    type="button"
                                    className="danger script-block-remove"
                                    onClick={() => patchBlocks((scene.scriptBlocks ?? []).filter((_, j) => j !== bi))}
                                  >
                                    블록 삭제
                                  </button>
                                </div>
                                {block.type === "character" ? (
                                  <div className="script-block-cue-row">
                                    <input
                                      placeholder="캐릭터 큐 (대문자)"
                                      value={block.cueName ?? ""}
                                      onChange={(e) =>
                                        patchBlocks(
                                          (scene.scriptBlocks ?? []).map((b, j) => (j === bi ? { ...b, cueName: e.target.value } : b))
                                        )
                                      }
                                    />
                                    <input
                                      placeholder="확장 (V.O., O.S.)"
                                      value={block.extension ?? ""}
                                      onChange={(e) =>
                                        patchBlocks(
                                          (scene.scriptBlocks ?? []).map((b, j) => (j === bi ? { ...b, extension: e.target.value } : b))
                                        )
                                      }
                                    />
                                  </div>
                                ) : null}
                                <textarea
                                  rows={block.type === "dialogue" || block.type === "action" ? 4 : 2}
                                  value={block.text}
                                  onChange={(e) =>
                                    patchBlocks((scene.scriptBlocks ?? []).map((b, j) => (j === bi ? { ...b, text: e.target.value } : b)))
                                  }
                                  placeholder={
                                    block.type === "character"
                                      ? "캐릭터 줄 아래 대사는 별도 「대사」 블록으로 넣는 것을 권장합니다."
                                      : "내용"
                                  }
                                />
                              </div>
                            ))}
                            <div className="script-blocks-toolbar">
                              <button
                                type="button"
                                onClick={() => patchBlocks([...(scene.scriptBlocks ?? []), emptyScriptBlock("action")])}
                              >
                                + 지문 블록
                              </button>
                              <button
                                type="button"
                                onClick={() => patchBlocks([...(scene.scriptBlocks ?? []), emptyScriptBlock("character")])}
                              >
                                + 캐릭터 큐
                              </button>
                              <button
                                type="button"
                                onClick={() => patchBlocks([...(scene.scriptBlocks ?? []), emptyScriptBlock("dialogue")])}
                              >
                                + 대사
                              </button>
                              <button
                                type="button"
                                onClick={() => patchBlocks([...(scene.scriptBlocks ?? []), emptyScriptBlock("transition")])}
                              >
                                + 전환
                              </button>
                            </div>
                          </div>
                        </fieldset>

                        <button
                          type="button"
                          className="danger"
                          onClick={() => {
                            const nextScenes = seq.scenes.filter((_, i) => i !== sceneIndex);
                            onUpdateSequence(seqIndex, {
                              ...seq,
                              scenes: nextScenes.length > 0 ? nextScenes : [defaultScene()]
                            });
                          }}
                        >
                          씬 삭제
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </fieldset>
        )}
      </div>
    </details>
  );
};
