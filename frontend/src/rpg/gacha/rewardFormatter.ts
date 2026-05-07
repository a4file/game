import type { Character } from "../types";

export const formatRewards = (rewards: Character[]): string[] => {
  const lines = ["+---------------- GACHA RESULT ----------------+"];
  rewards.forEach((reward, idx) => {
    lines.push(
      `${String(idx + 1).padStart(2, "0")}. [${"★".repeat(reward.rarity)}] ${reward.name} (${reward.element})`
    );
  });
  lines.push("+----------------------------------------------+");
  return lines;
};

