import { create } from "zustand";
import axios from "axios";
import type { BattleState, Character, Monster, SheetBundle, StoryBranch, StoryEventType, TrpgChoiceType, TrpgDraft, TrpgSession } from "./types";
import { rollGacha } from "./gacha/engine";
import { formatRewards } from "./gacha/rewardFormatter";
import { createBattleState, stepBattle } from "./battle/engine";
import { requestBattleDecision, requestBranchText, requestCompanionLine } from "./ai/client";
import { fallbackBranchLine, fallbackCompanionLine } from "./ai/fallbacks";
import { equipToCharacter } from "./progression/equipment";
import { levelUp } from "./progression/characterGrowth";
import { getApiBaseUrl } from "../apiBase";
import { formatApiFailure, formatFetchFailure } from "../apiErrors";
import { formatStoryPageLabel, formatStorySceneTitle, stripLegacyChapterPrefix } from "./storyLabels";

const api = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 25_000
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const cfg = axios.isAxiosError(err) ? err.config : undefined;
    const path = cfg?.url ?? "";
    const basePart = String(cfg?.baseURL ?? "").replace(/\/?$/, "");
    const combined = `${basePart}${path.startsWith("/") ? "" : "/"}${path}`;
    formatApiFailure(err, combined || "API").forEach((line) => {
      console.warn("[TerminalRPG]", line);
    });
    return Promise.reject(err);
  }
);

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
  /** 마지막 번들 로드 시도 결과(터미널 `diag`) */
  bundleConnection: {
    ok: boolean;
    source: "api" | "fallback" | null;
    apiBaseUrl: string;
    atMs: number;
    lines: string[];
  };
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

const tierRewardGem: Record<"common" | "rare" | "legend", number> = {
  common: 5,
  rare: 10,
  legend: 18
};

const tierPenaltyGem: Record<"common" | "rare" | "legend", number> = {
  common: 3,
  rare: 5,
  legend: 7
};

const ALL_STORY_EVENT_TYPES: StoryEventType[] = [
  "battle",
  "adventure",
  "companion",
  "merchant",
  "town",
  "fishing",
  "maze",
  "trap",
  "treasure"
];
const STORY_EVENT_TYPE_SET = new Set<string>(ALL_STORY_EVENT_TYPES);

/** 순환 배치: 낚시·미로·함정·전투·보물 등 랜덤 이벤트가 장마다 섞여 등장 */
const STORY_EVENT_ROTATION: StoryEventType[] = [
  "adventure",
  "fishing",
  "battle",
  "maze",
  "merchant",
  "trap",
  "companion",
  "treasure",
  "town"
];

const defaultStoryEventForChapter = (chapter: number): StoryEventType =>
  STORY_EVENT_ROTATION[(Math.max(1, chapter) - 1) % STORY_EVENT_ROTATION.length];

const createFallbackStoryBranch = (chapter: number): StoryBranch => ({
  id: `sb-fallback-${chapter}`,
  chapter,
  title: "이름 없는 기록",
  event: `${formatStoryPageLabel(chapter)} — 기록이 끊긴 지점이다. 그래도 길은 이어진다.\n주인공은 이전의 선택을 떠올리며, 다음 한 걸음을 내딛는다.\n멀리서 작은 징이 울리며 다음 장을 재촉한다.`,
  eventType: defaultStoryEventForChapter(chapter),
  eventTier: "common",
  rewardHint: "잃었던 단서를 조금 되찾는다.",
  riskHint: "지침이 쌓이면 다음 판정이 흔들릴 수 있다.",
  optionA: "정면으로 나아간다",
  optionB: "지형을 파악하며 돈다",
  optionC: "한 박자 쉬어 호흡을 고른다",
  flagA: `choice_${chapter}_A`,
  flagB: `choice_${chapter}_B`,
  flagC: `choice_${chapter}_C`
});

const buildStoryFinaleLines = (session: TrpgSession, hero: Character): string[] => {
  const lines: string[] = [];
  const label = formatStoryPageLabel(session.chapter);
  lines.push(`[STORY] ${label} 마지막 장 — 이 생의 사건을 모두 엮는다.`);
  const resolvedChapters = session.flags
    .filter((f) => /^chapter_\d+_resolved$/.test(f))
    .map((f) => Number(/^chapter_(\d+)_resolved$/.exec(f)?.[1] ?? 0))
    .filter((n) => n > 0);
  if (resolvedChapters.length) {
    const lo = Math.min(...resolvedChapters);
    const hi = Math.max(...resolvedChapters);
    lines.push(`[STORY] 겪어 온 분기: ${formatStoryPageLabel(lo)}~${formatStoryPageLabel(hi)} 구간, 총 ${resolvedChapters.length}회의 결정.`);
  }
  const eventTypes = [
    ...new Set(
      session.flags
        .map((f) => /^event_type_\d+_(.+)$/.exec(f)?.[1])
        .filter((t): t is string => Boolean(t))
    )
  ];
  if (eventTypes.length) {
    lines.push(`[STORY] 맞닥뜨린 사건 유형: ${eventTypes.join(", ")}.`);
  }
  const fails = session.flags.filter((f) => f.startsWith("event_result_") && f.endsWith("_fail")).length;
  const wins = session.flags.filter((f) => f.startsWith("event_result_") && f.endsWith("_success")).length;
  lines.push(`[STORY] 판정 요약 — 성공 기록 ${wins} / 실패 기록 ${fails}.`);
  lines.push(`[STORY] ${hero.name}(은)는 책장을 덮고 숨을 고른다. 한 생의 이야기가 여기까지다.`);
  lines.push("[STORY] 환생하여 새 북을 펴려면 `regress`를 입력하세요.");
  return lines;
};

type EventBalance = {
  successChoice: "A" | "B" | "C";
  failChoice: "A" | "B" | "C";
  successExtras: Array<{ key: string; amount: number }>;
  failPenaltyGem: number;
};

const chapterPhaseMultiplier = (chapter: number): { reward: number; penalty: number; extraReward: number } => {
  if (chapter <= 20) return { reward: 1, penalty: 1, extraReward: 1 };
  if (chapter <= 45) return { reward: 1.2, penalty: 1.25, extraReward: 1.1 };
  return { reward: 1.4, penalty: 1.6, extraReward: 1.25 };
};

const upscaleTierByChapter = (
  chapter: number,
  eventType: StoryBranch["eventType"],
  baseTier: "common" | "rare" | "legend"
): "common" | "rare" | "legend" => {
  if (baseTier === "legend") return "legend";
  if (chapter <= 20) return baseTier;
  if (chapter <= 45) {
    if (baseTier === "common") {
      if ((eventType === "battle" || eventType === "merchant" || eventType === "trap" || eventType === "treasure") && chapter % 4 === 0)
        return "rare";
      if ((eventType === "town" || eventType === "fishing" || eventType === "maze") && chapter % 7 === 0) return "rare";
      if (chapter % 5 === 0) return "rare";
    }
    return baseTier;
  }
  if (baseTier === "common") {
    if (eventType === "battle" && chapter % 4 === 0) return "legend";
    if (eventType === "trap" && chapter % 4 === 0) return "legend";
    if (eventType === "merchant" && chapter % 5 === 0) return "legend";
    if (eventType === "treasure" && chapter % 5 === 0) return "legend";
    if (eventType === "town" && chapter % 8 === 0) return "legend";
    if (chapter % 6 === 0) return "legend";
    if ((eventType === "battle" || eventType === "merchant" || eventType === "trap" || eventType === "treasure") && chapter % 2 === 0)
      return "rare";
    if (eventType === "town" && chapter % 3 === 0) return "rare";
    if (chapter % 2 === 0) return "rare";
    return "common";
  }
  if (baseTier === "rare") {
    if (eventType === "battle" && chapter % 2 === 0) return "legend";
    if (eventType === "trap" && chapter % 2 === 0) return "legend";
    if (eventType === "merchant" && chapter % 3 === 0) return "legend";
    if (eventType === "treasure" && chapter % 3 === 0) return "legend";
    if (eventType === "town" && chapter % 5 === 0) return "legend";
    if (chapter % 3 === 0) return "legend";
  }
  return baseTier;
};

const eventBalanceTable: Record<StoryBranch["eventType"], EventBalance> = {
  battle: {
    successChoice: "A",
    failChoice: "C",
    successExtras: [{ key: "warCry", amount: 1 }],
    failPenaltyGem: 4
  },
  adventure: {
    successChoice: "B",
    failChoice: "C",
    successExtras: [{ key: "memoryShard", amount: 1 }],
    failPenaltyGem: 3
  },
  companion: {
    successChoice: "A",
    failChoice: "C",
    successExtras: [{ key: "allyContract", amount: 1 }],
    failPenaltyGem: 4
  },
  merchant: {
    successChoice: "B",
    failChoice: "C",
    successExtras: [{ key: "discountToken", amount: 1 }],
    failPenaltyGem: 6
  },
  town: {
    successChoice: "A",
    failChoice: "C",
    successExtras: [{ key: "restPass", amount: 1 }],
    failPenaltyGem: 2
  },
  fishing: {
    successChoice: "B",
    failChoice: "C",
    successExtras: [{ key: "memoryShard", amount: 1 }],
    failPenaltyGem: 3
  },
  maze: {
    successChoice: "B",
    failChoice: "A",
    successExtras: [{ key: "memoryShard", amount: 1 }],
    failPenaltyGem: 5
  },
  trap: {
    successChoice: "A",
    failChoice: "C",
    successExtras: [{ key: "warCry", amount: 1 }],
    failPenaltyGem: 6
  },
  treasure: {
    successChoice: "B",
    failChoice: "C",
    successExtras: [{ key: "discountToken", amount: 1 }],
    failPenaltyGem: 5
  }
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

const isChoiceGuideLine = (line: string): boolean => line.startsWith("[TRPG] 숫자 ");

const trimTrailingChoiceGuides = (logs: string[]): string[] => {
  let end = logs.length;
  while (end > 0 && isChoiceGuideLine(logs[end - 1])) {
    end -= 1;
  }
  return logs.slice(0, end);
};

const normalizeBundle = (raw: SheetBundle): SheetBundle => {
  const branchTierByChapter = (chapter: number): "common" | "rare" | "legend" => {
    if (chapter >= 55) return chapter % 10 === 0 ? "legend" : "rare";
    if (chapter >= 35) return chapter % 6 === 0 ? "rare" : "common";
    return "common";
  };
  const skills = Array.isArray(raw.skills) ? raw.skills : [];
  const skillNameToId = new Map(skills.map((skill) => [skill.name, skill.id]));
  const normalizedCharacters = (raw.characters ?? []).map((character) => {
    const legacySkillName = (character as unknown as { skill?: string }).skill;
    const mapped = legacySkillName ? skillNameToId.get(legacySkillName) : undefined;
    const normalizedIds = toStringArray((character as unknown as { skillIds?: unknown }).skillIds);
    return {
      ...character,
      rarity: normalizeRarity((character as unknown as { rarity?: unknown }).rarity),
      className: String((character as unknown as { className?: unknown }).className ?? "방랑자"),
      nation: String((character as unknown as { nation?: unknown }).nation ?? "무소속"),
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
    storyBranches: Array.isArray(raw.storyBranches)
      ? raw.storyBranches.map((branch, index) => {
          const chapter = Number(branch.chapter ?? index + 1);
          return {
            ...branch,
            chapter,
            eventType:
              typeof branch.eventType === "string" && STORY_EVENT_TYPE_SET.has(branch.eventType)
                ? (branch.eventType as StoryBranch["eventType"])
                : defaultStoryEventForChapter(chapter),
            eventTier: branch.eventTier ?? branchTierByChapter(chapter),
            rewardHint: branch.rewardHint ?? "작은 보급과 기록 단서를 얻는다.",
            riskHint: branch.riskHint ?? "상황 악화 시 체력과 자원을 소모할 수 있다."
          };
        })
      : [],
    weapons: normalizeEquipments(raw.weapons ?? []) as SheetBundle["weapons"],
    equipments: normalizeEquipments(raw.equipments ?? []) as SheetBundle["equipments"]
  };
};

const isLikelySheetBundle = (payload: unknown): payload is SheetBundle => {
  if (payload === null || typeof payload !== "object") return false;
  const row = payload as Record<string, unknown>;
  return Array.isArray(row.characters) && row.characters.length > 0 && Array.isArray(row.skills);
};

const pickRandom = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const trimNameSuffix = (name: string): string => name.replace(/\s+\d+$/, "").trim();

const createDraft = (characters: Character[]): TrpgDraft => ({
  characterOptions: characters.slice(0, 3).map((c) => ({
    id: c.id,
    name: trimNameSuffix(c.name),
    rarity: c.rarity,
    className: c.className,
    nation: c.nation
  })),
  elementOptions: ["fire", "water", "nature", "machine"],
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
  logs: ["[BOOT] story engine initialized. type /start to begin a new journey."],
  party: [],
  tutorialActive: false,
  tutorialStep: 0,
  trpgDraft: null,
  trpgSession: null,
  ownedBooks: [],
  regressionPool: { str: 0, agi: 0, luk: 0, intel: 0, atk: 0, hp: 0 },
  canRegress: false,
  bundleConnection: {
    ok: false,
    source: null,
    apiBaseUrl: getApiBaseUrl(),
    atMs: 0,
    lines: []
  },
  loadBundle: async () => {
    const apiBaseUrl = getApiBaseUrl();
    const bundleReqLabel = `${apiBaseUrl.replace(/\/?$/, "")}/content/bundle`;
    const lines: string[] = [`[NET] 번들 로드 시도 → ${bundleReqLabel}`];
    let data: SheetBundle | undefined;
    let resolvedSource: "api" | "fallback" | null = null;

    try {
      const res = await api.get("/content/bundle");
      const payload = res.data;
      lines.push(`[NET] API HTTP ${res.status}`);
      if (typeof payload === "string") {
        lines.push(`[NET] 본문이 문자열입니다(SPA HTML이 /api 라우팅 우회로 넘어온 경우 많음). 길이 ${payload.length}`);
        lines.push(`[NET] 앞부분: ${payload.slice(0, 120).replace(/\s+/g, " ")}…`);
      } else if (!isLikelySheetBundle(payload)) {
        lines.push("[NET] 본문이 게임 번들 스키마가 아닙니다(non-array characters 또는 비어 있음).");
      } else {
        data = payload;
        resolvedSource = "api";
        lines.push(`[NET] 번들 검증 OK (characters ${payload.characters.length}, skills ${payload.skills.length})`);
      }
    } catch (e) {
      lines.push(...formatApiFailure(e, bundleReqLabel));
    }

    if (!data) {
      const baseUrl = import.meta.env.BASE_URL ?? "/";
      const prefix = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
      const fallbackUrl = `${prefix}sheets-fallback.json`;
      lines.push(`[NET] 정적 폴백 시도 → ${fallbackUrl}`);
      try {
        const res = await fetch(fallbackUrl);
        if (!res.ok) {
          lines.push(...formatFetchFailure(res.status, res.statusText, fallbackUrl));
        } else {
          const parsed = await res.json();
          if (isLikelySheetBundle(parsed)) {
            data = parsed;
            resolvedSource = "fallback";
            lines.push("[NET] sheets-fallback.json 검증 통과");
          } else {
            lines.push("[NET] 폴백 JSON도 번들 형식이 아닙니다.");
          }
        }
      } catch (fe) {
        lines.push(...formatApiFailure(fe, fallbackUrl));
      }
    }

    const atMs = Date.now();

    if (!data) {
      lines.push("[ERR] 번들 로드 최종 실패. `reload-bundle`, `diag` 후 Vercel Root=repo 루트(api 포함) 확인.");
      console.error("[TerminalRPG] bundle load failed\n", lines.join("\n"));
      set({
        bundle: null,
        bundleConnection: {
          ok: false,
          source: null,
          apiBaseUrl,
          atMs,
          lines: lines.slice(-24)
        },
        logs: [...get().logs, ...lines.slice(-14)].slice(-140)
      });
      return;
    }

    const normalized = normalizeBundle(data);
    const bundleLogs = get().logs;
    if (resolvedSource === "fallback") {
      lines.push("[NET] 현재 번들 소스: 정적 JSON — API가 무효/다운됨. 에디터 저장·AI는 /api 필요.");
    }
    set({
      bundle: normalized,
      bundleConnection: {
        ok: true,
        source: resolvedSource,
        apiBaseUrl,
        atMs,
        lines: lines.slice(-24)
      },
      roster: normalized.characters.map((c) => ({
        ...c,
        rarity: normalizeRarity(c.rarity),
        skillIds: c.skillIds ?? [],
        str: c.str ?? 12,
        agi: c.agi ?? 10,
        luk: c.luk ?? 8,
        intel: c.intel ?? 9,
        className: c.className ?? "방랑자",
        nation: c.nation ?? "무소속",
        level: 1,
        currentPage: 1,
        maxPages: c.maxPages ?? (c.rarity === "legendary" ? 1000 : c.rarity === "epic" ? 120 : 20),
        storyPages: c.storyPages ?? ["첫 장: 아직 기록되지 않은 이야기."],
        awaken: 0,
        equipped: {}
      })),
      party: normalized.characters.slice(0, 2).map((c) => c.id),
      logs: [...bundleLogs, ...lines.slice(-8), `[NET] 힌트: 백엔드 상태는 diag 입력`].slice(-140)
    });
  },
  setBundle: (bundle) => set({ bundle }),
  runCommand: async (raw) => {
    const command = raw.trim();
    const normalized = command.startsWith("/") ? command.slice(1) : command;
    const lower = normalized.toLowerCase();
    const state = get();
    const push = (line: string) => set({ logs: [...get().logs, line].slice(-140) });

    const startTutorial = () => {
      set({ tutorialActive: true, tutorialStep: 1 });
      push("[TUTORIAL] 먼저 profile -> gacha 1 pickup -> battle -> adventure 순서로 진행해보세요.");
    };

    const beginTrpg = () => {
      if (!state.bundle) {
        push("[ERR] bundle not loaded — 번들이 없습니다. `reload-bundle` 후 `diag`.");
        const detail = get().bundleConnection.lines;
        detail.slice(-8).forEach((line) => push(line));
        return;
      }
      if (state.roster.length === 0) {
        push("[ERR] roster 비어 있음 — 마지막 API 응답이 HTML 또는 빈 번들이었을 수 있습니다. `reload-bundle` (정적 폴백 포함) 후 재시도.");
        get().bundleConnection.lines.slice(-6).forEach((line) => push(line));
        return;
      }
      const normalPool = state.roster.filter((c) => c.rarity === "normal");
      const characterCandidates = (normalPool.length >= 3 ? normalPool : state.roster)
        .sort((a, b) => b.maxPages - a.maxPages)
        .slice(0, 3);
      const draft = createDraft(characterCandidates);
      set({ trpgDraft: draft, trpgSession: null, tutorialActive: false, tutorialStep: 0 });
      push("[TRPG] 내 이름이 뭐였지? 봉인된 서고의 페이지가 천천히 열렸다.");
      push(
        `[TRPG] 1) ${draft.characterOptions[0]?.name ?? "-"}  2) ${draft.characterOptions[1]?.name ?? "-"}  3) ${draft.characterOptions[2]?.name ?? "-"}`
      );
    };

    const resolveCharacterChoice = (indexRaw: string) => {
      const current = get();
      if (!current.trpgDraft) {
        push("[ERR] /start로 먼저 TRPG 생성을 시작하세요.");
        return;
      }
      const idx = Number(indexRaw) - 1;
      if (!Number.isInteger(idx) || idx < 0 || idx > 2) {
        push("[ERR] choose character 1|2|3");
        return;
      }
      const selectedChar = current.trpgDraft.characterOptions[idx];
      if (!selectedChar) {
        push("[ERR] 해당 번호의 캐릭터가 없습니다.");
        return;
      }
      const nextDraft: TrpgDraft = {
        ...current.trpgDraft,
        selected: {
          ...current.trpgDraft.selected,
          characterId: selectedChar.id,
          className: selectedChar.className,
          nation: selectedChar.nation
        }
      };
      set({ logs: trimTrailingChoiceGuides(get().logs) });
      set({ trpgDraft: nextDraft });
      push(`[TRPG] ${selectedChar.name}. 그 이름을 부르는 순간 오래된 운명이 되살아난다. (${rarityLabel[selectedChar.rarity]})`);
      push(`[TRPG] 클래스는 ${selectedChar.className}, 소속 국가는 ${selectedChar.nation}. 이 기록은 고정된다.`);
      push(
        `[TRPG] 어떤 원소를 받아들이겠는가? 1) Fire 2) Water 3) Nature 4) Machine`
      );
    };

    const resolveElementChoice = (indexRaw: string) => {
      const current = get();
      if (!current.trpgDraft) {
        push("[ERR] /start로 먼저 TRPG 생성을 시작하세요.");
        return;
      }
      const idx = Number(indexRaw) - 1;
      if (!Number.isInteger(idx) || idx < 0 || idx > 3) {
        push("[ERR] choose element 1|2|3|4");
        return;
      }
      const selectedValue = current.trpgDraft.elementOptions[idx];
      const nextDraft: TrpgDraft = {
        ...current.trpgDraft,
        selected: {
          ...current.trpgDraft.selected,
          element: selectedValue
        }
      };
      set({ logs: trimTrailingChoiceGuides(get().logs) });
      set({ trpgDraft: nextDraft });
      push(`[TRPG] ${selectedValue.toUpperCase()}의 결이 손끝에 내려앉았다.`);
      push(`[TRPG] 출신의 첫 장을 고른다. 1) ${nextDraft.originOptions[0]}  2) ${nextDraft.originOptions[1]}  3) ${nextDraft.originOptions[2]}`);
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
      set({ logs: trimTrailingChoiceGuides(get().logs) });
      set({ trpgDraft: nextDraft, inventory: nextInventory });
      push(`[TRPG] ${selectedValue}, 그 한마디가 기록에 새겨졌다.`);

      if (choiceType === "origin") {
        push(`[TRPG] ${selectedValue}의 밤을 지나, 이제 여정의 이유를 고른다.`);
        push(`[TRPG] 1) ${nextDraft.motiveOptions[0]}  2) ${nextDraft.motiveOptions[1]}  3) ${nextDraft.motiveOptions[2]}`);
      }
      if (choiceType === "motive") {
        push(`[TRPG] 마음의 방향이 정해졌다. 마지막으로 싸우는 자세를 정하자.`);
        push(`[TRPG] 1) ${nextDraft.stanceOptions[0]}  2) ${nextDraft.stanceOptions[1]}  3) ${nextDraft.stanceOptions[2]}`);
      }

      const selectedCharacterId = nextDraft.selected.characterId;
      const element = nextDraft.selected.element as Character["element"] | undefined;
      const origin = nextDraft.selected.origin;
      const motive = nextDraft.selected.motive;
      const stance = nextDraft.selected.stance;
      if (!selectedCharacterId || !element || !origin || !motive || !stance) return;

      const map = current.bundle?.maps.length ? pickRandom(current.bundle.maps).name : "이름 없는 길";
      const ageHints = ["비가 잦은 해", "유성우가 떨어진 계절", "왕의 장례식 날", "해안 안개가 짙던 밤"];
      const template = current.roster.find((c) => c.id === selectedCharacterId) ?? pickRandom(current.roster);
      const heroName = trimNameSuffix(template.name);
      const pageOne = `${heroName}는 ${origin}로 살아왔다. ${motive} 여행을 떠나기로 했다.`;
      const pageTwo = `첫 목적지는 ${map}. ${heroName}는 ${stance} 성향으로 첫 서약을 세웠다.`;
      const hero: Character = {
        ...template,
        id: `trpg-${Date.now()}`,
        name: heroName,
        description: `〔TRPG〕${pickRandom(ageHints)} 태어난 여행자. 출신: ${origin}.`,
        storyPages: [pageOne, pageTwo, ...(template.storyPages ?? [])],
        str: (template.str ?? 12) + current.regressionPool.str,
        agi: (template.agi ?? 10) + current.regressionPool.agi,
        luk: (template.luk ?? 8) + current.regressionPool.luk,
        intel: (template.intel ?? 9) + current.regressionPool.intel,
        atk: template.atk + current.regressionPool.atk,
        hp: template.hp + current.regressionPool.hp,
        element,
        level: 1,
        currentPage: 1,
        awaken: 0,
        equipped: {}
      };
      const session: TrpgSession = {
        heroId: hero.id,
        className: template.className,
        nation: template.nation,
        element,
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
      push(`[TRPG] ${heroName}가 태어났다.`);
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
      const session = current.trpgSession;
      const chapter = session.chapter;
      const hero = current.roster.find((c) => c.id === session.heroId) ?? current.roster[0];
      const pageCap = Math.max(1, hero?.maxPages ?? 20);
      if (chapter >= pageCap) {
        push("[ERR] 마지막 장은 선택지가 없습니다. `story`로 요약 장면을 확인하세요.");
        return;
      }
      const promptFlag = `story_prompt_${chapter}`;
      if (!session.flags.includes(promptFlag)) {
        push("[ERR] 먼저 story 명령으로 현재 장면을 확인하세요.");
        return;
      }
      const branch =
        current.bundle?.storyBranches?.find((b) => b.chapter === chapter) ?? createFallbackStoryBranch(chapter);
      const eventType = branch?.eventType ?? "adventure";
      const eventTier = upscaleTierByChapter(chapter, eventType, branch?.eventTier ?? "common");
      const optionFlag =
        normalizedChoice === "A" ? branch?.flagA : normalizedChoice === "B" ? branch?.flagB : branch?.flagC;
      const newFlag = optionFlag ?? `choice_${chapter}_${normalizedChoice}`;
      const previousFlags = session.flags;
      const consecutiveKey = `event_combo_${eventType}`;
      const previousCombo = Number(previousFlags.find((flag) => flag.startsWith(`${consecutiveKey}_`))?.split("_").pop() ?? 0);
      const balance = eventBalanceTable[eventType];
      const phase = chapterPhaseMultiplier(chapter);
      const successChoice = normalizedChoice === balance.successChoice || (normalizedChoice !== balance.failChoice && normalizedChoice !== "C");
      const combo = successChoice ? previousCombo + 1 : 0;
      const nextFlagsRaw = previousFlags.filter((flag) => !flag.startsWith(`${consecutiveKey}_`));
      const nextFlags = [
        ...nextFlagsRaw,
        newFlag,
        `chapter_${chapter}_resolved`,
        `event_type_${chapter}_${eventType}`,
        `event_tier_${chapter}_${eventTier}`,
        `event_result_${chapter}_${successChoice ? "success" : "fail"}`,
        `${consecutiveKey}_${combo}`
      ];
      if (successChoice && combo >= 2) {
        nextFlags.push(`combo_reward_${eventType}_${chapter}`);
      }
      const flags = Array.from(new Set(nextFlags));
      const nextInventory = { ...current.inventory };
      const gain = (key: string, amount: number) => {
        nextInventory[key] = (nextInventory[key] ?? 0) + amount;
      };
      if (successChoice) {
        gain("gem", Math.max(1, Math.floor(tierRewardGem[eventTier] * phase.reward)));
        balance.successExtras.forEach((reward) => gain(reward.key, Math.max(1, Math.floor(reward.amount * phase.extraReward))));
        if (combo >= 2) gain("memoryShard", Math.max(1, Math.floor(phase.extraReward)));
      } else {
        const scaledPenalty = Math.max(1, Math.floor((tierPenaltyGem[eventTier] + balance.failPenaltyGem) * phase.penalty));
        nextInventory.gem = Math.max(0, (nextInventory.gem ?? 0) - scaledPenalty);
      }
      set({ logs: trimTrailingChoiceGuides(get().logs) });
      const nextChapter = chapter + 1;
      const nextPage = Math.min(nextChapter, pageCap);
      const hid = session.heroId;
      const roster = current.roster.map((c) => (c.id === hid ? { ...c, currentPage: nextPage } : c));
      set({
        trpgSession: {
          ...session,
          chapter: nextChapter,
          flags
        },
        inventory: nextInventory,
        roster
      });
      push(`[STORY] 선택 기록됨: ${normalizedChoice} (flag=${newFlag})`);
      if (successChoice && combo >= 2) {
        push(`[EVENT:${eventType.toUpperCase()}] 연속 선택 보너스 발동. 추가 보상이 지급됐다.`);
      }
      if (!successChoice) {
        push(`[EVENT:${eventType.toUpperCase()}] 무리한 선택의 대가를 치렀다. 다음 장면은 더 조심스럽게 진행된다.`);
      }
      push(
        `[EVENT:${eventType.toUpperCase()}] 난이도 보정: phase=${chapter <= 20 ? "early" : chapter <= 45 ? "mid" : "late"} reward x${phase.reward.toFixed(2)} / penalty x${phase.penalty.toFixed(2)}`
      );
    };

    const runStory = () => {
      const current = get();
      if (!current.roster[0]) return;
      const hero =
        current.roster.find((c) => c.id === current.trpgSession?.heroId) ?? current.roster[0];
      const session = current.trpgSession;
      if (!session) {
        const pageText = hero.storyPages[hero.currentPage - 1] ?? `${hero.currentPage}페이지: 아직 기록되지 않은 장면.`;
        push(`[BOOK] ${hero.name} ${formatStoryPageLabel(hero.currentPage)}/${formatStoryPageLabel(hero.maxPages)}`);
        push(`[BOOK] ${pageText}`);
        return;
      }
      if (session.flags.includes("story_finale_complete")) {
        push("[STORY] 마지막 장을 이미 확인했습니다. 환생은 `regress` 명령으로 진행하세요.");
        return;
      }

      const chapter = session.chapter;
      const pageCap = Math.max(1, hero.maxPages ?? 20);

      if (chapter > pageCap) {
        push("[ERR] 스토리 진행 번호가 북 한도를 넘었습니다. `save` 후 에디터에서 maxPages를 확인하세요.");
        return;
      }

      if (chapter >= pageCap) {
        buildStoryFinaleLines(session, hero).forEach(push);
        const hid = session.heroId;
        const roster = current.roster.map((c) => (c.id === hid ? { ...c, currentPage: pageCap } : c));
        set({
          roster,
          trpgSession: {
            ...session,
            flags: Array.from(new Set([...session.flags, "story_finale_complete", "story_all_pages_cleared"]))
          },
          canRegress: true
        });
        return;
      }

      const hasA = session.flags.some((flag) => flag.endsWith("_A"));
      const hasB = session.flags.some((flag) => flag.endsWith("_B"));
      const hasC = session.flags.some((flag) => flag.endsWith("_C"));
      let event = "폐허 신전에서 누군가 지워진 이름을 되뇌었다.";
      if (hasA) event = "네가 구한 낡은 지도가 새로운 지름길을 드러냈다.";
      if (hasB) event = "네가 거절한 계약은 다른 추격자를 불러왔다.";
      if (hasC) event = "침묵을 택한 밤, 동료는 네 의도를 의심하기 시작했다.";
      const branch =
        current.bundle?.storyBranches?.find((item) => item.chapter === chapter) ??
        createFallbackStoryBranch(chapter);
      const title = formatStorySceneTitle(chapter, branch.title);
      const branchEvent = branch.event ?? event;
      const eventType = branch.eventType ?? "adventure";
      const eventTier = upscaleTierByChapter(chapter, eventType, branch.eventTier ?? "common");
      const rewardHint = branch.rewardHint ?? "작은 보급과 기록 단서를 얻는다.";
      const riskHint = branch.riskHint ?? "상황 악화 시 체력과 자원을 소모할 수 있다.";
      const recentFails = session.flags.filter((flag) => flag.startsWith("event_result_") && flag.endsWith("_fail")).length;
      const hasComboBonus = session.flags.some((flag) => flag.startsWith(`combo_reward_${eventType}_`));
      const promptFlag = `story_prompt_${chapter}`;
      const nextFlags = Array.from(new Set([...session.flags, promptFlag]));
      const hid = session.heroId;
      const roster =
        hero.currentPage !== chapter
          ? current.roster.map((c) => (c.id === hid ? { ...c, currentPage: chapter } : c))
          : current.roster;
      set({
        roster,
        trpgSession: {
          ...session,
          flags: nextFlags
        }
      });
      push(`[EVENT:${eventType.toUpperCase()}] ${title} (${eventTier})`);
      branchEvent
        .split("\n")
        .map((line) => stripLegacyChapterPrefix(line.trim()))
        .filter(Boolean)
        .forEach((line) => push(`[STORY] ${line}`));
      push(`[EVENT:${eventType.toUpperCase()}] 보상 단서: ${rewardHint}`);
      push(`[EVENT:${eventType.toUpperCase()}] 위험 단서: ${riskHint}`);
      if (eventType === "battle") {
        push("[EVENT:BATTLE] 피비린내가 감돈다. 이번 장면은 전투 준비가 된 선택이 유리하다.");
      }
      if (eventType === "companion") {
        push("[EVENT:COMPANION] 누군가가 함께 걷기를 청한다. 신뢰를 얻으면 동행 계약을 얻을 수 있다.");
      }
      if (eventType === "merchant") {
        push("[EVENT:MERCHANT] 보부상이 희귀 장서를 펼쳤다. 거래를 잘하면 할인 토큰을 손에 넣는다.");
      }
      if (eventType === "town") {
        push("[EVENT:TOWN] 작은 마을의 불빛이 보인다. 휴식과 정보 수집으로 다음 장면을 대비할 수 있다.");
      }
      if (eventType === "adventure") {
        push("[EVENT:ADVENTURE] 길은 열려 있다. 탐색을 통해 추가 단서를 찾을 수 있다.");
      }
      if (eventType === "fishing") {
        push("[EVENT:FISHING] 잔잔한 물살과 미끼 냄새가 난다. 타이밍과 끈기가 수확을 가른다.");
      }
      if (eventType === "maze") {
        push("[EVENT:MAZE] 벽이 숨 쉴 때마다 갈래를 바꾼다. 이정표는 기억과 센스다.");
      }
      if (eventType === "trap") {
        push("[EVENT:TRAP] 느슨한 판자와 감응 센서가 어둠에 묻혀 있다. 서두른 발이 보료를 낳는다.");
      }
      if (eventType === "treasure") {
        push("[EVENT:TREASURE] 보물상자의 자물쇠가 냄새를 풍긴다. 화려함 뒤에 항상 대가가 있다.");
      }
      if (recentFails >= 2 || hasComboBonus) {
        push("[STORY] 다음 선택의 흐름을 보려면 HINT 탭에 마우스를 올려 확인하세요.");
      }
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

    if (lower === "start") {
      beginTrpg();
      return;
    }
    if (/^[1234]$/.test(normalized) && state.trpgDraft) {
      const selected = state.trpgDraft.selected;
      if (!selected.characterId) {
        resolveCharacterChoice(normalized);
        return;
      }
      if (!selected.element) {
        resolveElementChoice(normalized);
        return;
      }
      if (!selected.origin) {
        resolveChoice("origin", normalized);
        return;
      }
      if (!selected.motive) {
        resolveChoice("motive", normalized);
        return;
      }
      if (!selected.stance) {
        resolveChoice("stance", normalized);
        return;
      }
    }
    if (/^[123]$/.test(normalized) && state.trpgSession) {
      const chapter = state.trpgSession.chapter;
      const hero = state.roster.find((c) => c.id === state.trpgSession!.heroId) ?? state.roster[0];
      const pageCap = Math.max(1, hero?.maxPages ?? 20);
      const promptFlag = `story_prompt_${chapter}`;
      if (chapter < pageCap && state.trpgSession.flags.includes(promptFlag)) {
        const mapped = normalized === "1" ? "A" : normalized === "2" ? "B" : "C";
        applyStoryChoice(mapped);
        return;
      }
    }
    if (/^[0-9]+$/.test(normalized)) {
      push("[SYS] 지금은 숫자 단축 입력을 받을 단계가 아닙니다. /start 또는 story를 확인하세요.");
      return;
    }
    if (lower === "tutorial") {
      startTutorial();
      return;
    }
    if (normalized.startsWith("choose ")) {
      const [, type, idx] = normalized.split(" ");
      if (type === "character") {
        resolveCharacterChoice(idx ?? "");
        return;
      }
      if (type === "element") {
        resolveElementChoice(idx ?? "");
        return;
      }
      if (type === "origin" || type === "motive" || type === "stance") {
        resolveChoice(type, idx ?? "");
        return;
      }
      push("[ERR] usage: choose character|element|origin|motive|stance 1|2|3(|4 for element)");
      return;
    }

    if (lower === "diag" || lower === "netdiag") {
      const cur = get().bundleConnection;
      const explicit = import.meta.env.VITE_API_BASE_URL;
      push("+======== NET DIAG =========+");
      push(`| vite mode: ${import.meta.env.MODE}`);
      push(`| VITE_API_BASE_URL: ${typeof explicit === "string" && explicit.trim() ? explicit : "(미설정 → /api, Vercel 서버리스)"}`);
      push(`| api base (저장값): ${cur.apiBaseUrl}`);
      push(`| api base (현재 env): ${getApiBaseUrl()}`);
      push(`| bundle ok: ${cur.ok}`);
      push(`| bundle source: ${cur.source ?? "none"}`);
      push(`| last load: ${cur.atMs ? new Date(cur.atMs).toISOString() : "—"}`);
      try {
        const base = cur.apiBaseUrl.replace(/\/?$/, "");
        const healthUrl = /^https?:\/\//i.test(cur.apiBaseUrl)
          ? `${base}/health`
          : `${window.location.origin}${cur.apiBaseUrl.startsWith("/") ? base : `/${base}`}/health`;
        const res = await fetch(healthUrl, { method: "GET", headers: { Accept: "application/json, text/plain;q=0.8" } });
        const ct = res.headers.get("content-type") ?? "";
        const body = await res.text();
        if (!ct.includes("application/json")) {
          push(`| GET /health → HTTP ${res.status}, Content-Type: ${ct || "(없음)"} (JSON 아님)`);
          push("| 힌트: /api 가 index.html로만 응답하면 Vercel Root가 repo 루트인지(api 디렉터리 포함) 확인하세요.");
          push(`| 본문 앞: ${body.slice(0, 140).replace(/\n/g, " ")}…`);
        } else {
          try {
            const json = JSON.parse(body) as { ok?: boolean };
            push(`| GET /health → HTTP ${res.status} ${JSON.stringify(json)}`);
          } catch {
            push(`| GET /health → HTTP ${res.status}, JSON 파싱 실패`);
          }
        }
      } catch (e) {
        push(`| GET /health fetch 실패: ${e instanceof Error ? e.message : String(e)}`);
      }
      push("| 번들 로그(최근):");
      cur.lines.slice(-12).forEach((ln) => push(`| ${ln}`));
      push("+=============================+");
      return;
    }

    if (lower === "reload-bundle") {
      push("[NET] 번들 재로드 중…");
      await get().loadBundle();
      push(`[NET] 완료 (${get().bundleConnection.ok ? "ok" : "fail"})`);
      return;
    }

    if (lower === "help") {
      push(
        "commands: /start, diag(대소문자 무관), reload-bundle, choose character|element|origin|motive|stance 1|2|3(|4 for element), story, story choose A|B|C, regress, book shop, book buy [...], /tutorial, profile, gacha, battle, adventure, inventory, list [...], save, load, editor on/off"
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
        push(`| identity: CLASS ${hero.className} | NATION ${hero.nation} | ELEMENT ${hero.element.toUpperCase()}`);
        push(`| stats: STR ${hero.str} | AGI ${hero.agi} | LUK ${hero.luk} | INT ${hero.intel}`);
        push(`| pages: ${formatStoryPageLabel(hero.currentPage)}/${formatStoryPageLabel(hero.maxPages)} | awaken: ${hero.awaken}`);
        push(`| desc: ${hero.description}`);
        const skillNames = hero.skillIds.map((id) => state.bundle?.skills.find((skill) => skill.id === id)?.name ?? id).join(", ");
        push(`| skills: ${skillNames || "none"}`);
      }
      if (state.trpgSession) {
        push(
          `| TRPG: ${state.trpgSession.className} / ${state.trpgSession.nation} / ${state.trpgSession.element.toUpperCase()} / ${state.trpgSession.origin} / ${state.trpgSession.motive} / ${state.trpgSession.stance} / ${formatStoryPageLabel(state.trpgSession.chapter)}`
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
      if (state.trpgSession) {
        push(`[TRPG] 진행 ${formatStoryPageLabel(state.trpgSession.chapter)} — 전투`);
      }
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
        push(`[TRPG] 진행 ${formatStoryPageLabel(session.chapter)} — 탐험`);
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
        push("[ERR] bundle not loaded — `reload-bundle` 또는 `diag`.");
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
