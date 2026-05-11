import type { SheetBundle, StoryBeat, StoryPlotSequence, StoryScene, StorySheet } from "../types";
import { EIGHT_SEQUENCE_BLUEPRINT, mergeBeatWithBlueprint } from "./storyFrameworkDefaults";
import { mergeScriptMeta } from "./scriptMeta";

export const STORY_BEAT_COUNT = 12;
export const STORY_SEQUENCE_COUNT = 8;

export function ensureEightPlotSequences(rows: StoryPlotSequence[] | undefined | null): StoryPlotSequence[] {
  return EIGHT_SEQUENCE_BLUEPRINT.map((bp, i) => {
    const slot = i + 1;
    const cur = (rows ?? []).find((r) => Number(r.slot) === slot);
    const pick = <K extends keyof StoryPlotSequence>(k: K, def: StoryPlotSequence[K]) =>
      cur && k in cur && cur[k] !== undefined && cur[k] !== null ? (cur[k] as StoryPlotSequence[K]) : def;
    return {
      slot,
      title: pick("title", bp.title),
      plotRole: pick("plotRole", bp.plotRole),
      coversBeats: pick("coversBeats", bp.coversBeats),
      notes: cur && "notes" in cur && cur.notes !== undefined && cur.notes !== null ? String(cur.notes) : bp.notes
    };
  });
}

/** Keeps at most 12 beats; pads then merges blueprint narrative fields + 씬 기본값. */
export function ensureTwelveBeats(beats: StoryBeat[] | undefined | null): StoryBeat[] {
  const input = Array.isArray(beats) ? beats.map((b) => ({ ...b })) : [];
  if (input.length > STORY_BEAT_COUNT) {
    return input.slice(0, STORY_BEAT_COUNT).map((b, i) => mergeBeatWithBlueprint(b, i));
  }
  while (input.length < STORY_BEAT_COUNT) {
    const n = input.length + 1;
    input.push({ id: `beat-${String(n).padStart(2, "0")}`, sequences: [] } as unknown as StoryBeat);
  }
  return input.map((b, i) => mergeBeatWithBlueprint(b, i));
}

const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

type CastingPick = Pick<
  StorySheet,
  "characters" | "monsters" | "mapIds" | "objectIds" | "castDocFactions" | "castDocRules" | "castDocEvents" | "castDocGoals"
>;

function sanitizeSceneCastAgainstBoard(scene: StoryScene, c: CastingPick): StoryScene {
  const ok = (id: string, list: string[]) => id === "" || list.includes(id);
  const ch = String(scene.castCharacterId ?? "");
  const mo = String(scene.castMonsterId ?? "");
  const mp = String(scene.castMapId ?? "");
  const ob = String(scene.castObjectId ?? "");
  const df = String(scene.castDocFaction ?? "");
  const dr = String(scene.castDocRule ?? "");
  const de = String(scene.castDocEvent ?? "");
  const dg = String(scene.castDocGoal ?? "");
  return {
    ...scene,
    castCharacterId: ok(ch, c.characters) ? ch : "",
    castMonsterId: ok(mo, c.monsters) ? mo : "",
    castMapId: ok(mp, c.mapIds) ? mp : "",
    castObjectId: ok(ob, c.objectIds) ? ob : "",
    castDocFaction: ok(df, c.castDocFactions) ? df : "",
    castDocRule: ok(dr, c.castDocRules) ? dr : "",
    castDocEvent: ok(de, c.castDocEvents) ? de : "",
    castDocGoal: ok(dg, c.castDocGoals) ? dg : ""
  };
}

function sanitizeBeatsSceneCasting(beats: StoryBeat[], c: CastingPick): StoryBeat[] {
  return beats.map((b) => ({
    ...b,
    sequences: b.sequences.map((seq) => ({
      ...seq,
      scenes: seq.scenes.map((sc) => sanitizeSceneCastAgainstBoard(sc, c))
    }))
  }));
}

export function normalizeStorySheetShape(story: StorySheet): StorySheet {
  const mapIds = Array.isArray(story.mapIds) ? story.mapIds.map(String) : [];
  const characters = Array.isArray(story.characters) ? story.characters.map(String) : [];
  const monsters = Array.isArray(story.monsters) ? story.monsters.map(String) : [];
  const objectIds = strArr(story.objectIds);
  const castDocFactions = strArr(story.castDocFactions);
  const castDocRules = strArr(story.castDocRules);
  const castDocEvents = strArr(story.castDocEvents);
  const castDocGoals = strArr(story.castDocGoals);
  const casting: CastingPick = {
    characters,
    monsters,
    mapIds,
    objectIds,
    castDocFactions,
    castDocRules,
    castDocEvents,
    castDocGoals
  };
  const mergedBeats = ensureTwelveBeats(story.beats);
  return {
    ...story,
    mapIds,
    characters,
    monsters,
    objectIds,
    castDocFactions,
    castDocRules,
    castDocEvents,
    castDocGoals,
    systems: Array.isArray(story.systems) ? story.systems.map(String) : [],
    plotSequences: ensureEightPlotSequences(story.plotSequences),
    scriptMeta: mergeScriptMeta(story.scriptMeta),
    beats: sanitizeBeatsSceneCasting(mergedBeats, casting)
  };
}

export function normalizeStoriesInBundle(bundle: SheetBundle): SheetBundle {
  return {
    ...bundle,
    stories: (bundle.stories ?? []).map((s) => normalizeStorySheetShape(s))
  };
}
