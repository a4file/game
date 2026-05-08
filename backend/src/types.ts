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
  name: string;
  description: string;
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

export interface MapStage {
  id: string;
  name: string;
  recommendedPower: number;
  monsterIds: string[];
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

export interface SheetBundle {
  maps: MapStage[];
  characters: Character[];
  monsters: Monster[];
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

