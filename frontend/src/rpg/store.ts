import { create } from "zustand";
import axios from "axios";
import type { BattleState, Character, Monster, SheetBundle, TrpgChoiceType, TrpgDraft, TrpgSession } from "./types";
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
  trpgDraft: TrpgDraft | null;
  trpgSession: TrpgSession | null;
  ownedBooks: string[];
  regressionPool: {
    str: number;
    agi: number;
    luk: number;
    intel: number;
    atk: number;
    hp: number;
  };
  canRegress: boolean;
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

const normalizeRarity = (value: unknown): "normal" | "rare" | "unique" | "epic" | "legendary" => {
  if (typeof value === "string") {
    const lowered = value.toLowerCase().trim();
    if (lowered === "normal" || lowered === "rare" || lowered === "unique" || lowered === "epic" || lowered === "legendary") {
      return lowered;
    }
    if (lowered === "노말") return "normal";
    if (lowered === "레어") return "rare";
    if (lowered === "유니크") return "unique";
    if (lowered === "에픽") return "epic";
    if (lowered === "레전더리") return "legendary";
  }
  if (typeof value === "number") {
    if (value >= 5) return "legendary";
    if (value === 4) return "epic";
    return "normal";
  }
  return "normal";
};

const rarityLabel: Record<"normal" | "rare" | "unique" | "epic" | "legendary", string> = {
  normal: "노말(흰색)",
  rare: "레어(파란색)",
  unique: "유니크(노란색)",
  epic: "에픽(보라색)",
  legendary: "레전더리(초록색)"
};

const bookShopCost: Record<"normal" | "rare" | "unique" | "epic" | "legendary", number> = {
  normal: 20,
  rare: 45,
  unique: 80,
  epic: 140,
  legendary: 260
};

const weightedBookRoll = (): "normal" | "rare" | "unique" | "epic" | "legendary" => {
  const roll = Math.random();
  if (roll < 0.55) return "normal";
  if (roll < 0.8) return "rare";
  if (roll < 0.93) return "unique";
  if (roll < 0.985) return "epic";
  return "legendary";
};

const parseSkillLevel = (skillName: string): { base: string; level: number } => {
  const name = skillName.trim();
  const levelMatch = name.match(/^(.*?)(?:\\s*(?:레벨|lv\\.?|level)\\s*([0-9]+))$/i);
  if (!levelMatch) return { base: name, level: 1 };
  return { base: levelMatch[1].trim(), level: Math.max(1, Number(levelMatch[2] ?? 1)) };
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
      rarity: normalizeRarity((character as unknown as { rarity?: unknown }).rarity),
      skillIds: normalizedIds.length > 0 ? normalizedIds : mapped ? [mapped] : []
    };
  });
  const normalizedMonsters = (raw.monsters ?? []).map((monster) => {
    const legacySkillName = (monster as unknown as { skill?: string }).skill;
    const mapped = legacySkillName ? skillNameToId.get(legacySkillName) : undefined;
    const normalizedIds = toStringArray((monster as unknown as { skillIds?: unknown }).skillIds);
    return {
      ...monster,
      rarity: normalizeRarity((monster as unknown as { rarity?: unknown }).rarity),
      skillIds: normalizedIds.length > 0 ? normalizedIds : mapped ? [mapped] : []
    };
  });
  const normalizeEquipments = (rows: Array<{ rarity: unknown; skillIds?: unknown }>) =>
    rows.map((row) => ({
      ...row,
      rarity: normalizeRarity(row.rarity),
      skillIds: toStringArray(row.skillIds)
    }));
  return {
    ...raw,
    skills,
    characters: normalizedCharacters,
    monsters: normalizedMonsters,
    storyBranches: Array.isArray(raw.storyBranches) ? raw.storyBranches : [],
    weapons: normalizeEquipments(raw.weapons ?? []) as SheetBundle["weapons"],
    equipments: normalizeEquipments(raw.equipments ?? []) as SheetBundle["equipments"]
  };
};

const pickRandom = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const createDraft = (): TrpgDraft => ({
  originOptions: ["양치기", "도서관 필경사", "등대지기"],
  motiveOptions: ["무료함을 이기지 못해", "잃어버린 기록을 찾기 위해", "사라진 가족의 흔적을 좇아"],
  stanceOptions: ["공격적", "신중", "지원형"],
  selected: {}
});

const applyChoiceBonus = (inventory: Record<string, number>, choiceType: TrpgChoiceType, value: string): Record<string, number> => {
  const next = { ...inventory };
  const gain = (k: string, n: number) => {
    next[k] = (next[k] ?? 0) + n;
  };
  if (choiceType === "origin") {
    if (value === "양치기") gain("wool", 3);
    if (value === "도서관 필경사") gain("ink", 3);
    if (value === "등대지기") gain("oil", 3);
  }
  if (choiceType === "motive") {
    if (value.includes("기록")) gain("memoryShard", 2);
    if (value.includes("가족")) gain("oldPendant", 1);
    if (value.includes("무료함")) gain("gem", 5);
  }
  if (choiceType === "stance") {
    if (value === "공격적") gain("warCry", 1);
    if (value === "신중") gain("guardScroll", 1);
    if (value === "지원형") gain("healingHerb", 2);
  }
  return next;
};

export const useRpgStore = create<GameStore>((set, get) => ({
  bundle: null,
  roster: [],
  inventory: { gem: 50 },
  logs: ["[BOOT] terminal-rpg ready. type /start to begin TRPG"],
  party: [],
  tutorialActive: false,
  tutorialStep: 0,
  trpgDraft: null,
  trpgSession: null,
  ownedBooks: [],
  regressionPool: { str: 0, agi: 0, luk: 0, intel: 0, atk: 0, hp: 0 },
  canRegress: false,
  loadBundle: async () => {
    const { data } = await api.get<SheetBundle>("/content/bundle");
    const normalized = normalizeBundle(data);
    set({
      bundle: normalized,
      roster: normalized.characters.map((c) => ({
        ...c,
        rarity: normalizeRarity(c.rarity),
        skillIds: c.skillIds ?? [],
        str: c.str ?? 12,
        agi: c.agi ?? 10,
        luk: c.luk ?? 8,
        intel: c.intel ?? 9,
        level: 1,
        currentPage: 1,
        maxPages: c.maxPages ?? (c.rarity === "legendary" ? 1000 : c.rarity === "epic" ? 120 : 20),
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
    const push = (line: string) => set({ logs: [...get().logs, line].slice(-140) });

    const startTutorial = () => {
      set({ tutorialActive: true, tutorialStep: 1 });
      push("[TUTORIAL] 먼저 profile -> gacha 1 pickup -> battle -> adventure 순서로 진행해보세요.");
    };

    const beginTrpg = () => {
      if (!state.bundle || state.roster.length === 0) {
        push("[ERR] bundle not loaded");
        return;
      }
      const draft = createDraft();
      set({ trpgDraft: draft, trpgSession: null, tutorialActive: false, tutorialStep: 0 });
      push("[TRPG] 여행자 생성 시작. 아래 선택지를 골라주세요.");
      push(`[TRPG] origin: 1) ${draft.originOptions[0]}  2) ${draft.originOptions[1]}  3) ${draft.originOptions[2]}`);
      push("[TRPG] 명령: choose origin 1");
    };

    const resolveChoice = (choiceType: TrpgChoiceType, indexRaw: string) => {
      const current = get();
      if (!current.trpgDraft) {
        push("[ERR] /start로 먼저 TRPG 생성을 시작하세요.");
        return;
      }
      const idx = Number(indexRaw) - 1;
      if (!Number.isInteger(idx) || idx < 0 || idx > 2) {
        push(`[ERR] choose ${choiceType} 1|2|3`);
        return;
      }
      const options =
        choiceType === "origin"
          ? current.trpgDraft.originOptions
          : choiceType === "motive"
            ? current.trpgDraft.motiveOptions
            : current.trpgDraft.stanceOptions;
      const selectedValue = options[idx];
      const nextDraft: TrpgDraft = {
        ...current.trpgDraft,
        selected: {
          ...current.trpgDraft.selected,
          [choiceType]: selectedValue
        }
      };
      const nextInventory = applyChoiceBonus(current.inventory, choiceType, selectedValue);
      set({ trpgDraft: nextDraft, inventory: nextInventory });
      push(`[TRPG] 선택됨: ${choiceType}=${selectedValue}`);

      if (choiceType === "origin") {
        push(
          `[TRPG] motive: 1) ${nextDraft.motiveOptions[0]}  2) ${nextDraft.motiveOptions[1]}  3) ${nextDraft.motiveOptions[2]}`
        );
        push("[TRPG] 명령: choose motive 1");
      }
      if (choiceType === "motive") {
        push(
          `[TRPG] stance: 1) ${nextDraft.stanceOptions[0]}  2) ${nextDraft.stanceOptions[1]}  3) ${nextDraft.stanceOptions[2]}`
        );
        push("[TRPG] 명령: choose stance 1");
      }

      const origin = nextDraft.selected.origin;
      const motive = nextDraft.selected.motive;
      const stance = nextDraft.selected.stance;
      if (!origin || !motive || !stance) return;

      const map = current.bundle?.maps.length ? pickRandom(current.bundle.maps).name : "이름 없는 길";
      const ageHints = ["비가 잦은 해", "유성우가 떨어진 계절", "왕의 장례식 날", "해안 안개가 짙던 밤"];
      const bornId = `id${String(Math.floor(Math.random() * 90) + 10)}`;
      const template = pickRandom(current.roster);
      const pageOne = `${bornId}는 ${origin}로 살아왔다. ${motive} 여행을 떠나기로 했다.`;
      const pageTwo = `첫 목적지는 ${map}. ${bornId}는 ${stance} 성향으로 첫 서약을 세웠다.`;
      const hero: Character = {
        ...template,
        id: `trpg-${Date.now()}`,
        name: bornId,
        description: `〔TRPG〕${pickRandom(ageHints)} 태어난 여행자. 출신: ${origin}.`,
        storyPages: [pageOne, pageTwo, ...(template.storyPages ?? [])],
        str: (template.str ?? 12) + current.regressionPool.str,
        agi: (template.agi ?? 10) + current.regressionPool.agi,
        luk: (template.luk ?? 8) + current.regressionPool.luk,
        intel: (template.intel ?? 9) + current.regressionPool.intel,
        atk: template.atk + current.regressionPool.atk,
        hp: template.hp + current.regressionPool.hp,
        level: 1,
        currentPage: 1,
        awaken: 0,
        equipped: {}
      };
      const session: TrpgSession = {
        heroId: hero.id,
        origin,
        motive,
        stance,
        flags: ["intro_started"],
        chapter: 1
      };
      set({
        roster: [hero, ...current.roster],
        party: [hero.id],
        trpgSession: session,
        trpgDraft: null,
        canRegress: false
      });
      push(`[TRPG] ${bornId}가 태어났다.`);
      push(`[TRPG] ${pageOne}`);
      push(`[TRPG] ${pageTwo}`);
      push("[TRPG] story로 다음 장면을 확인하세요. 선택지는 story choose A|B|C");
    };

    const applyStoryChoice = (choice: string) => {
      const current = get();
      if (!current.trpgSession) {
        push("[ERR] 진행 중인 TRPG 세션이 없습니다. /start로 시작하세요.");
        return;
      }
      const normalizedChoice = choice.toUpperCase();
      if (!["A", "B", "C"].includes(normalizedChoice)) {
        push("[ERR] usage: story choose A|B|C");
        return;
      }
      const chapter = current.trpgSession.chapter;
      const promptFlag = `story_prompt_${chapter}`;
      if (!current.trpgSession.flags.includes(promptFlag)) {
        push("[ERR] 먼저 story 명령으로 현재 장면을 확인하세요.");
        return;
      }
      const branch = current.bundle?.storyBranches?.find((b) => b.chapter === chapter);
      const optionFlag =
        normalizedChoice === "A" ? branch?.flagA : normalizedChoice === "B" ? branch?.flagB : branch?.flagC;
      const newFlag = optionFlag ?? `choice_${chapter}_${normalizedChoice}`;
      const flags = Array.from(new Set([...current.trpgSession.flags, newFlag, `chapter_${chapter}_resolved`]));
      set({
        trpgSession: {
          ...current.trpgSession,
          chapter: chapter + 1,
          flags
        }
      });
      push(`[STORY] 선택 기록됨: ${normalizedChoice} (flag=${newFlag})`);
    };

    const runStory = () => {
      const current = get();
      if (!current.roster[0]) return;
      const hero = current.roster[0];
      const session = current.trpgSession;
      if (!session) {
        const pageText = hero.storyPages[hero.currentPage - 1] ?? `${hero.currentPage}페이지: 아직 기록되지 않은 장면.`;
        push(`[BOOK] ${hero.name} p.${hero.currentPage}/${hero.maxPages}`);
        push(`[BOOK] ${pageText}`);
        return;
      }
      const chapter = session.chapter;
      const hasA = session.flags.some((flag) => flag.endsWith("_A"));
      const hasB = session.flags.some((flag) => flag.endsWith("_B"));
      const hasC = session.flags.some((flag) => flag.endsWith("_C"));
      let event = "폐허 신전에서 누군가 지워진 이름을 되뇌었다.";
      if (hasA) event = "네가 구한 낡은 지도가 새로운 지름길을 드러냈다.";
      if (hasB) event = "네가 거절한 계약은 다른 추격자를 불러왔다.";
      if (hasC) event = "침묵을 택한 밤, 동료는 네 의도를 의심하기 시작했다.";
      const branch = current.bundle?.storyBranches?.find((item) => item.chapter === chapter);
      if (!branch) {
        set({
          trpgSession: {
            ...session,
            flags: Array.from(new Set([...session.flags, "story_all_pages_cleared"]))
          },
          canRegress: true
        });
        push("[STORY] 마지막 페이지를 완주했습니다. 한 편의 여정이 완결되었습니다.");
        push("[STORY] 회귀를 원하면 `regress` 를 입력하세요.");
        return;
      }
      const title = branch?.title ?? `CH.${chapter}`;
      const branchEvent = branch?.event ?? event;
      const promptFlag = `story_prompt_${chapter}`;
      const nextFlags = Array.from(new Set([...session.flags, promptFlag]));
      set({
        trpgSession: {
          ...session,
          flags: nextFlags
        }
      });
      push(`[STORY] ${title}`);
      branchEvent
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => push(`[STORY] ${line}`));
      push(`[STORY] A) ${branch?.optionA ?? "정면 돌파"} / B) ${branch?.optionB ?? "우회 탐색"} / C) ${branch?.optionC ?? "침묵 유지"}`);
      push("[STORY] 선택: story choose A|B|C");
    };

    const resolveMergedSkills = (hero: Character): Array<{ id: string; name: string; level: number; powerMultiplier: number }> => {
      if (!state.bundle) return [];
      const skillById = new Map(state.bundle.skills.map((s) => [s.id, s]));
      const equipmentIds = [hero.equipped?.weaponId, hero.equipped?.armorId, hero.equipped?.accessoryId].filter(
        Boolean
      ) as string[];
      const equippedObjects = [...state.bundle.weapons, ...state.bundle.equipments].filter((eq) =>
        equipmentIds.includes(eq.id)
      );
      const sourceSkillIds = [...hero.skillIds, ...equippedObjects.flatMap((eq) => eq.skillIds ?? [])];
      const merged = new Map<string, { id: string; name: string; level: number; powerMultiplier: number }>();
      sourceSkillIds.forEach((skillId) => {
        const skill = skillById.get(skillId);
        if (!skill) return;
        const parsed = parseSkillLevel(skill.name);
        const existing = merged.get(parsed.base);
        if (!existing) {
          merged.set(parsed.base, {
            id: skill.id,
            name: parsed.base,
            level: parsed.level,
            powerMultiplier: skill.powerMultiplier
          });
          return;
        }
        existing.level += parsed.level;
        existing.powerMultiplier += Math.max(0, skill.powerMultiplier - 1);
      });
      return [...merged.values()];
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
        push("[TUTORIAL] 완료! 이제 자유롭게 플레이하세요. 필요하면 /tutorial 로 다시 시작.");
      }
    };

    if (normalized === "start") {
      beginTrpg();
      return;
    }
    if (normalized === "tutorial") {
      startTutorial();
      return;
    }
    if (normalized.startsWith("choose ")) {
      const [, type, idx] = normalized.split(" ");
      if (type === "origin" || type === "motive" || type === "stance") {
        resolveChoice(type, idx ?? "");
        return;
      }
      push("[ERR] usage: choose origin|motive|stance 1|2|3");
      return;
    }

    if (normalized === "help") {
      push(
        "commands: /start, choose origin|motive|stance 1|2|3, story, story choose A|B|C, regress, book shop, book buy [normal|rare|unique|epic|legendary|random], /tutorial, profile, gacha, battle, adventure, inventory, list [characters|maps|monsters|skills], save, load, editor on/off"
      );
      return;
    }
    if (normalized === "editor on" || normalized === "editor off" || normalized === "editor") {
      push("[SYS] editor panel toggle is available in UI (button) or `editor on/off` command.");
      return;
    }

    if (normalized.startsWith("story choose ")) {
      const choice = normalized.split(" ")[2] ?? "";
      applyStoryChoice(choice);
      return;
    }

    if (normalized === "regress") {
      if (!state.roster[0]) {
        push("[ERR] 회귀할 캐릭터가 없습니다.");
        return;
      }
      if (!state.canRegress && !state.trpgSession) {
        push("[ERR] 진행 중인 TRPG 캐릭터가 없습니다. /start로 시작하세요.");
        return;
      }
      const hero = state.roster[0];
      const gain = {
        str: Math.max(1, Math.floor(hero.str * 0.01)),
        agi: Math.max(1, Math.floor(hero.agi * 0.01)),
        luk: Math.max(1, Math.floor(hero.luk * 0.01)),
        intel: Math.max(1, Math.floor(hero.intel * 0.01)),
        atk: Math.max(1, Math.floor(hero.atk * 0.01)),
        hp: Math.max(1, Math.floor(hero.hp * 0.01))
      };
      const pool = {
        str: state.regressionPool.str + gain.str,
        agi: state.regressionPool.agi + gain.agi,
        luk: state.regressionPool.luk + gain.luk,
        intel: state.regressionPool.intel + gain.intel,
        atk: state.regressionPool.atk + gain.atk,
        hp: state.regressionPool.hp + gain.hp
      };
      const nextInventory: Record<string, number> = {
        gem: Math.floor((state.inventory.gem ?? 0) * 0.3),
        ember: (state.inventory.ember ?? 0) + 1,
        soulAsh: (state.inventory.soulAsh ?? 0) + Math.max(1, Math.floor((hero.level ?? 1) / 2))
      };
      set({
        regressionPool: pool,
        trpgSession: null,
        trpgDraft: null,
        canRegress: false,
        inventory: nextInventory,
        party: [],
        roster: state.roster.slice(1)
      });
      push(`[REGRESS] ${hero.name}의 기록을 닫습니다. 능력치 1%를 계승했습니다.`);
      push(`[REGRESS] +STR ${gain.str} / +AGI ${gain.agi} / +LUK ${gain.luk} / +INT ${gain.intel} / +ATK ${gain.atk} / +HP ${gain.hp}`);
      push(`[ROGUELIKE] 소지품은 대부분 소실되었습니다. gem=${nextInventory.gem}, ember=${nextInventory.ember}, soulAsh=${nextInventory.soulAsh}`);
      push("[REGRESS] /start 로 다음 생을 시작하세요.");
      return;
    }

    if (normalized === "book shop") {
      push("[BOOK SHOP] 등급별 가격");
      (Object.keys(bookShopCost) as Array<keyof typeof bookShopCost>).forEach((rarity) => {
        push(`- ${rarityLabel[rarity]} : ${bookShopCost[rarity]} gem`);
      });
      push("[BOOK SHOP] 구매 명령: book buy random | book buy epic");
      return;
    }

    if (normalized.startsWith("book buy")) {
      if (!state.bundle || state.bundle.characters.length === 0) {
        push("[ERR] 캐릭터 북 원본 데이터를 찾을 수 없습니다.");
        return;
      }
      const mode = (normalized.split(" ")[2] ?? "random").toLowerCase();
      const targetRarity = mode === "random" ? weightedBookRoll() : normalizeRarity(mode);
      const cost = bookShopCost[targetRarity];
      const gem = state.inventory.gem ?? 0;
      if (gem < cost) {
        push(`[ERR] gem이 부족합니다. 필요: ${cost}, 보유: ${gem}`);
        return;
      }
      const rarityPool = state.bundle.characters.filter((c) => c.rarity === targetRarity);
      const template = pickRandom(rarityPool.length > 0 ? rarityPool : state.bundle.characters);
      const bookId = `book-${template.id}-${Date.now()}`;
      const bookHero: Character = {
        ...template,
        id: bookId,
        level: 1,
        currentPage: 1,
        awaken: 0,
        equipped: {}
      };
      set({
        roster: [...state.roster, bookHero],
        ownedBooks: [...state.ownedBooks, bookId],
        inventory: { ...state.inventory, gem: gem - cost }
      });
      push(`[BOOK] 새로운 캐릭터 북 구매: ${template.name} / ${rarityLabel[template.rarity]} (cost ${cost} gem)`);
      return;
    }

    if (normalized === "profile") {
      push("+==================== STATUS ====================+");
      push(`| roster: ${state.roster.length} | party: ${state.party.join(", ") || "none"} | gem: ${state.inventory.gem ?? 0}`);
      if (state.roster[0]) {
        const hero = state.roster[0];
        push(`| hero: ${hero.name} | Lv.${hero.level} | HP ${hero.hp} | ATK ${hero.atk}`);
        push(`| stats: STR ${hero.str} | AGI ${hero.agi} | LUK ${hero.luk} | INT ${hero.intel}`);
        push(`| pages: ${hero.currentPage}/${hero.maxPages} | awaken: ${hero.awaken}`);
        push(`| desc: ${hero.description}`);
        const skillNames = hero.skillIds.map((id) => state.bundle?.skills.find((skill) => skill.id === id)?.name ?? id).join(", ");
        push(`| skills: ${skillNames || "none"}`);
      }
      if (state.trpgSession) {
        push(
          `| TRPG: ${state.trpgSession.origin} / ${state.trpgSession.motive} / ${state.trpgSession.stance} / ch.${state.trpgSession.chapter}`
        );
        push(`| flags: ${state.trpgSession.flags.slice(-5).join(", ") || "none"}`);
      }
      push(
        `| inheritance: STR ${state.regressionPool.str} / AGI ${state.regressionPool.agi} / LUK ${state.regressionPool.luk} / INT ${state.regressionPool.intel} / ATK ${state.regressionPool.atk} / HP ${state.regressionPool.hp}`
      );
      push(`| books: ${state.ownedBooks.length} (buy: book buy)`);
      if (state.canRegress) push("| regress: available (type `regress`)");
      push("+===============================================+");
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
      const mergedSkills = resolveMergedSkills(player);
      const mergedPrimary = mergedSkills[0];
      const playerSkill = mergedPrimary
        ? {
            id: mergedPrimary.id,
            name: `${mergedPrimary.name} 레벨 ${mergedPrimary.level}`,
            description: "합성 스킬",
            cooldown: 0,
            kind: "attack" as const,
            powerMultiplier: mergedPrimary.powerMultiplier + mergedPrimary.level * 0.08
          }
        : state.bundle.skills.find((skill) => skill.id === player.skillIds[0]);
      const enemyBaseSkill = state.bundle.skills.find((skill) => skill.id === enemy.skillIds[0]);
      const enemySkill =
        enemyBaseSkill && (enemy.rarity === "epic" || enemy.rarity === "legendary")
          ? {
              ...enemyBaseSkill,
              name: `${enemyBaseSkill.name} [특수 개체]`,
              powerMultiplier: enemyBaseSkill.powerMultiplier + (enemy.rarity === "legendary" ? 0.35 : 0.2)
            }
          : enemyBaseSkill;
      let battle = createBattleState(player, enemy);
      const stance = state.trpgSession?.stance;
      if (stance === "공격적") {
        battle.enemyHp = Math.max(1, battle.enemyHp - 12);
        push("[TRPG] 공격적 성향: 선제 압박으로 적 HP 감소.");
      }
      if (stance === "신중") {
        battle.playerHp += 20;
        push("[TRPG] 신중 성향: 방어 태세로 초기 HP 보정.");
      }
      if (stance === "지원형") {
        battle.playerHp += 10;
        push("[TRPG] 지원형 성향: 전투 준비로 HP 보정.");
      }
      if (enemy.rarity === "epic" || enemy.rarity === "legendary") {
        battle.enemyHp += enemy.rarity === "legendary" ? 60 : 35;
        push(`[MONSTER] ${enemy.name} (${rarityLabel[enemy.rarity]})의 특수 개체가 등장했다.`);
      }
      for (let turn = 0; turn < 3 && battle.playerHp > 0 && battle.enemyHp > 0; turn += 1) {
        let action: "ATTACK" | "SKILL" | "DEFEND" = "ATTACK";
        if (stance === "신중" && battle.playerHp < 60) action = "DEFEND";
        if (stance === "지원형" && turn === 0) action = "SKILL";
        try {
          action = await requestBattleDecision(battle, player, enemy);
        } catch {
          if (stance === "공격적") action = "ATTACK";
        }
        battle = stepBattle(battle, player, enemy, action, playerSkill, enemySkill);
      }
      battle.log.forEach(push);
      if (battle.playerHp <= 0) {
        set({ canRegress: true });
        push("[REGRESS] 캐릭터가 사망했습니다. `regress` 명령으로 회귀할 수 있습니다.");
      }
      if (state.trpgSession) {
        const flags = Array.from(new Set([...state.trpgSession.flags, "battle_seen"]));
        set({ battle, trpgSession: { ...state.trpgSession, flags } });
      } else {
        set({ battle });
      }
      advanceTutorial("battle");
      return;
    }

    if (normalized === "adventure") {
      let branch = "";
      let companion = "";
      const session = state.trpgSession;
      const chapterTag = session ? `chapter-${session.chapter}` : "stage-enter";
      try {
        branch = await requestBranchText(chapterTag, {
          lowHp: false,
          hasRare: Boolean(session?.flags.includes("choice_1_A"))
        });
      } catch {
        branch = fallbackBranchLine(chapterTag);
      }
      try {
        companion = await requestCompanionLine("아리아", "adventure", 75, 20);
      } catch {
        companion = fallbackCompanionLine("아리아");
      }
      if (session) {
        const motiveLine = `[TRPG] ${session.motive} 선택의 여파가 길 위의 사건에 스며든다.`;
        push(motiveLine);
      }
      push(branch);
      push(companion);
      if (session) {
        const flags = Array.from(new Set([...session.flags, "adventure_seen"]));
        set({ trpgSession: { ...session, flags } });
      }
      advanceTutorial("adventure");
      return;
    }

    if (normalized === "inventory") {
      push(JSON.stringify(state.inventory));
      return;
    }

    if (normalized === "save") {
      const payload = {
        bundle: state.bundle,
        roster: state.roster,
        inventory: state.inventory,
        party: state.party,
        trpgSession: state.trpgSession,
        ownedBooks: state.ownedBooks,
        regressionPool: state.regressionPool,
        canRegress: state.canRegress
      };
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
      const parsed = JSON.parse(rawSave) as Partial<
        Pick<
          GameStore,
          "bundle" | "roster" | "inventory" | "party" | "trpgSession" | "ownedBooks" | "regressionPool" | "canRegress"
        >
      >;
      set({
        bundle: parsed.bundle ?? state.bundle,
        roster: parsed.roster ?? state.roster,
        inventory: parsed.inventory ?? state.inventory,
        party: parsed.party ?? state.party,
        trpgSession: parsed.trpgSession ?? null,
        ownedBooks: parsed.ownedBooks ?? state.ownedBooks,
        trpgDraft: null,
        regressionPool: parsed.regressionPool ?? state.regressionPool,
        canRegress: parsed.canRegress ?? false
      });
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
      runStory();
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
          push(`${idx + 1}. ${c.name} | ${rarityLabel[c.rarity]} | ${c.element} | pages ${c.maxPages}`);
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
          push(`${idx + 1}. ${m.name} | ${rarityLabel[m.rarity]} | ${m.element} | atk ${m.atk} hp ${m.hp}`);
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
