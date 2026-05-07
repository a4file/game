export const sheetSchemas: Record<string, string[]> = {
  maps: ["id", "name", "recommendedPower", "monsterIds"],
  characters: ["id", "name", "description", "rarity", "element", "atk", "hp", "skillIds", "maxPages", "storyPages"],
  monsters: ["id", "name", "element", "atk", "hp", "skillIds"],
  skills: ["id", "name", "description", "powerMultiplier", "cooldown", "kind"],
  weapons: ["id", "name", "slot", "rarity", "atk", "hp"],
  items: ["id", "name", "type", "effect", "amount"],
  equipments: ["id", "name", "slot", "rarity", "atk", "hp"]
};

