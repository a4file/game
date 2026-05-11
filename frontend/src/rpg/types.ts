export type ElementType = "fire" | "water" | "nature" | "machine";
export type Rarity = "normal" | "rare" | "unique" | "epic" | "legendary";

export interface Skill {
  id: string;
  name: string;
  description: string;
  powerMultiplier: number;
  cooldown: number;
  kind: "attack" | "buff" | "debuff" | "support";
}

export interface Character {
  id: string;
  /** 극본 대사 큐 (대문자). 비우면 name을 대문자로 사용 */
  screenplayCueName?: string;
  /** TMDB person id — 에디터에서 캐스팅 레퍼런스로만 사용 (선택) */
  tmdbPersonId?: number;
  /** TMDB `gender` (0–3) */
  tmdbGender?: number;
  /** TMDB `imdb_id` */
  imdbId?: string;
  /** TMDB `homepage` */
  homepage?: string;
  name: string;
  description: string;
  /** 인물 외형 — 이미지·영상 생성형 AI에 바로 넣기 좋게 */
  appearance: string;
  /** 성격, 말버릇, 타인과의 관계 */
  personality: string;
  /** 연출·시나리오용 한 덩어리 프롬프트(누가 어떻게 행동하는지 등) */
  generationPrompt: string;
  rarity: Rarity;
  className: string;
  nation: string;
  element: ElementType;
  str: number;
  agi: number;
  luk: number;
  intel: number;
  atk: number;
  hp: number;
  skillIds: string[];
  level: number;
  currentPage: number;
  maxPages: number;
  storyPages: string[];
  awaken: number;
  equipped?: {
    weaponId?: string;
    armorId?: string;
    accessoryId?: string;
  };
}

export interface Monster {
  id: string;
  /** 극본에서 대립체 큐 이름 (대문자 권장) */
  screenplayCueName?: string;
  name: string;
  rarity: Rarity;
  element: ElementType;
  str: number;
  agi: number;
  luk: number;
  intel: number;
  atk: number;
  hp: number;
  skillIds: string[];
}

export interface Equipment {
  id: string;
  name: string;
  slot: "weapon" | "armor" | "accessory";
  rarity: Rarity;
  skillIds?: string[];
  atk?: number;
  hp?: number;
  enhance: number;
}

export interface Item {
  id: string;
  name: string;
  type: "consumable" | "material" | "currency";
  effect?: string;
  amount?: number;
}

/** 슬러그 INT./EXT. — INT_EXT 는 출력 시 INT./EXT. */
export type ScreenplayIntExt = "INT" | "EXT" | "INT_EXT";

export type ScriptBlockType = "action" | "character" | "parenthetical" | "dialogue" | "transition" | "general";

export interface ScriptBlock {
  id: string;
  type: ScriptBlockType;
  text: string;
  /** type=character 일 때 대사 큐 (대문자) */
  cueName?: string;
  /** V.O., O.S., CONT'D 등 */
  extension?: string;
}

/** 극본 표지·머리말 메타 (PDF/FDX 등 내보내기) */
export interface ScriptMeta {
  scriptTitle: string;
  episodeTitle: string;
  draftLabel: string;
  writtenBy: string;
  basedOn: string;
  contact: string;
  revisionNote: string;
  /** 첫 씬 번호가 비어 있을 때 시작 번호 */
  pageNumberStart: number;
}

export interface MapStage {
  id: string;
  name: string;
  recommendedPower: number;
  monsterIds: string[];
  /** 슬러그라인용 로케이션명 (비우면 name) */
  scriptLocationName?: string;
  /** 씬이 맵만 지정되고 intExt 비었을 때 기본 */
  scriptDefaultIntExt?: ScreenplayIntExt | "";
  scriptDefaultTimeOfDay?: string;
}

export type StoryEventType =
  | "battle"
  | "adventure"
  | "companion"
  | "merchant"
  | "town"
  | "fishing"
  | "maze"
  | "trap"
  | "treasure";

export interface StoryBranch {
  id: string;
  chapter: number;
  title: string;
  event: string;
  eventType: StoryEventType;
  eventTier?: "common" | "rare" | "legend";
  rewardHint?: string;
  riskHint?: string;
  optionA: string;
  optionB: string;
  optionC: string;
  flagA: string;
  flagB: string;
  flagC: string;
}

export interface StoryScene {
  id: string;
  title: string;
  event: string;
  dramaticBeats: string[];
  /** 이 씬에서 원하는 것 */
  sceneGoal: string;
  /** 방해 요소 */
  sceneConflict: string;
  /** 시작과 끝의 차이 */
  sceneChange: string;
  /** 어느 감정 단계인지 */
  emotionBeat: string;
  /** 캐스팅보드에 연결된 id만 선택. 빈 문자열 = 미지정 (LLM에 누가·어디서 등 명시용) */
  castCharacterId: string;
  castMonsterId: string;
  castMapId: string;
  castObjectId: string;
  castDocFaction: string;
  castDocRule: string;
  castDocEvent: string;
  castDocGoal: string;
  /** 극본 씬 번호. 0이면 내보내기 시 자동 연번 */
  sceneNumber: number;
  /** 비우면 캐스팅 맵의 scriptDefaultIntExt → 기본 INT */
  intExt: ScreenplayIntExt | "";
  /** 슬러그 주 로케이션 (비우면 맵 scriptLocationName / name) */
  locationPrimary: string;
  locationSecondary: string;
  timeOfDay: string;
  /** 있으면 자동 슬러그 대신 이 한 줄 사용 */
  sluglineOverride: string;
  /** 순서 있는 극본 블록. 비어 있으면 event만 지문으로 출력 */
  scriptBlocks: ScriptBlock[];
}

export interface StorySequence {
  id: string;
  title: string;
  scenes: StoryScene[];
}

/** 8시퀀스(Sequence Method) — 플롯 단위, 포함 비트 구간 표기 */
export interface StoryPlotSequence {
  slot: number;
  title: string;
  plotRole: string;
  /** 예: "1~2", "3" */
  coversBeats: string;
  notes: string;
}

export interface StoryBeat {
  id: string;
  title: string;
  /** 권장 씬 구간 라벨 (예: 씬 1~8) */
  sceneRangeLabel: string;
  /** 비트의 서사적 역할 */
  narrativeRole: string;
  /** 한 줄 핵심 질문/요약 */
  narrativeCore: string;
  /** 필수 요소(쉼표·줄바꿈 자유) */
  requiredElements: string;
  /** 감정 축 */
  emotionAxis: string;
  sequences: StorySequence[];
}

export interface StorySheet {
  id: string;
  title: string;
  theme: string;
  world: string;
  /** 스토리 월드에 포함되는 맵(stage) id */
  mapIds: string[];
  /** 주체 — 캐릭터 시트 id */
  characters: string[];
  /** 적/위협 — 몬스터 시트 id */
  monsters: string[];
  /** 핵심 물건 — 아이템 시트 id (SYSTEM items) */
  objectIds: string[];
  /** 세력 — DOCS(Mythic) 마크다운 파일명 (예: 01-factions.md) */
  castDocFactions: string[];
  /** 세계 법칙 — DOCS 파일명 */
  castDocRules: string[];
  /** 사건 트리거 — DOCS 파일명 */
  castDocEvents: string[];
  /** 서사의 방향 — DOCS 파일명 */
  castDocGoals: string[];
  systems: string[];
  /** 고정 8개 — 목표·플롯 단위 */
  plotSequences: StoryPlotSequence[];
  beats: StoryBeat[];
  /** 극본 표지·작가 정보 */
  scriptMeta?: ScriptMeta;
}

export interface SheetBundle {
  maps: MapStage[];
  characters: Omit<Character, "level" | "currentPage" | "awaken" | "equipped">[];
  monsters: Monster[];
  stories: StorySheet[];
  storyBranches: StoryBranch[];
  skills: Skill[];
  weapons: Omit<Equipment, "enhance">[];
  items: Item[];
  equipments: Omit<Equipment, "enhance">[];
  version: number;
}

export interface PartyMember {
  characterId: string;
}

export interface BattleState {
  turn: number;
  playerHp: number;
  enemyHp: number;
  playerMp: number;
  playerMaxMp: number;
  log: string[];
}

export interface GachaState {
  pityCount: number;
  pickupPityCount: number;
}
