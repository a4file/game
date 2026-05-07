import { banners } from "./banners";
import type { Character, GachaState, Rarity } from "../types";

const pickRarity = (bannerId: "standard" | "pickup", state: GachaState): Rarity => {
  if (state.pityCount >= 89) return "legendary";
  const banner = banners.find((b) => b.id === bannerId) ?? banners[0];
  let roll = Math.random();
  for (const rate of banner.rates) {
    roll -= rate.rate;
    if (roll <= 0) return rate.rarity;
  }
  return "normal";
};

export interface GachaResult {
  rewards: Character[];
  nextState: GachaState;
}

export const rollGacha = (
  bannerId: "standard" | "pickup",
  times: number,
  pool: Character[],
  state: GachaState
): GachaResult => {
  let next = { ...state };
  const rewards: Character[] = [];
  for (let i = 0; i < times; i += 1) {
    const rarity = pickRarity(bannerId, next);
    const candidates = pool.filter((c) => c.rarity === rarity);
    const picked = candidates[Math.floor(Math.random() * candidates.length)] ?? pool[0];
    rewards.push(picked);
    next.pityCount = rarity === "legendary" ? 0 : next.pityCount + 1;
    next.pickupPityCount = bannerId === "pickup" && rarity === "legendary" ? 0 : next.pickupPityCount + 1;
  }
  return { rewards, nextState: next };
};

