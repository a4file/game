import { create } from "zustand";
import axios from "axios";
import type { BattleState, Character, Monster, SheetBundle } from "./types";
import { rollGacha } from "./gacha/engine";
import { formatRewards } from "./gacha/rewardFormatter";
import { createBattleState, stepBattle } from "./battle/engine";
import { requestBattleDecision, requestBranchText, requestCompanionLine } from "./ai/client";
import { fallbackBranchLine, fallbackCompanionLine } from "./ai/fallbacks";
import { equipToCharacter } from "./progression/equipment";
import { levelUp } from "./progression/characterGrowth";
import { getApiBaseUrl } from "../apiBase";

const api = axios.create({
  baseURL: getApiBaseUrl()
});

interface GameStore {
  bundle: SheetBundle | null;
  roster: Character[];
  inventory: Record<string, number>;
  logs: string[];
  party: string[];
  battle?: BattleState;
  tutorialActive: boolean;
  tutorialStep: number;
  loadBundle: () => Promise<void>;
  runCommand: (command: string) => Promise<void>;
  setBundle: (bundle: SheetBundle) => void;
}

const saveKey = "terminal-rpg-save-v1";

const toStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map((entry) => String(entry));
  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
};

const normalizeBundle = (raw: SheetBundle): SheetBundle => {
  const skills = Array.isArray(raw.skills) ? raw.skills : [];
  const skillNameToId = new Map(skills.map((skill) => [skill.name, skill.id]));
  const normalizedCharacters = (raw.characters ?? []).map((character) => {
    const legacySkillName = (character as unknown as { skill?: string }).skill;
    const mapped = legacySkillName ? skillNameToId.get(legacySkillName) : undefined;
    const normalizedIds = toStringArray((character as unknown as { skillIds?: unknown }).skillIds);
    return {
      ...character,
      skillIds: normalizedIds.length > 0 ? normalizedIds : mapped ? [mapped] : []
    };
  });
  const normalizedMonsters = (raw.monsters ?? []).map((monster) => {
    const legacySkillName = (monster as unknown as { skill?: string }).skill;
    const mapped = legacySkillName ? skillNameToId.get(legacySkillName) : undefined;
    const normalizedIds = toStringArray((monster as unknown as { skillIds?: unknown }).skillIds);
    return {
      ...monster,
      skillIds: normalizedIds.length > 0 ? normalizedIds : mapped ? [mapped] : []
    };
  });
  return {
    ...raw,
    skills,
    characters: normalizedCharacters,
    monsters: normalizedMonsters
  };
};

export const useRpgStore = create<GameStore>((set, get) => ({
  bundle: null,
  roster: [],
  inventory: { gem: 50 },
  logs: ["[BOOT] terminal-rpg ready. type /start for tutorial"],
  party: [],
  tutorialActive: false,
  tutorialStep: 0,
  loadBundle: async () => {
    const { data } = await api.get<SheetBundle>("/content/bundle");
    const normalized = normalizeBundle(data);
    set({
      bundle: normalized,
      roster: normalized.characters.map((c) => ({
        ...c,
        skillIds: c.skillIds ?? [],
        level: 1,
        currentPage: 1,
        maxPages: c.maxPages ?? (c.rarity === 5 ? 1000 : c.rarity === 4 ? 120 : 20),
        storyPages: c.storyPages ?? ["첫 장: 아직 기록되지 않은 이야기."],
        awaken: 0,
        equipped: {}
      })),
      party: normalized.characters.slice(0, 2).map((c) => c.id)
    });
  },
  setBundle: (bundle) => set({ bundle }),
  runCommand: async (raw) => {
    const command = raw.trim();
    const normalized = command.startsWith("/") ? command.slice(1) : command;
    const state = get();
    const push = (line: string) => set({ logs: [...get().logs, line].slice(-120) });
    const startTutorial = () => {
      set({ tutorialActive: true, tutorialStep: 1 });
      push("[TUTORIAL] 환영합니다. 먼저 `profile` 을 입력하거나 버튼을 눌러주세요.");
    };
    const advanceTutorial = (expected: string) => {
      const current = get();
      if (!current.tutorialActive) return;
      if (normalized !== expected) return;
      if (current.tutorialStep === 1) {
        set({ tutorialStep: 2 });
        push("[TUTORIAL] 좋아요. 이제 `gacha 1 pickup` 을 실행해 캐릭터를 뽑아보세요.");
      } else if (current.tutorialStep === 2) {
        set({ tutorialStep: 3 });
        push("[TUTORIAL] 잘했어요. 다음은 `battle` 로 첫 전투를 진행하세요.");
      } else if (current.tutorialStep === 3) {
        set({ tutorialStep: 4 });
        push("[TUTORIAL] 마지막으로 `adventure`를 실행하면 튜토리얼이 끝나요.");
      } else if (current.tutorialStep === 4) {
        set({ tutorialStep: 5, tutorialActive: false });
        push("[TUTORIAL] 완료! 이제 자유롭게 플레이하세요. 필요하면 /start 로 다시 시작.");
      }
    };

    if (normalized === "start") {
      startTutorial();
      return;
    }

    if (normalized === "help") {
      push("commands: /start, help, profile, gacha, battle, adventure, inventory, story, list [characters|maps|monsters|skills], save, load, editor on/off");
      return;
    }
    if (normalized === "profile") {
      push(`roster=${state.roster.length}, party=${state.party.join(", ")}, gem=${state.inventory.gem ?? 0}`);
      if (state.roster[0]) {
        const hero = state.roster[0];
        push(`${hero.name} Lv.${hero.level} (p.${hero.currentPage}/${hero.maxPages})`);
        push(`desc: ${hero.description}`);
        const skillNames = hero.skillIds
          .map((id) => state.bundle?.skills.find((skill) => skill.id === id)?.name ?? id)
          .join(", ");
        push(`skills: ${skillNames || "none"}`);
      }
      advanceTutorial("profile");
      return;
    }
    if (normalized.startsWith("gacha")) {
      const normalizedParts = normalized.split(" ");
      const times = Number(normalizedParts[1] ?? 1);
      const banner = (normalizedParts[2] as "standard" | "pickup") ?? "standard";
      const { rewards } = rollGacha(banner, times, state.roster, { pityCount: 0, pickupPityCount: 0 });
      formatRewards(rewards).forEach(push);
      const dupCount = rewards.filter((r) => state.roster.some((c) => c.id === r.id)).length;
      if (dupCount > 0) push(`[SYS] 중복 ${dupCount}개 -> 돌파 토큰 획득`);
      advanceTutorial("gacha 1 pickup");
      return;
    }
    if (normalized === "battle") {
      if (!state.bundle || state.roster.length === 0) return;
      const player = state.roster[0];
      const enemy: Monster = state.bundle.monsters[0];
      const playerSkill = state.bundle.skills.find((skill) => skill.id === player.skillIds[0]);
      const enemySkill = state.bundle.skills.find((skill) => skill.id === enemy.skillIds[0]);
      let battle = createBattleState(player, enemy);
      for (let turn = 0; turn < 3 && battle.playerHp > 0 && battle.enemyHp > 0; turn += 1) {
        let action: "ATTACK" | "SKILL" | "DEFEND" = "ATTACK";
        try {
          action = await requestBattleDecision(battle, player, enemy);
        } catch {
          action = battle.playerHp < 40 ? "DEFEND" : "ATTACK";
        }
        battle = stepBattle(battle, player, enemy, action, playerSkill, enemySkill);
      }
      battle.log.forEach(push);
      set({ battle });
      advanceTutorial("battle");
      return;
    }
    if (normalized === "adventure") {
      let branch = "";
      let companion = "";
      try {
        branch = await requestBranchText("stage-enter", { lowHp: false, hasRare: true });
      } catch {
        branch = fallbackBranchLine("stage-enter");
      }
      try {
        companion = await requestCompanionLine("아리아", "adventure", 75, 20);
      } catch {
        companion = fallbackCompanionLine("아리아");
      }
      push(branch);
      push(companion);
      advanceTutorial("adventure");
      return;
    }
    if (normalized === "inventory") {
      push(JSON.stringify(state.inventory));
      return;
    }
    if (normalized === "save") {
      const payload = { bundle: state.bundle, roster: state.roster, inventory: state.inventory, party: state.party };
      localStorage.setItem(saveKey, JSON.stringify(payload));
      push("[SYS] save complete");
      return;
    }
    if (normalized === "load") {
      const rawSave = localStorage.getItem(saveKey);
      if (!rawSave) {
        push("[ERR] no save");
        return;
      }
      const parsed = JSON.parse(rawSave) as Pick<GameStore, "bundle" | "roster" | "inventory" | "party">;
      set({ bundle: parsed.bundle, roster: parsed.roster, inventory: parsed.inventory, party: parsed.party });
      push("[SYS] save loaded");
      return;
    }
    if (normalized === "equip") {
      if (!state.bundle || !state.roster[0]) return;
      const weapon = state.bundle.weapons[0];
      const nextChar = equipToCharacter(state.roster[0], { ...weapon, enhance: 0 });
      set({ roster: [nextChar, ...state.roster.slice(1)] });
      push(`[SYS] ${nextChar.name} equipped ${weapon.name}`);
      return;
    }
    if (normalized === "levelup") {
      if (!state.roster[0]) return;
      const next = levelUp(state.roster[0]);
      set({ roster: [next, ...state.roster.slice(1)] });
      if (next.currentPage === state.roster[0].currentPage) {
        push(`[SYS] ${next.name}는 마지막 페이지까지 도달했습니다.`);
      } else {
        push(`[SYS] ${next.name} 책장을 넘겼습니다: p.${next.currentPage}/${next.maxPages} (Lv.${next.level})`);
      }
      const pageText = next.storyPages[next.currentPage - 1] ?? `${next.name}의 ${next.currentPage}페이지는 아직 미기록 상태다.`;
      push(`[STORY] ${pageText}`);
      return;
    }
    if (normalized === "story") {
      if (!state.roster[0]) return;
      const hero = state.roster[0];
      const pageText = hero.storyPages[hero.currentPage - 1] ?? `${hero.currentPage}페이지: 아직 기록되지 않은 장면.`;
      push(`[BOOK] ${hero.name} p.${hero.currentPage}/${hero.maxPages}`);
      push(`[BOOK] ${pageText}`);
      return;
    }
    if (normalized.startsWith("list")) {
      if (!state.bundle) {
        push("[ERR] bundle not loaded");
        return;
      }
      const target = normalized.split(" ")[1] ?? "characters";
      if (target === "characters") {
        state.bundle.characters.slice(0, 10).forEach((c, idx) => {
          push(`${idx + 1}. ${c.name} | R${c.rarity} | ${c.element} | pages ${c.maxPages}`);
        });
        return;
      }
      if (target === "maps") {
        state.bundle.maps.slice(0, 10).forEach((m, idx) => {
          push(`${idx + 1}. ${m.name} | power ${m.recommendedPower} | mobs ${m.monsterIds.join("/")}`);
        });
        return;
      }
      if (target === "monsters") {
        state.bundle.monsters.slice(0, 10).forEach((m, idx) => {
          push(`${idx + 1}. ${m.name} | ${m.element} | atk ${m.atk} hp ${m.hp}`);
        });
        return;
      }
      if (target === "skills") {
        state.bundle.skills.slice(0, 10).forEach((s, idx) => {
          push(`${idx + 1}. ${s.name} | x${s.powerMultiplier} | cd ${s.cooldown} | ${s.kind}`);
        });
        return;
      }
      push("[ERR] usage: list characters|maps|monsters|skills");
      return;
    }

    push(`[ERR] unknown command: ${command}`);
  }
}));

