export const sheetSchemas: Record<string, string[]> = {
  stories: ["id", "title", "theme", "world", "characters", "monsters", "systems", "beats"],
  maps: ["id", "name", "recommendedPower", "monsterIds"],
  characters: [
    "id",
    "name",
    "description",
    "rarity",
    "className",
    "nation",
    "element",
    "str",
    "agi",
    "luk",
    "intel",
    "atk",
    "hp",
    "skillIds",
    "maxPages",
    "storyPages"
  ],
  monsters: ["id", "name", "rarity", "element", "str", "agi", "luk", "intel", "atk", "hp", "skillIds"],
  storyBranches: [
    "id",
    "chapter",
    "title",
    "eventType",
    "eventTier",
    "rewardHint",
    "riskHint",
    "event",
    "optionA",
    "optionB",
    "optionC",
    "flagA",
    "flagB",
    "flagC"
  ],
  skills: ["id", "name", "description", "powerMultiplier", "cooldown", "kind"],
  weapons: ["id", "name", "slot", "rarity", "skillIds", "atk", "hp"],
  items: ["id", "name", "type", "effect", "amount"],
  equipments: ["id", "name", "slot", "rarity", "skillIds", "atk", "hp"]
};

