import { useMemo } from "react";
import { sheetSchemas } from "./schemas";

interface Props {
  sheetName: string;
  rows: Array<Record<string, unknown>>;
  onChange: (rows: Array<Record<string, unknown>>) => void;
  skillOptions?: Array<{ id: string; name: string }>;
  onDeleteRow?: (index: number) => void;
  onDuplicateRow?: (index: number) => void;
  onAddRow?: () => void;
}

export const SheetTable = ({
  sheetName,
  rows,
  onChange,
  skillOptions = [],
  onDeleteRow,
  onDuplicateRow,
  onAddRow
}: Props) => {
  const columns = useMemo(() => sheetSchemas[sheetName] ?? [], [sheetName]);
  const rarityOptions = ["normal", "rare", "unique", "epic", "legendary"] as const;
  const eventTypeOptions = [
    "battle",
    "adventure",
    "companion",
    "merchant",
    "town",
    "fishing",
    "maze",
    "trap",
    "treasure"
  ] as const;
  const eventTierOptions = ["common", "rare", "legend"] as const;

  const updateCell = (idx: number, key: string, value: string) => {
    const next = rows.map((row, rowIdx) => (rowIdx === idx ? { ...row, [key]: value } : row));
    onChange(next);
  };

  const normalizeSkillIds = (raw: unknown): string[] => {
    if (Array.isArray(raw)) return raw.map((item) => String(item));
    if (typeof raw === "string") {
      return raw
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return [];
  };

  const setSkillIds = (idx: number, selected: string[]) => {
    const next = rows.map((item, rowIdx) => (rowIdx === idx ? { ...item, skillIds: selected } : item));
    onChange(next);
  };

  return (
    <div className="sheet-table">
      <div className="sheet-toolbar">
        <button type="button" onClick={onAddRow}>
          + add row
        </button>
        <span>visible rows: {rows.length}</span>
      </div>
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
            <th>actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length + 1}>현재 페이지에 표시할 데이터가 없습니다.</td>
            </tr>
          )}
          {rows.map((row, idx) => (
            <tr key={`${sheetName}-${idx}`}>
              {columns.map((column) => (
                <td key={`${idx}-${column}`}>
                  {column === "skillIds" ? (
                    <select
                      className="skill-select"
                      multiple
                      size={4}
                      value={normalizeSkillIds(row.skillIds)}
                      onChange={(e) => {
                        const selected = Array.from(e.currentTarget.selectedOptions).map((opt) => opt.value);
                        setSkillIds(idx, selected);
                      }}
                    >
                      {skillOptions.map((skill) => (
                        <option key={`${idx}-${skill.id}`} value={skill.id}>
                          {skill.name}
                        </option>
                      ))}
                    </select>
                  ) : column === "rarity" ? (
                    <select
                      className={`rarity-cell rarity-${String(row[column] ?? "normal").toLowerCase()}`}
                      value={String(row[column] ?? "normal")}
                      onChange={(e) => updateCell(idx, column, e.target.value)}
                    >
                      {rarityOptions.map((rarity) => (
                        <option key={`${idx}-rarity-${rarity}`} value={rarity}>
                          {rarity}
                        </option>
                      ))}
                    </select>
                  ) : column === "eventType" ? (
                    <select value={String(row[column] ?? "adventure")} onChange={(e) => updateCell(idx, column, e.target.value)}>
                      {eventTypeOptions.map((option) => (
                        <option key={`${idx}-eventType-${option}`} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : column === "eventTier" ? (
                    <select value={String(row[column] ?? "common")} onChange={(e) => updateCell(idx, column, e.target.value)}>
                      {eventTierOptions.map((option) => (
                        <option key={`${idx}-eventTier-${option}`} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={String(row[column] ?? "")}
                      onChange={(e) => updateCell(idx, column, e.target.value)}
                    />
                  )}
                </td>
              ))}
              <td>
                <div className="row-actions">
                  <button type="button" onClick={() => onDuplicateRow?.(idx)}>
                    dup
                  </button>
                  <button type="button" onClick={() => onDeleteRow?.(idx)}>
                    del
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

