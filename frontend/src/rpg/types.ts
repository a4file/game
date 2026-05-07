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
  name: string;
  description: string;
  rarity: Rarity;
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

export interface MapStage {
  id: string;
  name: string;
  recommendedPower: number;
  monsterIds: string[];
}

export interface StoryBranch {
  id: string;
  chapter: number;
  title: string;
  event: string;
  optionA: string;
  optionB: string;
  optionC: string;
  flagA: string;
  flagB: string;
  flagC: string;
}

export interface SheetBundle {
  maps: MapStage[];
  characters: Omit<Character, "level" | "currentPage" | "awaken" | "equipped">[];
  monsters: Monster[];
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
  log: string[];
}

export interface GachaState {
  pityCount: number;
  pickupPityCount: number;
}

export type TrpgChoiceType = "origin" | "motive" | "stance";

export interface TrpgDraft {
  originOptions: string[];
  motiveOptions: string[];
  stanceOptions: string[];
  selected: Partial<Record<TrpgChoiceType, string>>;
}

export interface TrpgSession {
  heroId: string;
  origin: string;
  motive: string;
  stance: string;
  flags: string[];
  chapter: number;
}

