import type { MapStage, Monster, Character, ScreenplayIntExt, ScriptBlock, StoryScene, StorySheet, SheetBundle } from "../types";
import { mergeScriptMeta } from "./scriptMeta";

function formatIntExtLabel(ie: ScreenplayIntExt | ""): string {
  if (ie === "INT_EXT") return "INT./EXT.";
  if (ie === "EXT") return "EXT.";
  return "INT.";
}

function resolveIntExt(scene: StoryScene, map: MapStage | undefined): ScreenplayIntExt | "" {
  const s = scene.intExt ?? "";
  if (s) return s;
  const m = map?.scriptDefaultIntExt;
  return m && (m === "INT" || m === "EXT" || m === "INT_EXT") ? m : "INT";
}

function resolveTimeOfDay(scene: StoryScene, map: MapStage | undefined): string {
  const t = (scene.timeOfDay ?? "").trim();
  if (t) return t.toUpperCase();
  const d = (map?.scriptDefaultTimeOfDay ?? "").trim();
  return d ? d.toUpperCase() : "DAY";
}

function resolveLocationPrimary(scene: StoryScene, map: MapStage | undefined): string {
  const p = (scene.locationPrimary ?? "").trim();
  if (p) return p.toUpperCase();
  const n = (map?.scriptLocationName ?? "").trim();
  if (n) return n.toUpperCase();
  return (map?.name ?? "LOCATION").toUpperCase();
}

export function buildSceneSlugline(scene: StoryScene, map: MapStage | undefined, sceneNumber: number): string {
  const override = (scene.sluglineOverride ?? "").trim();
  if (override) return override;
  const ie = resolveIntExt(scene, map);
  const primary = resolveLocationPrimary(scene, map);
  const secondary = (scene.locationSecondary ?? "").trim().toUpperCase();
  const tod = resolveTimeOfDay(scene, map);
  const loc = secondary ? `${primary}--${secondary}` : primary;
  return `${sceneNumber} ${formatIntExtLabel(ie)} ${loc}-${tod}`;
}

function renderBlock(block: ScriptBlock): string {
  const t = block.text.replace(/\r\n/g, "\n").trimEnd();
  switch (block.type) {
    case "character": {
      const cue = (block.cueName ?? "").trim().toUpperCase();
      const ext = (block.extension ?? "").trim();
      const line = ext ? `${cue} (${ext})` : cue;
      return line ? `${line}\n` : "";
    }
    case "parenthetical":
      return t ? `(${t})\n` : "";
    case "dialogue":
      return t ? `${t}\n` : "";
    case "transition":
      return t ? `${t.toUpperCase().endsWith(":") ? t.toUpperCase() : `${t.toUpperCase()}:`}\n\n` : "";
    case "general":
      return t ? `${t}\n\n` : "";
    case "action":
    default:
      return t ? `${t}\n\n` : "";
  }
}

/** 스토리 비트 순서대로 씬을 평탄화한 뒤 극본형 플레인 텍스트 생성 (PDF 전 단계). */
export function storyToScreenplayText(story: StorySheet, bundle: SheetBundle): string {
  const meta = mergeScriptMeta(story.scriptMeta);
  const title = (meta.scriptTitle || story.title).trim();
  const lines: string[] = [];
  lines.push(title);
  if (meta.episodeTitle.trim()) lines.push(meta.episodeTitle.trim());
  if (meta.writtenBy.trim()) lines.push(`Written by ${meta.writtenBy.trim()}`);
  if (meta.basedOn.trim()) lines.push(`Based on ${meta.basedOn.trim()}`);
  if (meta.draftLabel.trim()) lines.push(meta.draftLabel.trim());
  if (meta.contact.trim()) lines.push(meta.contact.trim());
  if (meta.revisionNote.trim()) lines.push(meta.revisionNote.trim());
  lines.push("");
  lines.push("FADE IN:");
  lines.push("");

  const mapById = new Map(bundle.maps.map((m) => [m.id, m]));

  let nextAuto = Math.max(1, meta.pageNumberStart);

  for (const beat of story.beats ?? []) {
    for (const seq of beat.sequences ?? []) {
      for (const scene of seq.scenes ?? []) {
        const map = scene.castMapId ? mapById.get(scene.castMapId) : undefined;
        const n = scene.sceneNumber > 0 ? scene.sceneNumber : nextAuto;
        if (scene.sceneNumber > 0) {
          nextAuto = Math.max(nextAuto, scene.sceneNumber + 1);
        } else {
          nextAuto = n + 1;
        }
        lines.push(buildSceneSlugline(scene, map, n));
        lines.push("");

        const blocks = scene.scriptBlocks ?? [];
        if (blocks.length > 0) {
          for (const b of blocks) {
            const chunk = renderBlock(b);
            if (chunk) lines.push(chunk);
          }
        } else {
          const ev = (scene.event ?? "").trim();
          if (ev) lines.push(`${ev}\n\n`);
        }

        lines.push("");
      }
    }
  }

  lines.push("FADE OUT.");
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

/** 캐스팅된 인물 id → 극본 대사 큐 이름 */
export function screenplayCueForCharacter(c: Character): string {
  const cue = (c.screenplayCueName ?? "").trim();
  if (cue) return cue.toUpperCase();
  return (c.name ?? "CHARACTER").toUpperCase();
}

export function screenplayCueForMonster(m: Monster): string {
  const cue = (m.screenplayCueName ?? "").trim();
  if (cue) return cue.toUpperCase();
  return (m.name ?? "ANTAGONIST").toUpperCase();
}
