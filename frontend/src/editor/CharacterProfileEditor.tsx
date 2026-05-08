import { useMemo, useState } from "react";
import type { ElementType, Rarity } from "../rpg/types";
import { SkillIdsEditor } from "./SkillIdsEditor";

type CharacterRow = Record<string, unknown>;

interface Props {
  rows: CharacterRow[];
  skillOptions: Array<{ id: string; name: string }>;
  onChange: (nextRows: CharacterRow[]) => void;
}

const rarityOptions: Rarity[] = ["normal", "rare", "unique", "epic", "legendary"];
const elementOptions: ElementType[] = ["fire", "water", "nature", "machine"];

const normalizeIds = (raw: unknown): string[] => {
  if (Array.isArray(raw)) return raw.map((entry) => String(entry));
  if (typeof raw === "string") {
    return raw
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
};

export const CharacterProfileEditor = ({ rows, skillOptions, onChange }: Props) => {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const lowered = query.trim().toLowerCase();
    if (!lowered) return rows;
    return rows.filter((row) => String(row.name ?? "").toLowerCase().includes(lowered) || String(row.id ?? "").toLowerCase().includes(lowered));
  }, [rows, query]);

  const selected = useMemo(() => {
    if (!selectedId) return filtered[0] ?? rows[0] ?? null;
    return rows.find((row) => String(row.id) === selectedId) ?? filtered[0] ?? rows[0] ?? null;
  }, [rows, filtered, selectedId]);

  const selectedIndex = selected ? rows.findIndex((row) => row.id === selected.id) : -1;

  const updateSelected = (field: string, value: unknown) => {
    if (selectedIndex < 0) return;
    const nextRows = rows.map((row, idx) => (idx === selectedIndex ? { ...row, [field]: value } : row));
    onChange(nextRows);
  };

  const selectedSkillIds = normalizeIds(selected?.skillIds);

  return (
    <div className="character-editor">
      <aside className="character-list">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="search name/id" />
        <div className="character-list-scroll">
          {filtered.map((row) => {
            const active = selected && row.id === selected.id;
            return (
              <button key={String(row.id)} type="button" className={`character-row ${active ? "active" : ""}`} onClick={() => setSelectedId(String(row.id))}>
                <span>{String(row.name ?? "-")}</span>
                <small>{String(row.id ?? "-")}</small>
              </button>
            );
          })}
        </div>
      </aside>
      <section className="character-detail">
        {!selected ? (
          <p>캐릭터를 선택하세요.</p>
        ) : (
          <>
            <h4>{String(selected.name ?? "-")} profile</h4>
            <div className="detail-grid">
              <label>
                name
                <input value={String(selected.name ?? "")} onChange={(e) => updateSelected("name", e.target.value)} />
              </label>
              <label>
                id
                <input value={String(selected.id ?? "")} onChange={(e) => updateSelected("id", e.target.value)} />
              </label>
              <label>
                rarity
                <select value={String(selected.rarity ?? "normal")} onChange={(e) => updateSelected("rarity", e.target.value)}>
                  {rarityOptions.map((rarity) => (
                    <option key={rarity} value={rarity}>
                      {rarity}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                className
                <input value={String(selected.className ?? "방랑자")} onChange={(e) => updateSelected("className", e.target.value)} />
              </label>
              <label>
                nation
                <input value={String(selected.nation ?? "무소속")} onChange={(e) => updateSelected("nation", e.target.value)} />
              </label>
              <label>
                element
                <select value={String(selected.element ?? "fire")} onChange={(e) => updateSelected("element", e.target.value)}>
                  {elementOptions.map((element) => (
                    <option key={element} value={element}>
                      {element}
                    </option>
                  ))}
                </select>
              </label>
              {["str", "agi", "luk", "intel", "atk", "hp", "maxPages"].map((field) => (
                <label key={field}>
                  {field}
                  <input value={String(selected[field] ?? "")} onChange={(e) => updateSelected(field, Number(e.target.value || 0))} />
                </label>
              ))}
              <label className="detail-span-2">
                description
                <textarea value={String(selected.description ?? "")} onChange={(e) => updateSelected("description", e.target.value)} />
              </label>
              <label className="detail-span-2">
                storyPages (one line = one page)
                <textarea
                  value={Array.isArray(selected.storyPages) ? selected.storyPages.map((line) => String(line)).join("\n") : ""}
                  onChange={(e) => updateSelected("storyPages", e.target.value.split("\n").map((line) => line.trim()).filter(Boolean))}
                />
              </label>
              <SkillIdsEditor
                label="skills"
                value={selectedSkillIds}
                skillOptions={skillOptions}
                onChange={(next) => updateSelected("skillIds", next)}
              />
            </div>
          </>
        )}
      </section>
    </div>
  );
};
