import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import type { Character, SheetBundle, StoryBranch, StorySheet } from "../../rpg/types";
import { getApiBaseUrl } from "../../apiBase";
import { StoryCastingBoard } from "./StoryCastingBoard";
import type { BibleFileRowLite } from "./StoryCastingBoard";

interface Props {
  bundle: SheetBundle;
  story: StorySheet;
  onUpdateBundle: (next: SheetBundle) => void;
}

const publicAssetsBase = (): string => {
  const base = import.meta.env.BASE_URL ?? "/";
  return base.endsWith("/") ? base : `${base}/`;
};

const BIBLE_FALLBACK: BibleFileRowLite[] = [
  { name: "00-world-bible.md", label: "World Bible" },
  { name: "01-factions.md", label: "Factions" },
  { name: "02-content-standards.md", label: "Content standards" },
  { name: "03-tone-and-taboos.md", label: "Tone & taboos" }
];

async function loadDocFileList(): Promise<BibleFileRowLite[]> {
  const api = axios.create({ baseURL: getApiBaseUrl(), timeout: 15_000 });
  try {
    const { data } = await api.get<{ files?: Array<{ name?: string; label?: string }> }>("/editor/bible");
    const list = Array.isArray(data?.files)
      ? data.files
          .filter((f) => typeof f?.name === "string" && f.name.endsWith(".md"))
          .map((f) => ({ name: f.name as string, label: typeof f.label === "string" ? f.label : (f.name as string) }))
      : [];
    if (list.length > 0) return list.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    /* static */
  }
  try {
    const r = await fetch(`${publicAssetsBase()}bible-manifest.json`);
    if (r.ok) {
      const data = await r.json();
      const rows = Array.isArray(data?.files) ? data.files : [];
      const list: BibleFileRowLite[] = [];
      for (const row of rows) {
        const name = typeof row?.name === "string" ? row.name : "";
        if (name.endsWith(".md")) list.push({ name, label: typeof row?.label === "string" ? row.label : name });
      }
      if (list.length > 0) return list.sort((a, b) => a.name.localeCompare(b.name));
    }
  } catch {
    /* fallback */
  }
  return [...BIBLE_FALLBACK];
}

export const StoryWorldPanel = ({ bundle, story, onUpdateBundle }: Props) => {
  const [docFiles, setDocFiles] = useState<BibleFileRowLite[]>([]);
  const [docListLoading, setDocListLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setDocListLoading(true);
      const list = await loadDocFileList();
      if (!cancelled) {
        setDocFiles(list);
        setDocListLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const patchStory = useCallback(
    (patch: Partial<StorySheet>) => {
      onUpdateBundle({
        ...bundle,
        stories: bundle.stories.map((s) => (s.id === story.id ? { ...s, ...patch } : s))
      });
    },
    [bundle, onUpdateBundle, story.id]
  );

  const appendCharacterFromTmdb = useCallback(
    (row: Record<string, unknown>, { castToStory }: { castToStory: boolean }) => {
      const character = row as unknown as Character;
      const charId = String(character.id);
      const nextCharacters = [...bundle.characters, character];
      const nextStories = bundle.stories.map((s) => {
        if (s.id !== story.id) return s;
        if (!castToStory) return s;
        if (s.characters.includes(charId)) return s;
        return { ...s, characters: [...s.characters, charId] };
      });
      onUpdateBundle({ ...bundle, characters: nextCharacters, stories: nextStories });
    },
    [bundle, onUpdateBundle, story.id]
  );

  return (
    <div className="story-world-panel">
      <StoryCastingBoard
        story={story}
        maps={bundle.maps}
        characters={bundle.characters}
        monsters={bundle.monsters}
        items={bundle.items}
        docFiles={docFiles}
        docListLoading={docListLoading}
        onPatchStory={patchStory}
        onAppendCharacterFromTmdb={appendCharacterFromTmdb}
      />
    </div>
  );
};

export const orphanStoryBranches = (bundle: SheetBundle): StoryBranch[] =>
  bundle.storyBranches.filter((b) => !bundle.stories.some((s) => b.id.startsWith(`${s.id}-`)));
