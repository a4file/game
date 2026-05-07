export type ElementType = "fire" | "water" | "nature" | "machine";
export type Rarity = 3 | 4 | 5;

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
  element: ElementType;
  atk: number;
  hp: number;
  skillIds: string[];
}

export interface Equipment {
  id: string;
  name: string;
  slot: "weapon" | "armor" | "accessory";
  rarity: Rarity;
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

export interface SheetBundle {
  maps: MapStage[];
  characters: Omit<Character, "level" | "currentPage" | "awaken" | "equipped">[];
  monsters: Monster[];
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

