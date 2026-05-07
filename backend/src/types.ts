export type Element = "fire" | "water" | "nature" | "machine";
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
  element: Element;
  atk: number;
  hp: number;
  skillIds: string[];
  maxPages: number;
  storyPages: string[];
}

export interface Monster {
  id: string;
  name: string;
  element: Element;
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

export interface SheetBundle {
  maps: MapStage[];
  characters: Character[];
  monsters: Monster[];
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
    status?: string[];
  };
}

