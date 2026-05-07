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
      { rarity: 5, rate: 0.03 },
      { rarity: 4, rate: 0.17 },
      { rarity: 3, rate: 0.8 }
    ]
  },
  {
    id: "pickup",
    name: "픽업 소환",
    pickupCharacterId: "c-aria",
    rates: [
      { rarity: 5, rate: 0.04 },
      { rarity: 4, rate: 0.18 },
      { rarity: 3, rate: 0.78 }
    ]
  }
];

