import { BattleDecisionRequest } from "../types";

const advantageMap: Record<string, string> = {
  fire: "nature",
  nature: "water",
  water: "fire",
  machine: "fire"
};

export const getBattleStateSummary = (input: BattleDecisionRequest["battleState"]): string => {
  const elementalAdv =
    advantageMap[input.playerElement] === input.enemyElement ? "player-advantage" : "neutral-or-disadvantage";
  return `turn=${input.turn}, playerHp=${input.playerHp}, enemyHp=${input.enemyHp}, elemental=${elementalAdv}`;
};

export const fallbackBattleDecision = (input: BattleDecisionRequest["battleState"]): string => {
  if (input.playerHp < 45) return "DEFEND";
  if (input.enemyHp < 35) return "SKILL";
  return "ATTACK";
};

export const getBranchFlags = (flags: Record<string, boolean>): string =>
  Object.entries(flags)
    .map(([k, v]) => `${k}:${v ? "1" : "0"}`)
    .join(", ");

export const getCompanionMood = (bond: number, fatigue: number): string => {
  if (fatigue > 70) return "tired";
  if (bond > 70) return "confident";
  return "normal";
};

