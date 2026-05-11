import type { StoryBeat, StoryPlotSequence, StoryScene } from "../types";
import { normalizeScreenplayIntExt, normalizeScriptBlocks } from "./scriptMeta";

/** 12비트 × 권장 씬 구간(100씬 설계 기준) + 서사 역할 요약 */
export const TWELVE_BEAT_BLUEPRINT: ReadonlyArray<{
  title: string;
  sceneRangeLabel: string;
  narrativeRole: string;
  narrativeCore: string;
  requiredElements: string;
  emotionAxis: string;
}> = [
  {
    title: "1비트 — 일상과 결핍",
    sceneRangeLabel: "씬 1~8",
    narrativeRole: "세계관 소개, 주인공의 결핍 제시, 아직 사건 전 상태",
    narrativeCore: "무엇이 부족한 인간인가?",
    requiredElements: "루틴, 관계, 숨겨진 불만, 작은 이상징후",
    emotionAxis: "안정 + 미세한 불안"
  },
  {
    title: "2비트 — 촉발 사건",
    sceneRangeLabel: "씬 9~16",
    narrativeRole: "이야기가 강제로 시작됨, 이전 삶으로 못 돌아가게 되는 사건",
    narrativeCore: "문제가 생겼다",
    requiredElements: "사고, 의뢰, 침입, 발견, 상실",
    emotionAxis: "혼란, 거부, 긴장 시작"
  },
  {
    title: "3비트 — 첫 선택",
    sceneRangeLabel: "씬 17~25",
    narrativeRole: "주인공이 행동을 결정, Act 1 종료",
    narrativeCore: "그래, 해보자",
    requiredElements: "목표 설정, 동료/도구 획득, 첫 진입",
    emotionAxis: "기대, 자신감, 낙관"
  },
  {
    title: "4비트 — 탐색과 적응",
    sceneRangeLabel: "씬 26~33",
    narrativeRole: "새로운 세계 학습, 규칙 이해",
    narrativeCore: "생각보다 복잡하다",
    requiredElements: "테스트, 정보수집, 작은 승리, 캐릭터 관계 구축",
    emotionAxis: "재미, 호기심, 성장감"
  },
  {
    title: "5비트 — 첫 충돌과 대가",
    sceneRangeLabel: "씬 34~41",
    narrativeRole: "적의 존재가 현실화, 승리에 비용 발생",
    narrativeCore: "이건 위험하다",
    requiredElements: "첫 큰 실패, 희생, 내부 갈등",
    emotionAxis: "압박, 긴장 상승"
  },
  {
    title: "6비트 — 미드포인트",
    sceneRangeLabel: "씬 42~50",
    narrativeRole: "이야기 방향이 뒤집힘, 진실 일부 공개",
    narrativeCore: "상황이 완전히 달랐다",
    requiredElements: "반전, 배신, 진짜 목표 발견, 거짓 승리 또는 거짓 패배",
    emotionAxis: "충격, 가속"
  },
  {
    title: "7비트 — 추락 시작",
    sceneRangeLabel: "씬 51~58",
    narrativeRole: "미드포인트 이후 후폭풍, 통제력 상실",
    narrativeCore: "점점 망한다",
    requiredElements: "관계 붕괴, 적의 반격, 실수 누적",
    emotionAxis: "불안, 피로, 균열"
  },
  {
    title: "8비트 — 모든 것이 무너짐",
    sceneRangeLabel: "씬 59~66",
    narrativeRole: "최악의 상황 도달, 내부/외부 패배",
    narrativeCore: "끝났다",
    requiredElements: "동료 상실, 실패 확정, 거짓말 폭로, 목표 상실",
    emotionAxis: "절망"
  },
  {
    title: "9비트 — 자기 직면",
    sceneRangeLabel: "씬 67~75",
    narrativeRole: "내면 변화, 테마 이해",
    narrativeCore: "문제는 나였다",
    requiredElements: "고백, 깨달음, 화해, 새로운 가치관",
    emotionAxis: "정적, 성찰"
  },
  {
    title: "10비트 — 재결집",
    sceneRangeLabel: "씬 76~83",
    narrativeRole: "마지막 계획 수립, 새로운 방식 선택",
    narrativeCore: "이번엔 다르게 한다",
    requiredElements: "팀 재결합, 전략, 희생 결의",
    emotionAxis: "결의, 긴장된 희망"
  },
  {
    title: "11비트 — 클라이맥스",
    sceneRangeLabel: "씬 84~95",
    narrativeRole: "모든 갈등 폭발, 주제 증명",
    narrativeCore: "진짜 싸움",
    requiredElements: "최종 대결, 선택, 희생, 역전",
    emotionAxis: "최고조 긴장, 카타르시스"
  },
  {
    title: "12비트 — 새로운 질서",
    sceneRangeLabel: "씬 96~100",
    narrativeRole: "변화 결과 보여주기, 후일담",
    narrativeCore: "그래서 인간이 어떻게 변했는가",
    requiredElements: "세계 변화, 관계 정리, 여운, 다음 가능성",
    emotionAxis: "해방, 씁쓸함, 희망"
  }
];

export const EIGHT_SEQUENCE_BLUEPRINT: ReadonlyArray<StoryPlotSequence> = [
  { slot: 1, title: "Sequence 1", plotRole: "세계 + 사건", coversBeats: "1~2", notes: "일상·결핍과 촉발 사건을 한 플롯 축으로 묶음" },
  { slot: 2, title: "Sequence 2", plotRole: "목표 진입", coversBeats: "3", notes: "첫 선택 / Act1 마감" },
  { slot: 3, title: "Sequence 3", plotRole: "탐색과 첫 충돌", coversBeats: "4~5", notes: "적응과 대가 인지" },
  { slot: 4, title: "Sequence 4", plotRole: "미드포인트", coversBeats: "6", notes: "진실 공개 — 반드시 강하게" },
  { slot: 5, title: "Sequence 5", plotRole: "붕괴 시작", coversBeats: "7", notes: "통제 상실 가속" },
  { slot: 6, title: "Sequence 6", plotRole: "절망과 각성", coversBeats: "8~9", notes: "올 이즈 로스트 이후 내면 전환" },
  { slot: 7, title: "Sequence 7", plotRole: "최종 준비", coversBeats: "10", notes: "재결집·전략" },
  { slot: 8, title: "Sequence 8", plotRole: "클라이맥스 + 결말", coversBeats: "11~12", notes: "주제 증명과 새 질서" }
];

/** 1-based 플롯 시퀀스 슬롯 → 해당 구간의 12비트 배열 인덱스(0-based) */
export const SEQUENCE_SLOT_TO_BEAT_INDICES: Readonly<Record<number, readonly number[]>> = {
  1: [0, 1],
  2: [2],
  3: [3, 4],
  4: [5],
  5: [6],
  6: [7, 8],
  7: [9],
  8: [10, 11]
};

export function mergeSceneDefaults(scene: Partial<StoryScene>): StoryScene {
  const s = (k: keyof StoryScene, def: string) =>
    k in scene && scene[k] !== undefined && scene[k] !== null ? String(scene[k]) : def;
  const sn = Number(scene.sceneNumber);
  const sceneNumber = Number.isFinite(sn) && sn >= 0 ? Math.floor(sn) : 0;
  return {
    ...scene,
    sceneGoal: s("sceneGoal", ""),
    sceneConflict: s("sceneConflict", ""),
    sceneChange: s("sceneChange", ""),
    emotionBeat: s("emotionBeat", ""),
    dramaticBeats: Array.isArray(scene.dramaticBeats) ? scene.dramaticBeats.map(String) : [],
    castCharacterId: s("castCharacterId", ""),
    castMonsterId: s("castMonsterId", ""),
    castMapId: s("castMapId", ""),
    castObjectId: s("castObjectId", ""),
    castDocFaction: s("castDocFaction", ""),
    castDocRule: s("castDocRule", ""),
    castDocEvent: s("castDocEvent", ""),
    castDocGoal: s("castDocGoal", ""),
    sceneNumber,
    intExt: normalizeScreenplayIntExt(scene.intExt),
    locationPrimary: s("locationPrimary", ""),
    locationSecondary: s("locationSecondary", ""),
    timeOfDay: s("timeOfDay", ""),
    sluglineOverride: s("sluglineOverride", ""),
    scriptBlocks: normalizeScriptBlocks(scene.scriptBlocks)
  } as StoryScene;
}

const placeholderScene = (beatIndex1: number, seqIndex1: number, sceneIndex1: number): StoryScene =>
  mergeSceneDefaults({
    id: `scene-${String(beatIndex1).padStart(2, "0")}-${String(seqIndex1).padStart(2, "0")}-${String(sceneIndex1).padStart(2, "0")}`,
    title: "새 씬",
    event: "",
    dramaticBeats: [],
    sceneGoal: "",
    sceneConflict: "",
    sceneChange: "",
    emotionBeat: "",
    castCharacterId: "",
    castMonsterId: "",
    castMapId: "",
    castObjectId: "",
    castDocFaction: "",
    castDocRule: "",
    castDocEvent: "",
    castDocGoal: "",
    sceneNumber: 0,
    intExt: "",
    locationPrimary: "",
    locationSecondary: "",
    timeOfDay: "",
    sluglineOverride: "",
    scriptBlocks: []
  });

/** JSON에 키가 없을 때만 블루프린트를 채움(빈 문자열은 사용자 입력으로 유지). */
type NarrativeKey = "title" | "sceneRangeLabel" | "narrativeRole" | "narrativeCore" | "requiredElements" | "emotionAxis";

export function mergeBeatWithBlueprint(beat: StoryBeat, index: number): StoryBeat {
  const bp = TWELVE_BEAT_BLUEPRINT[index] ?? TWELVE_BEAT_BLUEPRINT[0];
  const pick = (key: NarrativeKey, fallback: string): string => {
    if (!(key in beat) || beat[key] === undefined || beat[key] === null) return fallback;
    return String(beat[key]);
  };
  const sequences = Array.isArray(beat.sequences) ? beat.sequences : [];
  let mergedSequences = sequences.map((seq) => ({
    ...seq,
    scenes: (Array.isArray(seq.scenes) ? seq.scenes : []).map((sc) => mergeSceneDefaults(sc))
  }));
  if (mergedSequences.length === 0) {
    mergedSequences = [
      {
        id: `sequence-${String(index + 1).padStart(2, "0")}-01`,
        title: "시퀀스 1",
        scenes: [placeholderScene(index + 1, 1, 1)]
      }
    ];
  }
  return {
    ...beat,
    title: pick("title", bp.title),
    sceneRangeLabel: pick("sceneRangeLabel", bp.sceneRangeLabel),
    narrativeRole: pick("narrativeRole", bp.narrativeRole),
    narrativeCore: pick("narrativeCore", bp.narrativeCore),
    requiredElements: pick("requiredElements", bp.requiredElements),
    emotionAxis: pick("emotionAxis", bp.emotionAxis),
    sequences: mergedSequences
  };
}
