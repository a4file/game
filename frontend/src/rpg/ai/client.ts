import axios from "axios";
import type { BattleState, Character, Monster } from "../types";
import { getApiBaseUrl } from "../../apiBase";

const api = axios.create({
  baseURL: getApiBaseUrl()
});

export const requestBattleDecision = async (
  battleState: BattleState,
  player: Character,
  enemy: Monster
): Promise<"ATTACK" | "SKILL" | "DEFEND"> => {
  const { data } = await api.post<{ decision: "ATTACK" | "SKILL" | "DEFEND" }>("/ai/battle-decision", {
    battleState: {
      turn: battleState.turn,
      playerHp: battleState.playerHp,
      enemyHp: battleState.enemyHp,
      playerMp: battleState.playerMp,
      playerMaxMp: battleState.playerMaxMp,
      playerElement: player.element,
      enemyElement: enemy.element
    }
  });
  return data.decision;
};

export const requestBranchText = async (context: string, flags: Record<string, boolean>): Promise<string> => {
  const { data } = await api.post<{ text: string }>("/ai/branch-text", { context, flags });
  return data.text;
};

export const requestCompanionLine = async (name: string, scene: string, bond: number, fatigue: number): Promise<string> => {
  const { data } = await api.post<{ line: string }>("/ai/companion-line", { name, scene, bond, fatigue });
  return data.line;
};

