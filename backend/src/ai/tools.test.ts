import { describe, expect, it } from "vitest";
import { fallbackBattleDecision, getCompanionMood } from "./tools";

describe("ai tools", () => {
  it("chooses defensive fallback at low hp", () => {
    const result = fallbackBattleDecision({
      turn: 2,
      playerHp: 30,
      enemyHp: 80,
      playerElement: "fire",
      enemyElement: "water"
    });
    expect(result).toBe("DEFEND");
  });

  it("returns mood from bond and fatigue", () => {
    expect(getCompanionMood(80, 20)).toBe("confident");
    expect(getCompanionMood(30, 90)).toBe("tired");
  });
});

