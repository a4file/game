import type { Character, ElementType } from "../types";

/** 탐험·전투 UI용 최대 마력 (시트에 MP 필드가 없어 주인공 신장에서 파생) */
export const maxManaFromCharacter = (character: Character): number =>
  Math.max(15, Math.floor(character.intel * 3 + character.level * 8 + character.awaken * 2));

const advantage: Record<ElementType, ElementType> = {
  fire: "nature",
  nature: "water",
  water: "fire",
  machine: "fire"
};

export const elementMultiplier = (attacker: ElementType, defender: ElementType): number => {
  if (advantage[attacker] === defender) return 1.25;
  if (advantage[defender] === attacker) return 0.85;
  return 1;
};

export const calculateDamage = (atk: number, multiplier: number, variance = Math.random() * 0.2 + 0.9): number =>
  Math.max(1, Math.floor(atk * multiplier * variance));

