import type { Rarity } from "../types";

export interface BannerRate {
  rarity: Rarity;
  rate: number;
}

export interface Banner {
  id: "standard" | "pickup";
  name: string;
  rates: BannerRate[];
  pickupCharacterId?: string;
}

export const banners: Banner[] = [
  {
    id: "standard",
    name: "상시 소환",
    rates: [
      { rarity: "legendary", rate: 0.03 },
      { rarity: "epic", rate: 0.17 },
      { rarity: "normal", rate: 0.8 }
    ]
  },
  {
    id: "pickup",
    name: "픽업 소환",
    pickupCharacterId: "c-aria",
    rates: [
      { rarity: "legendary", rate: 0.04 },
      { rarity: "epic", rate: 0.18 },
      { rarity: "normal", rate: 0.78 }
    ]
  }
];

