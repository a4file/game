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
  const mp =
    typeof input.playerMp === "number"
      ? `, mp=${input.playerMp}${typeof input.playerMaxMp === "number" ? `/${input.playerMaxMp}` : ""}`
      : "";
  return `turn=${input.turn}, playerHp=${input.playerHp}, enemyHp=${input.enemyHp}${mp}, elemental=${elementalAdv}`;
};

export const fallbackBattleDecision = (input: BattleDecisionRequest["battleState"]): string => {
  const skimpyMp = typeof input.playerMp === "number" ? input.playerMp < 16 : false;
  if (input.playerHp < 45) return "DEFEND";
  if (input.enemyHp < 35 && !skimpyMp) return "SKILL";
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

