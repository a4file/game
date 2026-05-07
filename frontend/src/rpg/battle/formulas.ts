import type { ElementType } from "../types";

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

