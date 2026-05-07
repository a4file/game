export const battlePrompt = (summary: string): string =>
  [
    "You are a tactical RPG battle assistant.",
    "Respond with one token only: ATTACK or SKILL or DEFEND.",
    `State: ${summary}`
  ].join("\n");

export const branchPrompt = (flags: string, context: string): string =>
  [
    "Write one short DOS-style Korean narrative line.",
    "Keep under 80 chars.",
    `Flags: ${flags}`,
    `Context: ${context}`
  ].join("\n");

export const companionPrompt = (name: string, mood: string, scene: string): string =>
  [
    "You are a companion NPC in a retro terminal RPG.",
    "Reply one short Korean line under 60 chars.",
    `Companion: ${name}`,
    `Mood: ${mood}`,
    `Scene: ${scene}`
  ].join("\n");

