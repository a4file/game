import type { Character } from "../types";

const rarityStars: Record<Character["rarity"], number> = {
  normal: 1,
  rare: 2,
  unique: 3,
  epic: 4,
  legendary: 5
};

const rarityLabel: Record<Character["rarity"], string> = {
  normal: "노말(흰색)",
  rare: "레어(파란색)",
  unique: "유니크(노란색)",
  epic: "에픽(보라색)",
  legendary: "레전더리(초록색)"
};

export const formatRewards = (rewards: Character[]): string[] => {
  const lines = ["+---------------- GACHA RESULT ----------------+"];
  rewards.forEach((reward, idx) => {
    const stars = "★".repeat(rarityStars[reward.rarity]);
    lines.push(`${String(idx + 1).padStart(2, "0")}. [${stars}] ${reward.name} (${reward.element}) - ${rarityLabel[reward.rarity]}`);
  });
  lines.push("+----------------------------------------------+");
  return lines;
};

