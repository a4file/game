import { useMemo, useState } from "react";
import type { SheetBundle, StoryBeat, StoryPlotSequence, StoryScene, StorySequence, StorySheet } from "../../rpg/types";
import { STORY_BEAT_COUNT } from "../../rpg/story/beatsNormalize";
import { mergeSceneDefaults, SEQUENCE_SLOT_TO_BEAT_INDICES, TWELVE_BEAT_BLUEPRINT } from "../../rpg/story/storyFrameworkDefaults";
import { StoryNarrativeHelp } from "./StoryNarrativeHelp";
import { StoryBeatCard } from "./StoryBeatCard";

type StoryNarrativeWorkspace = "plot_sequences" | "beats";

interface Props {
  story: StorySheet;
  bundle: SheetBundle;
  onChange: (next: StorySheet) => void;
}

const newId = (): string => `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const defaultScene = (): StoryScene =>
  mergeSceneDefaults({
    id: newId(),
    title: "새 씬",
    event: "",
    dramaticBeats: [],
    sceneGoal: "",
    sceneConflict: "",
    sceneChange: "",
    emotionBeat: ""
  });

const defaultSequence = (): StorySequence => ({
  id: newId(),
  title: "새 씬 그룹",
  scenes: [defaultScene()]
});

const plotLlmBase = (storyId: string, slot: number) => `story:${storyId}:plot_sequence:${slot}`;

export const StoryBeatsEditor = ({ story, bundle, onChange }: Props) => {
  const [workspace, setWorkspace] = useState<StoryNarrativeWorkspace>("plot_sequences");
  const [activeSequenceSlot, setActiveSequenceSlot] = useState(1);
  const beats = story.beats;
  const plotSequences = story.plotSequences;

  const beatIndicesForSlot = useMemo(
    () => SEQUENCE_SLOT_TO_BEAT_INDICES[activeSequenceSlot] ?? SEQUENCE_SLOT_TO_BEAT_INDICES[1],
    [activeSequenceSlot]
  );

  const activePlotRow = plotSequences.find((row) => row.slot === activeSequenceSlot) ?? plotSequences[0];

  const setBeats = (next: StoryBeat[]) => {
    onChange({ ...story, beats: next });
  };

  const setPlotSequences = (next: StoryPlotSequence[]) => {
    onChange({ ...story, plotSequences: next });
  };

  const updatePlotSlot = (slot: number, patch: Partial<StoryPlotSequence>) => {
    setPlotSequences(plotSequences.map((row) => (row.slot === slot ? { ...row, ...patch } : row)));
  };

  const updateBeat = (beatIndex: number, beat: StoryBeat) => {
    setBeats(beats.map((b, i) => (i === beatIndex ? beat : b)));
  };

  const updateSequence = (beatIndex: number, seqIndex: number, seq: StorySequence) => {
    const beat = beats[beatIndex];
    if (!beat) return;
    const sequences = beat.sequences.map((s, i) => (i === seqIndex ? seq : s));
    updateBeat(beatIndex, { ...beat, sequences });
  };

  const updateScene = (beatIndex: number, seqIndex: number, sceneIndex: number, scene: StoryScene) => {
    const beat = beats[beatIndex];
    const seq = beat?.sequences[seqIndex];
    if (!seq) return;
    const scenes = seq.scenes.map((sc, i) => (i === sceneIndex ? scene : sc));
    updateSequence(beatIndex, seqIndex, { ...seq, scenes });
  };

  const pBase = activePlotRow ? plotLlmBase(story.id, activePlotRow.slot) : "";

  return (
    <div className="story-beats-editor">
      <div className="story-narrative-workspace-tabs" role="tablist" aria-label="서사 편집 모드">
        <button
          type="button"
          role="tab"
          aria-selected={workspace === "plot_sequences"}
          className={`story-workspace-tab ${workspace === "plot_sequences" ? "active" : ""}`}
          onClick={() => setWorkspace("plot_sequences")}
        >
          플롯 시퀀스 (1~8)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={workspace === "beats"}
          className={`story-workspace-tab ${workspace === "beats" ? "active" : ""}`}
          onClick={() => setWorkspace("beats")}
        >
          비트 · 씬
        </button>
      </div>

      {workspace === "plot_sequences" && (
        <>
          <div className="story-beats-toolbar story-beats-toolbar--compact">
            <StoryNarrativeHelp />
            <p className="story-beats-intro">
              이 화면에서는 <strong>플롯 시퀀스 슬롯</strong>만 다룹니다. 비트·씬은 「비트 · 씬」 탭으로 이동하세요. 입력 필드에는{" "}
              <code>data-llm-key</code> 속성으로 프롬프트에서 필드를 가리킬 수 있습니다.
            </p>
          </div>

          <section className="story-plot-sequences" aria-label="8 시퀀스 플롯 축">
            <h4 className="story-section-title">플롯 시퀀스 (1~8)</h4>
            <p className="story-seq-pagination-hint">한 번에 한 슬롯만 편집합니다. 번호를 눌러 전환하세요.</p>
            <div className="story-seq-pagination" role="tablist" aria-label="플롯 시퀀스 1에서 8">
              {plotSequences.map((row) => (
                <button
                  key={row.slot}
                  type="button"
                  role="tab"
                  aria-selected={activeSequenceSlot === row.slot}
                  className={`story-seq-pagination-btn ${activeSequenceSlot === row.slot ? "active" : ""}`}
                  onClick={() => setActiveSequenceSlot(row.slot)}
                  title={row.title || `시퀀스 ${row.slot}`}
                >
                  {row.slot}
                </button>
              ))}
            </div>
            {activePlotRow && (
              <fieldset className="story-llm-fieldset story-plot-seq-fieldset">
                <legend className="story-llm-legend">시퀀스 {activePlotRow.slot} 메타</legend>
                <div className="story-plot-seq-card story-plot-seq-card--single">
                  <div className="story-plot-seq-head">
                    <span className="story-plot-slot" title={`슬롯 ${activePlotRow.slot}`}>
                      Seq {activePlotRow.slot}
                    </span>
                    <span className="story-plot-covers" title="포함 비트 구간">
                      비트 {activePlotRow.coversBeats}
                    </span>
                  </div>
                  <label>
                    제목
                    <input
                      value={activePlotRow.title}
                      onChange={(e) => updatePlotSlot(activePlotRow.slot, { title: e.target.value })}
                      data-llm-key={`${pBase}:title`}
                      placeholder="이 시퀀스의 한 줄 제목."
                    />
                  </label>
                  <label>
                    플롯 역할
                    <input
                      value={activePlotRow.plotRole}
                      onChange={(e) => updatePlotSlot(activePlotRow.slot, { plotRole: e.target.value })}
                      data-llm-key={`${pBase}:plot_role`}
                      placeholder="이 축이 이야기에서 맡는 역할."
                    />
                  </label>
                  <label>
                    포함 비트 (표기)
                    <input
                      value={activePlotRow.coversBeats}
                      onChange={(e) => updatePlotSlot(activePlotRow.slot, { coversBeats: e.target.value })}
                      data-llm-key={`${pBase}:covers_beats`}
                      placeholder="예: 1~2, 3"
                    />
                  </label>
                  <label className="story-plot-notes">
                    메모 / LLM 컨텍스트
                    <textarea
                      rows={6}
                      value={activePlotRow.notes}
                      onChange={(e) => updatePlotSlot(activePlotRow.slot, { notes: e.target.value })}
                      data-llm-key={`${pBase}:notes`}
                      placeholder="작가 메모, 참고 링크, LLM에 줄 루브릭·금지 사항 등."
                    />
                  </label>
                </div>
              </fieldset>
            )}
          </section>
        </>
      )}

      {workspace === "beats" && (
        <>
          <div className="story-beats-toolbar story-beats-toolbar--compact">
            <StoryNarrativeHelp />
            <p className="story-beats-intro">
              이 화면에서는 <strong>비트·씬</strong>만 다룹니다. 시퀀스 {activeSequenceSlot}에 해당하는 비트{" "}
              <strong>{beatIndicesForSlot.map((i) => i + 1).join(", ")}</strong>번입니다. 각 비트 안에서 다시 「비트 서사」와 「씬 그룹 · 씬」을
              나눕니다 (총 {STORY_BEAT_COUNT}비트 구조). 각 씬 상단의 <strong>씬 캐스팅</strong> 드롭다운으로 캐스팅보드에 연결된 주체·배경·DOCS를 고르면, LLM
              프롬프트에 <code>data-llm-key</code>로 누가·어디서 기준이 박힙니다.
            </p>
          </div>

          <section className="story-beats-section" aria-label="현재 시퀀스 구간 비트">
            <h4 className="story-section-title">비트 — 시퀀스 {activeSequenceSlot} (비트 {activePlotRow?.coversBeats ?? "?"})</h4>
            <p className="story-seq-pagination-hint">다른 시퀀스 구간을 보려면 번호를 누른 뒤, 필요하면 「플롯 시퀀스」 탭에서 메타를 편집하세요.</p>
            <div className="story-seq-pagination" role="tablist" aria-label="필터용 시퀀스 슬롯">
              {plotSequences.map((row) => (
                <button
                  key={row.slot}
                  type="button"
                  role="tab"
                  aria-selected={activeSequenceSlot === row.slot}
                  className={`story-seq-pagination-btn ${activeSequenceSlot === row.slot ? "active" : ""}`}
                  onClick={() => setActiveSequenceSlot(row.slot)}
                  title={row.title || `시퀀스 ${row.slot}`}
                >
                  {row.slot}
                </button>
              ))}
            </div>
          </section>

          {beatIndicesForSlot.map((beatIndex) => {
            const beat = beats[beatIndex];
            if (!beat) return null;
            const tip = TWELVE_BEAT_BLUEPRINT[beatIndex]?.narrativeCore ?? "";
            return (
              <StoryBeatCard
                key={beat.id}
                storyId={story.id}
                story={story}
                bundle={bundle}
                beat={beat}
                beatIndex={beatIndex}
                narrativeTip={tip}
                defaultScene={defaultScene}
                defaultSequence={defaultSequence}
                onUpdateBeat={(next) => updateBeat(beatIndex, next)}
                onUpdateSequence={(seqIndex, seq) => updateSequence(beatIndex, seqIndex, seq)}
                onUpdateScene={(seqIndex, sceneIndex, scene) => updateScene(beatIndex, seqIndex, sceneIndex, scene)}
              />
            );
          })}
        </>
      )}
    </div>
  );
};
