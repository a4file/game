export type Element = "fire" | "water" | "nature" | "machine";
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
  screenplayCueName?: string;
  tmdbPersonId?: number;
  tmdbGender?: number;
  imdbId?: string;
  homepage?: string;
  name: string;
  description: string;
  appearance: string;
  personality: string;
  generationPrompt: string;
  rarity: Rarity;
  className: string;
  nation: string;
  element: Element;
  str: number;
  agi: number;
  luk: number;
  intel: number;
  atk: number;
  hp: number;
  skillIds: string[];
  maxPages: number;
  storyPages: string[];
}

export interface Monster {
  id: string;
  screenplayCueName?: string;
  name: string;
  rarity: Rarity;
  element: Element;
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
}

export interface Item {
  id: string;
  name: string;
  type: "consumable" | "material" | "currency";
  effect?: string;
}

export type ScreenplayIntExt = "INT" | "EXT" | "INT_EXT";

export type ScriptBlockType = "action" | "character" | "parenthetical" | "dialogue" | "transition" | "general";

export interface ScriptBlock {
  id: string;
  type: ScriptBlockType;
  text: string;
  cueName?: string;
  extension?: string;
}

export interface ScriptMeta {
  scriptTitle: string;
  episodeTitle: string;
  draftLabel: string;
  writtenBy: string;
  basedOn: string;
  contact: string;
  revisionNote: string;
  pageNumberStart: number;
}

export interface MapStage {
  id: string;
  name: string;
  recommendedPower: number;
  monsterIds: string[];
  scriptLocationName?: string;
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
  sceneGoal: string;
  sceneConflict: string;
  sceneChange: string;
  emotionBeat: string;
  castCharacterId: string;
  castMonsterId: string;
  castMapId: string;
  castObjectId: string;
  castDocFaction: string;
  castDocRule: string;
  castDocEvent: string;
  castDocGoal: string;
  sceneNumber: number;
  intExt: ScreenplayIntExt | "";
  locationPrimary: string;
  locationSecondary: string;
  timeOfDay: string;
  sluglineOverride: string;
  scriptBlocks: ScriptBlock[];
}

export interface StorySequence {
  id: string;
  title: string;
  scenes: StoryScene[];
}

export interface StoryPlotSequence {
  slot: number;
  title: string;
  plotRole: string;
  coversBeats: string;
  notes: string;
}

export interface StoryBeat {
  id: string;
  title: string;
  sceneRangeLabel: string;
  narrativeRole: string;
  narrativeCore: string;
  requiredElements: string;
  emotionAxis: string;
  sequences: StorySequence[];
}

export interface StorySheet {
  id: string;
  title: string;
  theme: string;
  world: string;
  mapIds: string[];
  characters: string[];
  monsters: string[];
  objectIds: string[];
  castDocFactions: string[];
  castDocRules: string[];
  castDocEvents: string[];
  castDocGoals: string[];
  systems: string[];
  plotSequences: StoryPlotSequence[];
  beats: StoryBeat[];
  scriptMeta?: ScriptMeta;
}

export interface SheetBundle {
  maps: MapStage[];
  characters: Character[];
  monsters: Monster[];
  stories: StorySheet[];
  storyBranches: StoryBranch[];
  skills: Skill[];
  weapons: Equipment[];
  items: Item[];
  equipments: Equipment[];
  version: number;
}

export interface BattleDecisionRequest {
  battleState: {
    turn: number;
    playerHp: number;
    enemyHp: number;
    playerElement: Element;
    enemyElement: Element;
    /** 전투 UI 마력(클라이언트에서만 채워질 수 있음) */
    playerMp?: number;
    playerMaxMp?: number;
    status?: string[];
  };
}

