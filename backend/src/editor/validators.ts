import { SheetBundle } from "../types";

export const validateSheetBundle = (payload: unknown): payload is SheetBundle => {
  if (!payload || typeof payload !== "object") return false;
  const data = payload as Record<string, unknown>;
  const keys = ["maps", "characters", "monsters", "skills", "weapons", "items", "equipments", "version"];
  return keys.every((k) => k in data);
};

