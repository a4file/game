import type { ReactNode } from "react";
import type { Character, Item, MapStage, Monster, StorySheet } from "../../rpg/types";
import { TmdbCastingPanel } from "../tmdb/TmdbCastingPanel";

type CharacterSheetRow = Omit<Character, "level" | "currentPage" | "awaken" | "equipped">;

export type BibleFileRowLite = { name: string; label: string };

/** 이 개수를 넘으면 드롭다운으로만 표시 */
const CASTING_INLINE_MAX = 3;

interface Props {
  story: StorySheet;
  maps: MapStage[];
  characters: CharacterSheetRow[];
  monsters: Monster[];
  items: Item[];
  docFiles: BibleFileRowLite[];
  docListLoading: boolean;
  onPatchStory: (patch: Partial<StorySheet>) => void;
  /** TMDB 검색으로 인물 시트 행을 추가할 때 (캐스팅 보드) */
  onAppendCharacterFromTmdb?: (row: Record<string, unknown>, options: { castToStory: boolean }) => void;
}

type SystemField = "characters" | "monsters" | "mapIds" | "objectIds";
type DocField = "castDocFactions" | "castDocRules" | "castDocEvents" | "castDocGoals";

const toggleId = (ids: string[], id: string, on: boolean): string[] => {
  const s = new Set(ids);
  if (on) s.add(id);
  else s.delete(id);
  return [...s];
};

function SystemSelectedRow({
  ids,
  pool,
  getId,
  getLabel,
  setField
}: {
  ids: string[];
  pool: Array<{ id: string; name: string }>;
  getId: (row: (typeof pool)[0]) => string;
  getLabel: (row: (typeof pool)[0]) => string;
  setField: (id: string, nextOn: boolean) => void;
}) {
  const resolve = (id: string) => pool.find((x) => getId(x) === id);

  if (ids.length === 0) {
    return <span className="story-casting-empty">캐스팅 없음</span>;
  }

  if (ids.length <= CASTING_INLINE_MAX) {
    return (
      <>
        {ids.map((id) => {
          const row = resolve(id);
          return (
            <button key={id} type="button" className="story-casting-pill story-casting-pill--on" onClick={() => setField(id, false)} title="클릭하여 제외">
              {row ? getLabel(row) : id}
              <span className="story-casting-pill-x" aria-hidden>
                ×
              </span>
            </button>
          );
        })}
      </>
    );
  }

  return (
    <div className="story-casting-overflow">
      <span className="story-casting-count-badge">{ids.length}개 캐스팅됨</span>
      <select
        className="story-casting-select"
        aria-label="캐스팅된 항목에서 제거"
        defaultValue=""
        onChange={(e) => {
          const v = e.target.value;
          if (v) {
            setField(v, false);
            e.target.value = "";
          }
        }}
      >
        <option value="">제거할 항목 선택…</option>
        {ids.map((id) => {
          const row = resolve(id);
          return (
            <option key={id} value={id}>
              {row ? `${getLabel(row)} (${id})` : id}
            </option>
          );
        })}
      </select>
    </div>
  );
}

function SystemPoolRow({
  pool,
  ids,
  getId,
  getLabel,
  setField
}: {
  pool: Array<{ id: string; name: string }>;
  ids: string[];
  getId: (row: (typeof pool)[0]) => string;
  getLabel: (row: (typeof pool)[0]) => string;
  setField: (id: string, nextOn: boolean) => void;
}) {
  if (pool.length === 0) {
    return <span className="story-casting-empty">시트에 항목이 없습니다.</span>;
  }

  if (pool.length <= CASTING_INLINE_MAX) {
    return (
      <div className="story-casting-pool" role="listbox">
        {pool.map((row) => {
          const id = getId(row);
          const on = ids.includes(id);
          return (
            <button
              key={id}
              type="button"
              role="option"
              aria-selected={on}
              className={`story-casting-chip ${on ? "story-casting-chip--on" : ""}`}
              onClick={() => setField(id, !on)}
              title={on ? "캐스팅 해제" : "캐스팅"}
            >
              <span className="story-casting-chip-id">{id}</span>
              <span className="story-casting-chip-name">{getLabel(row)}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="story-casting-overflow">
      <select
        className="story-casting-select story-casting-select--wide"
        aria-label="풀에서 캐스팅 추가 또는 제거"
        defaultValue=""
        onChange={(e) => {
          const v = e.target.value;
          if (v) {
            const on = ids.includes(v);
            setField(v, !on);
            e.target.value = "";
          }
        }}
      >
        <option value="">항목 선택 (추가/제거)…</option>
        {pool.map((row) => {
          const id = getId(row);
          const on = ids.includes(id);
          return (
            <option key={id} value={id}>
              {on ? "★ " : ""}
              {getLabel(row)} ({id})
            </option>
          );
        })}
      </select>
      <p className="story-casting-overflow-hint">★ = 이미 캐스팅됨. 같은 항목을 다시 선택하면 제거됩니다.</p>
    </div>
  );
}

function SystemCastRow({
  titleEn,
  titleKo,
  subtitle,
  story,
  ids,
  field,
  pool,
  getId,
  getLabel,
  onPatchStory,
  footer
}: {
  titleEn: string;
  titleKo: string;
  subtitle: string;
  story: StorySheet;
  ids: string[];
  field: SystemField;
  pool: Array<{ id: string; name: string }>;
  getId: (row: (typeof pool)[0]) => string;
  getLabel: (row: (typeof pool)[0]) => string;
  onPatchStory: (patch: Partial<StorySheet>) => void;
  footer?: ReactNode;
}) {
  const setField = (id: string, nextOn: boolean) => {
    const cur = story[field];
    onPatchStory({ [field]: toggleId(cur, id, nextOn) } as Partial<StorySheet>);
  };

  return (
    <section className="story-casting-block">
      <h4 className="story-casting-title">
        <span className="story-casting-title-en">{titleEn}</span>
        <span className="story-casting-title-ko">{titleKo}</span>
      </h4>
      <p className="story-casting-slot-hint">{subtitle}</p>
      <div className="story-casting-selected" aria-label={`캐스팅된 ${titleEn}`}>
        <SystemSelectedRow ids={ids} pool={pool} getId={getId} getLabel={getLabel} setField={setField} />
      </div>
      <div className="story-casting-pool-wrap">
        <SystemPoolRow pool={pool} ids={ids} getId={getId} getLabel={getLabel} setField={setField} />
      </div>
      {footer ? <div className="story-casting-footer">{footer}</div> : null}
    </section>
  );
}

function DocSelectedRow({
  ids,
  docFiles,
  setField
}: {
  ids: string[];
  docFiles: BibleFileRowLite[];
  setField: (name: string, nextOn: boolean) => void;
}) {
  if (ids.length === 0) {
    return <span className="story-casting-empty">캐스팅 없음</span>;
  }

  if (ids.length <= CASTING_INLINE_MAX) {
    return (
      <>
        {ids.map((name) => {
          const meta = docFiles.find((f) => f.name === name);
          return (
            <button key={name} type="button" className="story-casting-pill story-casting-pill--docs" onClick={() => setField(name, false)} title="클릭하여 제외">
              {meta?.label ?? name}
              <span className="story-casting-pill-x" aria-hidden>
                ×
              </span>
            </button>
          );
        })}
      </>
    );
  }

  return (
    <div className="story-casting-overflow">
      <span className="story-casting-count-badge">{ids.length}개 문서 연결됨</span>
      <select
        className="story-casting-select"
        aria-label="연결된 문서 제거"
        defaultValue=""
        onChange={(e) => {
          const v = e.target.value;
          if (v) {
            setField(v, false);
            e.target.value = "";
          }
        }}
      >
        <option value="">제거할 문서 선택…</option>
        {ids.map((name) => {
          const meta = docFiles.find((f) => f.name === name);
          return (
            <option key={name} value={name}>
              {meta ? `${meta.label} (${name})` : name}
            </option>
          );
        })}
      </select>
    </div>
  );
}

function DocPoolRow({
  docFiles,
  ids,
  setField
}: {
  docFiles: BibleFileRowLite[];
  ids: string[];
  setField: (name: string, nextOn: boolean) => void;
}) {
  if (docFiles.length === 0) {
    return <span className="story-casting-empty">문서 없음</span>;
  }

  if (docFiles.length <= CASTING_INLINE_MAX) {
    return (
      <div className="story-casting-pool" role="listbox">
        {docFiles.map((f) => {
          const on = ids.includes(f.name);
          return (
            <button
              key={f.name}
              type="button"
              role="option"
              aria-selected={on}
              className={`story-casting-chip story-casting-chip--doc ${on ? "story-casting-chip--on" : ""}`}
              onClick={() => setField(f.name, !on)}
              title={on ? "캐스팅 해제" : "캐스팅"}
            >
              <span className="story-casting-chip-id">{f.name}</span>
              <span className="story-casting-chip-name">{f.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="story-casting-overflow">
      <select
        className="story-casting-select story-casting-select--wide"
        aria-label="문서 추가 또는 제거"
        defaultValue=""
        onChange={(e) => {
          const v = e.target.value;
          if (v) {
            const on = ids.includes(v);
            setField(v, !on);
            e.target.value = "";
          }
        }}
      >
        <option value="">문서 선택 (연결/해제)…</option>
        {docFiles.map((f) => {
          const on = ids.includes(f.name);
          return (
            <option key={f.name} value={f.name}>
              {on ? "★ " : ""}
              {f.label} ({f.name})
            </option>
          );
        })}
      </select>
      <p className="story-casting-overflow-hint">★ = 이미 이 슬롯에 연결됨. 다시 선택하면 연결 해제.</p>
    </div>
  );
}

function DocCastRow({
  titleEn,
  titleKo,
  subtitle,
  story,
  field,
  docFiles,
  onPatchStory
}: {
  titleEn: string;
  titleKo: string;
  subtitle: string;
  story: StorySheet;
  field: DocField;
  docFiles: BibleFileRowLite[];
  onPatchStory: (patch: Partial<StorySheet>) => void;
}) {
  const ids = story[field];
  const setField = (name: string, nextOn: boolean) => {
    const cur = story[field];
    onPatchStory({ [field]: toggleId(cur, name, nextOn) } as Partial<StorySheet>);
  };

  return (
    <section className="story-casting-block story-casting-block--docs">
      <h4 className="story-casting-title">
        <span className="story-casting-title-en">{titleEn}</span>
        <span className="story-casting-title-ko">{titleKo}</span>
      </h4>
      <p className="story-casting-slot-hint">{subtitle}</p>
      <div className="story-casting-selected" aria-label={`캐스팅된 ${titleEn}`}>
        <DocSelectedRow ids={ids} docFiles={docFiles} setField={setField} />
      </div>
      <div className="story-casting-pool-wrap">
        <DocPoolRow docFiles={docFiles} ids={ids} setField={setField} />
      </div>
    </section>
  );
}

export const StoryCastingBoard = ({ story, maps, characters, monsters, items, docFiles, docListLoading, onPatchStory, onAppendCharacterFromTmdb }: Props) => {
  const charPool = characters.map((c) => ({ id: c.id, name: c.name }));
  const monPool = monsters.map((m) => ({ id: m.id, name: m.name }));
  const mapPool = maps.map((m) => ({ id: m.id, name: m.name }));
  const itemPool = items.map((i) => ({ id: i.id, name: i.name }));

  return (
    <div className="story-casting-board" aria-label="캐스팅보드">
      <p className="story-casting-lead">
        <strong>SYSTEM</strong> 네 칸은 인물·대립·로케이션·오브젝트 시트에서 고릅니다. <strong>PERSON</strong> 아래 TMDB 검색으로 시트 행을 만들고 이 스토리에 바로 캐스팅할 수 있습니다.{" "}
        <strong>DOCS</strong> 네 칸은 Mythic Archive 마크다운을 이 스토리에 묶습니다. 항목이 {CASTING_INLINE_MAX}개를 넘으면 아래처럼 <strong>드롭다운</strong>으로만 다룹니다.
      </p>

      <div className="story-casting-group">
        <h3 className="story-casting-group-title">SYSTEM — 캐스팅 시트</h3>
        <SystemCastRow
          titleEn="PERSON"
          titleKo="인물"
          subtitle="인물 시트(id)와 1:1로 연결됩니다."
          story={story}
          field="characters"
          ids={story.characters}
          pool={charPool}
          getId={(r) => r.id}
          getLabel={(r) => r.name}
          onPatchStory={onPatchStory}
          footer={
            onAppendCharacterFromTmdb ? (
              <TmdbCastingPanel existingCharacterRows={characters} onAppend={onAppendCharacterFromTmdb} />
            ) : null
          }
        />
        <SystemCastRow
          titleEn="ANTAGONIST"
          titleKo="대립·위협"
          subtitle="대립·위협 시트(레거리: 몬스터)와 연결됩니다."
          story={story}
          field="monsters"
          ids={story.monsters}
          pool={monPool}
          getId={(r) => r.id}
          getLabel={(r) => r.name}
          onPatchStory={onPatchStory}
        />
        <SystemCastRow
          titleEn="LOCATION"
          titleKo="로케이션"
          subtitle="로케이션 시트(레거리: 맵·스테이지)와 연결됩니다."
          story={story}
          field="mapIds"
          ids={story.mapIds}
          pool={mapPool}
          getId={(r) => r.id}
          getLabel={(r) => r.name}
          onPatchStory={onPatchStory}
        />
        <SystemCastRow
          titleEn="KEY_OBJECT"
          titleKo="핵심 오브젝트"
          subtitle="오브젝트 시트(SYSTEM · 아이템)와 연결됩니다."
          story={story}
          field="objectIds"
          ids={story.objectIds}
          pool={itemPool}
          getId={(r) => r.id}
          getLabel={(r) => r.name}
          onPatchStory={onPatchStory}
        />
      </div>

      <div className="story-casting-group">
        <h3 className="story-casting-group-title">DOCS — 설정 문서 (Mythic Archive)</h3>
        {docListLoading ? (
          <p className="story-casting-empty">문서 목록 로딩 중…</p>
        ) : docFiles.length === 0 ? (
          <p className="story-casting-empty">문서 목록을 불러오지 못했습니다. DOCS 탭 또는 백엔드를 확인하세요.</p>
        ) : (
          <>
            <DocCastRow
              titleEn="FACTION"
              titleKo="세력"
              subtitle="종족·파벌·국가 등 세력 설정 문서를 묶습니다. (예: Factions)"
              story={story}
              field="castDocFactions"
              docFiles={docFiles}
              onPatchStory={onPatchStory}
            />
            <DocCastRow
              titleEn="RULE"
              titleKo="세계 법칙"
              subtitle="물리·능력·금지 등 규칙 문서를 묶습니다. (예: World Bible, Content standards)"
              story={story}
              field="castDocRules"
              docFiles={docFiles}
              onPatchStory={onPatchStory}
            />
            <DocCastRow
              titleEn="EVENT"
              titleKo="사건 트리거"
              subtitle="사건·플래그·트리거로 쓸 문서를 묶습니다."
              story={story}
              field="castDocEvents"
              docFiles={docFiles}
              onPatchStory={onPatchStory}
            />
            <DocCastRow
              titleEn="GOAL"
              titleKo="서사의 방향"
              subtitle="테마·톤·결말 방향 문서를 묶습니다. (예: Tone & taboos)"
              story={story}
              field="castDocGoals"
              docFiles={docFiles}
              onPatchStory={onPatchStory}
            />
          </>
        )}
      </div>
    </div>
  );
};
