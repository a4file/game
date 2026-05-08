import type { BattleState, Character, Monster, Skill } from "../types";
import { calculateDamage, elementMultiplier, maxManaFromCharacter } from "./formulas";

const SKILL_MANA_COST = 16;

export const createBattleState = (player: Character, enemy: Monster): BattleState => {
  const playerMaxMp = maxManaFromCharacter(player);
  return {
    turn: 1,
    playerHp: player.hp,
    enemyHp: enemy.hp,
    playerMp: playerMaxMp,
    playerMaxMp,
    log: [`전투 시작: ${player.name} vs ${enemy.name}`]
  };
};

export const stepBattle = (
  prev: BattleState,
  player: Character,
  enemy: Monster,
  action: "ATTACK" | "SKILL" | "DEFEND"
  ,
  playerSkill?: Skill,
  enemySkill?: Skill
): BattleState => {
  const lines = [...prev.log];
  let playerHp = prev.playerHp;
  let enemyHp = prev.enemyHp;
  let playerMp = prev.playerMp;

  let effectiveAction = action;

  const attackMul = elementMultiplier(player.element, enemy.element);
  const enemyMul = elementMultiplier(enemy.element, player.element);

  if (action === "DEFEND") {
    lines.push(`${player.name} 방어 자세!`);
  } else {
    if (action === "SKILL" && playerMp < SKILL_MANA_COST) {
      effectiveAction = "ATTACK";
      lines.push(`${player.name} 마력 부족 — 평타로 맞춘다.`);
    }
    const boost =
      effectiveAction === "SKILL" ? Math.max(1.1, playerSkill?.powerMultiplier ?? 1.3) : 1;
    if (effectiveAction === "SKILL") playerMp -= SKILL_MANA_COST;
    const damage = calculateDamage(player.atk * boost, attackMul);
    enemyHp = Math.max(0, enemyHp - damage);
    const skillLabel =
      effectiveAction === "SKILL" ? ` [${playerSkill?.name ?? "기본 스킬"}]` : "";
    lines.push(`${player.name} ${effectiveAction}${skillLabel} -> ${enemy.name} -${damage}`);
  }

  if (enemyHp > 0) {
    const enemyBoost = enemySkill?.powerMultiplier ?? 1;
    const enemyDamage = calculateDamage(
      enemy.atk * enemyBoost,
      enemyMul,
      effectiveAction === "DEFEND" ? 0.6 : undefined
    );
    playerHp = Math.max(0, playerHp - enemyDamage);
    const enemySkillLabel = enemySkill ? ` [${enemySkill.name}]` : "";
    lines.push(`${enemy.name} 반격${enemySkillLabel} -> ${player.name} -${enemyDamage}`);
  }

  return {
    turn: prev.turn + 1,
    playerHp,
    enemyHp,
    playerMp,
    playerMaxMp: prev.playerMaxMp,
    log: lines.slice(-16)
  };
};

