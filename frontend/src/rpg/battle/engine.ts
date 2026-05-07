import type { BattleState, Character, Monster, Skill } from "../types";
import { calculateDamage, elementMultiplier } from "./formulas";

export const createBattleState = (player: Character, enemy: Monster): BattleState => ({
  turn: 1,
  playerHp: player.hp,
  enemyHp: enemy.hp,
  log: [`전투 시작: ${player.name} vs ${enemy.name}`]
});

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

  const attackMul = elementMultiplier(player.element, enemy.element);
  const enemyMul = elementMultiplier(enemy.element, player.element);

  if (action === "DEFEND") {
    lines.push(`${player.name} 방어 자세!`);
  } else {
    const boost = action === "SKILL" ? (playerSkill?.powerMultiplier ?? 1.3) : 1;
    const damage = calculateDamage(player.atk * boost, attackMul);
    enemyHp = Math.max(0, enemyHp - damage);
    const skillLabel = action === "SKILL" ? ` [${playerSkill?.name ?? "기본 스킬"}]` : "";
    lines.push(`${player.name} ${action}${skillLabel} -> ${enemy.name} -${damage}`);
  }

  if (enemyHp > 0) {
    const enemyBoost = enemySkill?.powerMultiplier ?? 1;
    const enemyDamage = calculateDamage(enemy.atk * enemyBoost, enemyMul, action === "DEFEND" ? 0.6 : undefined);
    playerHp = Math.max(0, playerHp - enemyDamage);
    const enemySkillLabel = enemySkill ? ` [${enemySkill.name}]` : "";
    lines.push(`${enemy.name} 반격${enemySkillLabel} -> ${player.name} -${enemyDamage}`);
  }

  return {
    turn: prev.turn + 1,
    playerHp,
    enemyHp,
    log: lines.slice(-16)
  };
};

