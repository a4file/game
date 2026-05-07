import type { Character, Equipment } from "../types";

export const equipToCharacter = (character: Character, equipment: Equipment): Character => {
  const equipped = { ...(character.equipped ?? {}) };
  if (equipment.slot === "weapon") equipped.weaponId = equipment.id;
  if (equipment.slot === "armor") equipped.armorId = equipment.id;
  if (equipment.slot === "accessory") equipped.accessoryId = equipment.id;
  return { ...character, equipped };
};

export const enhanceEquipment = (equipment: Equipment): Equipment => ({
  ...equipment,
  enhance: equipment.enhance + 1,
  atk: equipment.atk ? equipment.atk + 2 : equipment.atk,
  hp: equipment.hp ? equipment.hp + 6 : equipment.hp
});

