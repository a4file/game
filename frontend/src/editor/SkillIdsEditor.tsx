import { useState } from "react";

interface Props {
  label?: string;
  value: string[];
  skillOptions: Array<{ id: string; name: string }>;
  onChange: (next: string[]) => void;
}

export const SkillIdsEditor = ({ label = "skills", value, skillOptions, onChange }: Props) => {
  const [open, setOpen] = useState(false);
  const [pickSeq, setPickSeq] = useState(0);

  const availableToAdd = skillOptions.filter((s) => !value.includes(s.id));

  const addId = (id: string) => {
    if (!id || value.includes(id)) return;
    onChange([...value, id]);
    setPickSeq((n) => n + 1);
  };

  const removeId = (id: string) => {
    onChange(value.filter((x) => x !== id));
  };

  return (
    <div className="skill-ids-editor detail-span-2">
      <button type="button" className="skill-ids-toggle" onClick={() => setOpen((o) => !o)}>
        <span className="skill-ids-toggle-label">
          {label}
          <span className="skill-ids-count">{value.length}</span>
        </span>
        <span className="skill-ids-chevron" aria-hidden>
          {open ? "▼" : "▶"}
        </span>
      </button>
      {open && (
        <div className="skill-ids-panel">
          {value.length === 0 ? (
            <p className="skill-ids-empty">등록된 스킬 없음 — 아래에서 추가하세요.</p>
          ) : (
            <ul className="skill-ids-chips">
              {value.map((id) => {
                const name = skillOptions.find((s) => s.id === id)?.name ?? id;
                return (
                  <li key={id} className="skill-chip">
                    <span className="skill-chip-name">{name}</span>
                    <button type="button" className="skill-chip-remove" onClick={() => removeId(id)} aria-label={`${name} 제거`}>
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="skill-ids-add">
            <select
              key={pickSeq}
              className="skill-ids-pick"
              defaultValue=""
              onChange={(e) => {
                const v = e.target.value;
                if (v) addId(v);
              }}
            >
              <option value="">스킬 선택 후 추가…</option>
              {availableToAdd.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
};
