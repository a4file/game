import { create } from "zustand";
import axios from "axios";
import type { BattleState, Character, Monster, SheetBundle, StoryBranch, StoryEventType } from "./types";
import { rollGacha } from "./gacha/engine";
import { formatRewards } from "./gacha/rewardFormatter";
import { createBattleState, stepBattle } from "./battle/engine";
import { requestBattleDecision, requestBranchText, requestCompanionLine } from "./ai/client";
import { fallbackBranchLine, fallbackCompanionLine } from "./ai/fallbacks";
import { equipToCharacter } from "./progression/equipment";
import { levelUp } from "./progression/characterGrowth";
import { getApiBaseUrl } from "../apiBase";
import { formatApiFailure, formatFetchFailure } from "../apiErrors";
import { formatStoryPageLabel } from "./storyLabels";
import { normalizeStorySheetShape } from "./story/beatsNormalize";

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
      appearance: String((character as unknown as { appearance?: unknown }).appearance ?? ""),
      personality: String((character as unknown as { personality?: unknown }).personality ?? ""),
      generationPrompt: String((character as unknown as { generationPrompt?: unknown }).generationPrompt ?? ""),
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
  const normalizedStories = Array.isArray((raw as unknown as { stories?: unknown }).stories)
    ? ((raw as unknown as { stories?: Array<Record<string, unknown>> }).stories ?? []).map((story, index) =>
        normalizeStorySheetShape({
          id: String(story.id ?? `story-${String(index + 1).padStart(3, "0")}`),
          title: String(story.title ?? `STORY${index + 1}`),
          theme: String(story.theme ?? "주제를 입력하세요."),
          world: String(story.world ?? "세계관을 입력하세요."),
          mapIds: toStringArray((story as Record<string, unknown>).mapIds),
          characters: toStringArray(story.characters),
          monsters: toStringArray(story.monsters),
          objectIds: toStringArray((story as Record<string, unknown>).objectIds),
          castDocFactions: toStringArray((story as Record<string, unknown>).castDocFactions),
          castDocRules: toStringArray((story as Record<string, unknown>).castDocRules),
          castDocEvents: toStringArray((story as Record<string, unknown>).castDocEvents),
          castDocGoals: toStringArray((story as Record<string, unknown>).castDocGoals),
          systems: toStringArray(story.systems),
          plotSequences: Array.isArray((story as Record<string, unknown>).plotSequences)
            ? ((story as Record<string, unknown>).plotSequences as SheetBundle["stories"][number]["plotSequences"])
            : [],
          beats: Array.isArray(story.beats) ? (story.beats as SheetBundle["stories"][number]["beats"]) : []
        })
      )
    : [];
  let globalChapterCursor = 1;
  const flattenedFromStories = normalizedStories.flatMap((story) => {
    const beats = Array.isArray(story.beats) ? story.beats : [];
    return beats.flatMap((beat, beatIndex) => {
      const sequences = Array.isArray(beat.sequences) ? beat.sequences : [];
      return sequences.flatMap((sequence, sequenceIndex) => {
        const scenes = Array.isArray(sequence.scenes) ? sequence.scenes : [];
        return scenes.map((scene, sceneIndex) => {
          const chapter = globalChapterCursor++;
          return {
            id: `${story.id}-b${String(beatIndex + 1).padStart(2, "0")}s${String(sequenceIndex + 1).padStart(2, "0")}c${String(sceneIndex + 1).padStart(2, "0")}`,
            chapter,
            title: String(scene.title ?? `Beat ${beatIndex + 1} Scene ${sceneIndex + 1}`),
            event: String(scene.event ?? "기록되지 않은 사건이 벌어졌다."),
            eventType: defaultStoryEventForChapter(chapter),
            eventTier: branchTierByChapter(chapter),
            rewardHint: "작은 보급과 기록 단서를 얻는다.",
            riskHint: "상황 악화 시 체력과 자원을 소모할 수 있다.",
            optionA: "정면 돌파",
            optionB: "우회 탐색",
            optionC: "침묵 유지",
            flagA: `${story.id}_ch${chapter}_A`,
            flagB: `${story.id}_ch${chapter}_B`,
            flagC: `${story.id}_ch${chapter}_C`
          };
        });
      });
    });
  });
  const sourceStoryBranches = Array.isArray(raw.storyBranches) && raw.storyBranches.length > 0 ? raw.storyBranches : flattenedFromStories;
  return {
    ...raw,
    skills,
    characters: normalizedCharacters,
    monsters: normalizedMonsters,
    stories: normalizedStories,
    storyBranches: Array.isArray(sourceStoryBranches)
      ? sourceStoryBranches.map((branch, index) => {
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

export const useRpgStore = create<GameStore>((set, get) => ({
  bundle: null,
  roster: [],
  inventory: { gem: 50 },
  logs: ["[BOOT] 시나리오 터미널 준비됨. help 로 명령을 확인하세요."],
  party: [],
  tutorialActive: false,
  tutorialStep: 0,
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
        appearance: c.appearance ?? "",
        personality: c.personality ?? "",
        generationPrompt: c.generationPrompt ?? "",
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
      push("[TUTORIAL] profile 로 인물 요약을, story 로 스크립트 페이지를 확인해 보세요.");
    };

    const runStory = () => {
      const current = get();
      if (!current.roster[0]) return;
      const hero = current.roster[0];
      const pageText = hero.storyPages[hero.currentPage - 1] ?? `${hero.currentPage}페이지: 아직 기록되지 않은 장면.`;
      push(`[BOOK] ${hero.name} ${formatStoryPageLabel(hero.currentPage)}/${formatStoryPageLabel(hero.maxPages)}`);
      push(`[BOOK] ${pageText}`);
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
        push("[TUTORIAL] story 로 한 장면을 읽어 보세요.");
      } else if (current.tutorialStep === 2) {
        set({ tutorialStep: 3 });
        push("[TUTORIAL] save 로 로컬 백업을 한 번 해 보세요.");
      } else if (current.tutorialStep === 3) {
        set({ tutorialStep: 4 });
        push("[TUTORIAL] adventure 로 샘플 장면 대사를 생성해 보세요.");
      } else if (current.tutorialStep === 4) {
        set({ tutorialStep: 5, tutorialActive: false });
        push("[TUTORIAL] 완료! 필요하면 /tutorial 로 다시 시작.");
      }
    };

    if (lower === "tutorial") {
      startTutorial();
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
        "commands: diag, reload-bundle, story, regress, book shop, book buy [...], /tutorial, profile, gacha, battle, adventure, inventory, list [...], save, load, editor on/off"
      );
      return;
    }
    if (normalized === "editor on" || normalized === "editor off" || normalized === "editor") {
      push("[SYS] editor panel toggle is available in UI (button) or `editor on/off` command.");
      return;
    }

    if (normalized === "regress") {
      if (!state.roster[0]) {
        push("[ERR] 회귀할 인물이 없습니다.");
        return;
      }
      if (!state.canRegress) {
        push("[ERR] 회귀는 전투 패배 등으로 `regress`가 열렸을 때만 가능합니다.");
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
        canRegress: false,
        inventory: nextInventory,
        party: [],
        roster: state.roster.slice(1)
      });
      push(`[REGRESS] ${hero.name}의 기록을 닫습니다. 수치 1%를 차기 인물에게 넘깁니다.`);
      push(`[REGRESS] +STR ${gain.str} / +AGI ${gain.agi} / +LUK ${gain.luk} / +INT ${gain.intel} / +ATK ${gain.atk} / +HP ${gain.hp}`);
      push(`[ROGUELIKE] 소지품은 대부분 소실되었습니다. gem=${nextInventory.gem}, ember=${nextInventory.ember}, soulAsh=${nextInventory.soulAsh}`);
      push("[REGRESS] book buy 등으로 새 인물을 준비하세요.");
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
        appearance: template.appearance ?? "",
        personality: template.personality ?? "",
        generationPrompt: template.generationPrompt ?? "",
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
      push(`[BOOK] 새 인물 북 구매: ${template.name} / ${rarityLabel[template.rarity]} (cost ${cost} gem)`);
      return;
    }

    if (normalized === "profile") {
      push("+==================== STATUS ====================+");
      push(`| roster: ${state.roster.length} | party: ${state.party.join(", ") || "none"} | gem: ${state.inventory.gem ?? 0}`);
      if (state.roster[0]) {
        const hero = state.roster[0];
        push(`| lead: ${hero.name} | Lv.${hero.level} | HP ${hero.hp} | ATK ${hero.atk}`);
        push(`| role: ${hero.className} | affiliation: ${hero.nation} | tone: ${hero.element}`);
        push(`| pages: ${formatStoryPageLabel(hero.currentPage)}/${formatStoryPageLabel(hero.maxPages)} | awaken: ${hero.awaken}`);
        push(`| logline: ${hero.description}`);
        if (hero.appearance) push(`| look: ${hero.appearance.slice(0, 120)}${hero.appearance.length > 120 ? "…" : ""}`);
        if (hero.personality) push(`| persona: ${hero.personality.slice(0, 120)}${hero.personality.length > 120 ? "…" : ""}`);
        if (hero.generationPrompt) push(`| gen-AI: ${hero.generationPrompt.slice(0, 120)}${hero.generationPrompt.length > 120 ? "…" : ""}`);
        const skillNames = hero.skillIds.map((id) => state.bundle?.skills.find((skill) => skill.id === id)?.name ?? id).join(", ");
        push(`| 연출 블록: ${skillNames || "none"}`);
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
      return;
    }

    if (normalized === "battle") {
      if (!state.bundle || state.roster.length === 0) return;
      const player = state.roster[0];
      push("[SCENE] 시뮬레이션 — 대립 인물과의 충돌 장면(데모)");
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
      if (enemy.rarity === "epic" || enemy.rarity === "legendary") {
        battle.enemyHp += enemy.rarity === "legendary" ? 60 : 35;
        push(`[ANTAGONIST] ${enemy.name} (${rarityLabel[enemy.rarity]}) — 강화 분기.`);
      }
      for (let turn = 0; turn < 3 && battle.playerHp > 0 && battle.enemyHp > 0; turn += 1) {
        let action: "ATTACK" | "SKILL" | "DEFEND" = "ATTACK";
        if (battle.playerHp < 60) action = "DEFEND";
        if (turn === 0) action = "SKILL";
        try {
          action = await requestBattleDecision(battle, player, enemy);
        } catch {
          action = "ATTACK";
        }
        battle = stepBattle(battle, player, enemy, action, playerSkill, enemySkill);
      }
      battle.log.forEach(push);
      if (battle.playerHp <= 0) {
        set({ canRegress: true });
        push("[REGRESS] 인물이 쓰러졌습니다. `regress` 로 회귀할 수 있습니다.");
      }
      set({ battle });
      return;
    }

    if (normalized === "adventure") {
      let branch = "";
      let companion = "";
      const chapterTag = "screenplay-beat";
      try {
        branch = await requestBranchText(chapterTag, {
          lowHp: false,
          hasRare: false
        });
      } catch {
        branch = fallbackBranchLine(chapterTag);
      }
      try {
        companion = await requestCompanionLine("아리아", "로케이션 이동 장면", 75, 20);
      } catch {
        companion = fallbackCompanionLine("아리아");
      }
      push("[SCENE] 시나리오 샘플 — 다음 비트");
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
      const payload = {
        bundle: state.bundle,
        roster: state.roster,
        inventory: state.inventory,
        party: state.party,
        ownedBooks: state.ownedBooks,
        regressionPool: state.regressionPool,
        canRegress: state.canRegress
      };
      localStorage.setItem(saveKey, JSON.stringify(payload));
      push("[SYS] save complete");
      advanceTutorial("save");
      return;
    }

    if (normalized === "load") {
      const rawSave = localStorage.getItem(saveKey);
      if (!rawSave) {
        push("[ERR] no save");
        return;
      }
      const parsed = JSON.parse(rawSave) as Partial<
        Pick<GameStore, "bundle" | "roster" | "inventory" | "party" | "ownedBooks" | "regressionPool" | "canRegress">
      >;
      set({
        bundle: parsed.bundle ?? state.bundle,
        roster: parsed.roster ?? state.roster,
        inventory: parsed.inventory ?? state.inventory,
        party: parsed.party ?? state.party,
        ownedBooks: parsed.ownedBooks ?? state.ownedBooks,
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
      advanceTutorial("story");
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
          push(`${idx + 1}. [인물] ${c.name} | ${rarityLabel[c.rarity]} | tone ${c.element} | pages ${c.maxPages}`);
        });
        return;
      }
      if (target === "maps") {
        state.bundle.maps.slice(0, 10).forEach((m, idx) => {
          push(`${idx + 1}. [로케이션] ${m.name} | 권장 강도 ${m.recommendedPower} | 출연 위협 id ${m.monsterIds.join("/")}`);
        });
        return;
      }
      if (target === "monsters") {
        state.bundle.monsters.slice(0, 10).forEach((m, idx) => {
          push(`${idx + 1}. [대립·위협] ${m.name} | ${rarityLabel[m.rarity]} | tone ${m.element} | 충돌 수치 atk ${m.atk} hp ${m.hp}`);
        });
        return;
      }
      if (target === "skills") {
        state.bundle.skills.slice(0, 10).forEach((s, idx) => {
          push(`${idx + 1}. [연출 블록] ${s.name} | 배율 x${s.powerMultiplier} | 간격 ${s.cooldown} | ${s.kind}`);
        });
        return;
      }
      push("[ERR] usage: list characters|maps|monsters|skills (시트 키는 레거리 이름 유지)");
      return;
    }

    push(`[ERR] unknown command: ${command}`);
  }
}));
