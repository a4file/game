import { useMemo, useState } from "react";
import { sheetSchemas } from "./sheets/schemas";
import { formatStoryPageLabel, stripLegacyChapterPrefix } from "../rpg/storyLabels";
import type { StoryEventType } from "../rpg/types";
import { SkillIdsEditor } from "./SkillIdsEditor";

type SheetRow = Record<string, unknown>;

interface Props {
  sheetName: string;
  title: string;
  rows: SheetRow[];
  skillOptions: Array<{ id: string; name: string }>;
  onChange: (nextRows: SheetRow[]) => void;
}

const rarityOptions = ["normal", "rare", "unique", "epic", "legendary"] as const;
const elementOptions = ["fire", "water", "nature", "machine"] as const;
const eventTypeOptions: StoryEventType[] = [
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
const eventTierOptions = ["common", "rare", "legend"] as const;
const slotOptions = ["weapon", "armor", "accessory"] as const;
const skillKindOptions = ["attack", "buff", "debuff", "support"] as const;
const itemTypeOptions = ["consumable", "material", "currency"] as const;

const normalizeStringArray = (raw: unknown): string[] => {
  if (Array.isArray(raw)) return raw.map((entry) => String(entry));
  if (typeof raw === "string") {
    return raw
      .split(/[,\n]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
};

const arrayToLines = (raw: unknown): string =>
  Array.isArray(raw) ? raw.map((entry) => String(entry)).join("\n") : "";

const prettyJson = (raw: unknown): string => {
  try {
    return JSON.stringify(raw ?? [], null, 2);
  } catch {
    return "[]";
  }
};

export const SheetProfileEditor = ({ sheetName, title, rows, skillOptions, onChange }: Props) => {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const columns = sheetSchemas[sheetName] ?? [];

  const filtered = useMemo(() => {
    const lowered = query.trim().toLowerCase();
    if (!lowered) return rows;
    return rows.filter(
      (row) =>
        String(row.name ?? "").toLowerCase().includes(lowered) ||
        String(row.id ?? "").toLowerCase().includes(lowered) ||
        String(row.title ?? "").toLowerCase().includes(lowered)
    );
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

  const duplicateSelected = () => {
    if (selectedIndex < 0 || !selected) return;
    const copy = { ...selected, id: `${String(selected.id ?? "row")}-copy-${Date.now()}` };
    const next = [...rows];
    next.splice(selectedIndex + 1, 0, copy);
    onChange(next);
    setSelectedId(String(copy.id));
  };

  const deleteSelected = () => {
    if (selectedIndex < 0) return;
    const next = rows.filter((_, idx) => idx !== selectedIndex);
    onChange(next);
    setSelectedId(null);
  };

  const renderField = (column: string) => {
    if (!selected) return null;
    const value = selected[column];

    if (column === "skillIds") {
      const ids = normalizeStringArray(value);
      return (
        <SkillIdsEditor
          key={column}
          label="skillIds"
          value={ids}
          skillOptions={skillOptions}
          onChange={(next) => updateSelected("skillIds", next)}
        />
      );
    }

    if (column === "monsterIds") {
      return (
        <label key={column} className="detail-span-2">
          monsterIds (한 줄에 하나 또는 쉼표)
          <textarea
            value={arrayToLines(value)}
            onChange={(e) => updateSelected("monsterIds", normalizeStringArray(e.target.value))}
          />
        </label>
      );
    }

    if (column === "storyPages") {
      return (
        <label key={column} className="detail-span-2">
          storyPages (한 줄 = 한 페이지)
          <textarea
            value={arrayToLines(value)}
            onChange={(e) =>
              updateSelected(
                "storyPages",
                e.target.value
                  .split("\n")
                  .map((line) => line.trim())
                  .filter(Boolean)
              )
            }
          />
        </label>
      );
    }

    if (column === "characters" || column === "monsters" || column === "systems" || column === "mapIds") {
      return (
        <label key={column} className="detail-span-2">
          {column} (한 줄에 하나 또는 쉼표)
          <textarea value={arrayToLines(value)} onChange={(e) => updateSelected(column, normalizeStringArray(e.target.value))} />
        </label>
      );
    }

    if (column === "beats") {
      return (
        <label key={column} className="detail-span-2">
          beats (JSON)
          <textarea
            value={prettyJson(value)}
            onChange={(e) => {
              try {
                const parsed = JSON.parse(e.target.value);
                if (Array.isArray(parsed)) updateSelected("beats", parsed);
              } catch {
                // Keep editor resilient while typing invalid JSON.
              }
            }}
          />
        </label>
      );
    }

    if (column === "event") {
      return (
        <label key={column} className="detail-span-2">
          event (본문)
          <textarea value={String(value ?? "")} onChange={(e) => updateSelected("event", e.target.value)} />
        </label>
      );
    }

    if (column === "description" || column === "effect") {
      return (
        <label key={column} className="detail-span-2">
          {column}
          <textarea value={String(value ?? "")} onChange={(e) => updateSelected(column, e.target.value)} />
        </label>
      );
    }

    if (column === "rarity") {
      return (
        <label key={column}>
          {column}
          <select className={`rarity-cell rarity-${String(value ?? "normal").toLowerCase()}`} value={String(value ?? "normal")} onChange={(e) => updateSelected("rarity", e.target.value)}>
            {rarityOptions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
      );
    }

    if (column === "element") {
      return (
        <label key={column}>
          {column}
          <select value={String(value ?? "fire")} onChange={(e) => updateSelected("element", e.target.value)}>
            {elementOptions.map((el) => (
              <option key={el} value={el}>
                {el}
              </option>
            ))}
          </select>
        </label>
      );
    }

    if (column === "eventType") {
      return (
        <label key={column}>
          {column}
          <select value={String(value ?? "adventure")} onChange={(e) => updateSelected("eventType", e.target.value)}>
            {eventTypeOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      );
    }

    if (column === "eventTier") {
      return (
        <label key={column}>
          {column}
          <select value={String(value ?? "common")} onChange={(e) => updateSelected("eventTier", e.target.value)}>
            {eventTierOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      );
    }

    if (column === "slot") {
      return (
        <label key={column}>
          {column}
          <select value={String(value ?? "weapon")} onChange={(e) => updateSelected("slot", e.target.value)}>
            {slotOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      );
    }

    if (column === "kind") {
      return (
        <label key={column}>
          {column}
          <select value={String(value ?? "attack")} onChange={(e) => updateSelected("kind", e.target.value)}>
            {skillKindOptions.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
      );
    }

    if (column === "type") {
      return (
        <label key={column}>
          {column}
          <select value={String(value ?? "consumable")} onChange={(e) => updateSelected("type", e.target.value)}>
            {itemTypeOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      );
    }

    if (column === "powerMultiplier") {
      return (
        <label key={column}>
          {column}
          <input
            type="number"
            step={0.1}
            value={Number(value ?? 1.1)}
            onChange={(e) => updateSelected(column, Number(e.target.value || 0))}
          />
        </label>
      );
    }

    if (
      ["chapter", "recommendedPower", "str", "agi", "luk", "intel", "atk", "hp", "maxPages", "amount", "cooldown"].includes(column)
    ) {
      return (
        <label key={column}>
          {column}
          <input
            type="number"
            value={Number(value ?? 0)}
            onChange={(e) => updateSelected(column, Number(e.target.value || 0))}
          />
        </label>
      );
    }

    return (
      <label key={column} className={column === "title" || column.startsWith("option") || column.startsWith("flag") ? "detail-span-2" : undefined}>
        {column}
        <input value={String(value ?? "")} onChange={(e) => updateSelected(column, e.target.value)} />
      </label>
    );
  };

  const listLabel = (row: SheetRow) => {
    if (sheetName === "stories") {
      return String(row.title ?? row.id ?? "-");
    }
    if (sheetName === "storyBranches") {
      const ch = Number(row.chapter) || 1;
      const t = stripLegacyChapterPrefix(String(row.title ?? ""));
      return `${formatStoryPageLabel(ch)} ${t || String(row.id ?? "-")}`.trim();
    }
    return String(row.name ?? row.title ?? row.id ?? "-");
  };

  const listSub = (row: SheetRow) => {
    if (sheetName === "stories") {
      const beatCount = Array.isArray(row.beats) ? row.beats.length : 0;
      return `${String(row.id ?? "-")} · ${beatCount} beats`;
    }
    if (sheetName === "storyBranches") {
      const ch = Number(row.chapter) || 1;
      return `${formatStoryPageLabel(ch)} · ${String(row.eventType ?? "")}`;
    }
    return String(row.id ?? "-");
  };

  return (
    <div className="sheet-profile-editor">
      <aside className="sheet-profile-sidebar">
        <div className="sheet-profile-list-header">
          <span className="sheet-profile-badge">{title}</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="검색 (이름·id·제목)" />
        </div>
        <div className="sheet-profile-list-scroll">
          {filtered.map((row, idx) => {
            const active = selected && row.id === selected.id;
            return (
              <button
                key={`${String(row.id)}-${idx}`}
                type="button"
                className={`sheet-profile-row ${active ? "active" : ""}`}
                onClick={() => setSelectedId(String(row.id))}
              >
                <span>{listLabel(row)}</span>
                <small>{listSub(row)}</small>
              </button>
            );
          })}
        </div>
      </aside>
      <section className="sheet-profile-detail">
        {!selected ? (
          <p className="sheet-profile-empty">항목을 선택하세요.</p>
        ) : (
          <>
            <div className="sheet-profile-detail-head">
              <h4>{listLabel(selected)}</h4>
              <div className="sheet-profile-detail-actions">
                <button type="button" onClick={duplicateSelected}>
                  duplicate
                </button>
                <button type="button" className="danger" onClick={deleteSelected}>
                  delete
                </button>
              </div>
            </div>
            <div className="detail-grid">{columns.map((col) => renderField(col))}</div>
          </>
        )}
      </section>
    </div>
  );
};
