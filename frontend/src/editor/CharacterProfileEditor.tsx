import { useEffect, useMemo, useState } from "react";
import type { ElementType, Rarity } from "../rpg/types";
import { SkillIdsEditor } from "./SkillIdsEditor";
import { fetchTmdbPerson, formatTmdbApiError, searchTmdbPersons, type TmdbPersonDetail, type TmdbPersonSearchHit } from "./tmdb/tmdbEditorApi";
import { buildTmdbCharacterPatch, characterRowFromTmdbDetail } from "./tmdb/tmdbCharacterMap";

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

const str = (row: CharacterRow | null, key: string): string => (row && key in row && row[key] != null ? String(row[key]) : "");

export const CharacterProfileEditor = ({ rows, skillOptions, onChange }: Props) => {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tmdbQ, setTmdbQ] = useState("");
  const [tmdbHits, setTmdbHits] = useState<TmdbPersonSearchHit[]>([]);
  const [tmdbLoading, setTmdbLoading] = useState(false);
  const [tmdbErr, setTmdbErr] = useState("");
  const [tmdbPick, setTmdbPick] = useState<TmdbPersonSearchHit | null>(null);
  const [tmdbDetail, setTmdbDetail] = useState<TmdbPersonDetail | null>(null);
  const [tmdbDetailLoading, setTmdbDetailLoading] = useState(false);

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

  const runTmdbSearch = async () => {
    const q = tmdbQ.trim();
    if (q.length < 2) {
      setTmdbErr("검색어는 2글자 이상 입력하세요.");
      setTmdbHits([]);
      return;
    }
    setTmdbErr("");
    setTmdbLoading(true);
    setTmdbPick(null);
    setTmdbDetail(null);
    try {
      const hits = await searchTmdbPersons(q);
      setTmdbHits(hits);
      if (hits.length === 0) setTmdbErr("검색 결과가 없습니다.");
    } catch (e) {
      setTmdbErr(formatTmdbApiError(e));
      setTmdbHits([]);
    } finally {
      setTmdbLoading(false);
    }
  };

  useEffect(() => {
    if (!tmdbPick) {
      setTmdbDetail(null);
      return;
    }
    let cancelled = false;
    setTmdbDetailLoading(true);
    void (async () => {
      try {
        const detail = await fetchTmdbPerson(tmdbPick.id);
        if (!cancelled) {
          setTmdbDetail(detail);
          setTmdbErr("");
        }
      } catch (e) {
        if (!cancelled) {
          setTmdbDetail(null);
          setTmdbErr(formatTmdbApiError(e));
        }
      } finally {
        if (!cancelled) setTmdbDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tmdbPick]);

  const applyTmdbToSelected = () => {
    if (!selected || !tmdbDetail || selectedIndex < 0) return;
    const patch = buildTmdbCharacterPatch(tmdbDetail);
    const nextRows = rows.map((row, idx) => (idx === selectedIndex ? { ...row, ...patch } : row));
    onChange(nextRows);
  };

  const appendCharacterFromTmdb = () => {
    if (!tmdbDetail) return;
    const row = characterRowFromTmdbDetail(tmdbDetail, rows);
    onChange([...rows, row]);
    setSelectedId(String(row.id));
  };

  return (
    <div className="character-editor">
      <aside className="character-list">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="이름 / id 검색" />
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
        <div className="tmdb-cast-panel">
          <div className="tmdb-cast-panel-head">
            <h4 className="tmdb-cast-panel-title">TMDB 배우 검색</h4>
            <p className="tmdb-cast-panel-lead">The Movie Database에서 인물을 찾아 프로필 필드에 채웁니다. 서버에 <code>TMDB_API_KEY</code>가 있어야 합니다.</p>
          </div>
          <div className="tmdb-cast-search-row">
            <input
              className="tmdb-cast-search-input"
              value={tmdbQ}
              onChange={(e) => setTmdbQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void runTmdbSearch();
              }}
              placeholder="배우 이름 (영문·한글)"
              aria-label="TMDB 배우 검색어"
            />
            <button type="button" className="tmdb-cast-search-btn" onClick={() => void runTmdbSearch()} disabled={tmdbLoading}>
              {tmdbLoading ? "검색 중…" : "검색"}
            </button>
          </div>
          {tmdbErr ? <p className="tmdb-cast-error">{tmdbErr}</p> : null}
          {tmdbHits.length > 0 ? (
            <ul className="tmdb-cast-hit-list" aria-label="검색 결과">
              {tmdbHits.map((hit) => {
                const active = tmdbPick?.id === hit.id;
                return (
                  <li key={hit.id}>
                    <button type="button" className={`tmdb-cast-hit ${active ? "tmdb-cast-hit--active" : ""}`} onClick={() => setTmdbPick(hit)}>
                      {hit.profileUrl ? <img className="tmdb-cast-hit-img" src={hit.profileUrl} alt="" width={46} height={69} loading="lazy" /> : <span className="tmdb-cast-hit-placeholder" aria-hidden />}
                      <span className="tmdb-cast-hit-text">
                        <span className="tmdb-cast-hit-name">{hit.name}</span>
                        {hit.knownForSummary ? <span className="tmdb-cast-hit-known">{hit.knownForSummary}</span> : null}
                        {hit.department ? <span className="tmdb-cast-hit-dept">{hit.department}</span> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {tmdbPick ? (
            <div className="tmdb-cast-actions">
              {tmdbDetailLoading ? <p className="tmdb-cast-detail-status">상세 불러오는 중…</p> : null}
              {tmdbDetail ? (
                <>
                  <p className="tmdb-cast-detail-picked">
                    선택: <strong>{tmdbDetail.name}</strong> (TMDB #{tmdbDetail.id})
                  </p>
                  <div className="tmdb-cast-action-btns">
                    <button type="button" onClick={applyTmdbToSelected} disabled={!selected || tmdbDetailLoading}>
                      현재 인물에 반영
                    </button>
                    <button type="button" className="primary" onClick={appendCharacterFromTmdb} disabled={tmdbDetailLoading}>
                      새 인물 행으로 추가
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </div>

        {!selected ? (
          <p>인물을 선택하세요.</p>
        ) : (
          <>
            <h4 className="character-profile-title">{String(selected.name ?? "-")} · 인물 프로필</h4>
            <p className="character-profile-lead">능력치 테이블 대신 <strong>외형·성격·연출 프롬프트</strong>를 채워 두면, 생성형 AI·시나리오 도구가 같은 필드를 읽습니다.</p>
            <fieldset className="character-profile-fieldset">
              <legend className="character-profile-legend">식별</legend>
              <div className="detail-grid">
                <label>
                  이름
                  <input value={String(selected.name ?? "")} onChange={(e) => updateSelected("name", e.target.value)} />
                </label>
                <label>
                  id (시트 키)
                  <input value={String(selected.id ?? "")} onChange={(e) => updateSelected("id", e.target.value)} />
                </label>
                <label>
                  극본 대사 큐 (대문자)
                  <input
                    value={str(selected, "screenplayCueName")}
                    onChange={(e) => updateSelected("screenplayCueName", e.target.value)}
                    placeholder="비우면 이름을 대문자로 사용"
                  />
                </label>
                {selected.tmdbPersonId != null && Number(selected.tmdbPersonId) > 0 ? (
                  <label>
                    TMDB person id
                    <input readOnly value={String(selected.tmdbPersonId)} />
                  </label>
                ) : null}
                <label>
                  IMDb id (TMDB)
                  <input value={str(selected, "imdbId")} onChange={(e) => updateSelected("imdbId", e.target.value)} placeholder="nm0000158" />
                </label>
                {Number.isFinite(Number((selected as { tmdbGender?: unknown }).tmdbGender)) ? (
                  <label>
                    TMDB gender (0–3)
                    <input readOnly value={String(Number((selected as { tmdbGender?: unknown }).tmdbGender))} />
                  </label>
                ) : null}
                <label className="detail-span-2">
                  홈페이지 URL (TMDB)
                  <input value={str(selected, "homepage")} onChange={(e) => updateSelected("homepage", e.target.value)} placeholder="https://…" />
                </label>
                <label>
                  등급 (캐스팅·노출 가중치)
                  <select value={String(selected.rarity ?? "normal")} onChange={(e) => updateSelected("rarity", e.target.value)}>
                    {rarityOptions.map((rarity) => (
                      <option key={rarity} value={rarity}>
                        {rarity}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  역할 / 타입
                  <input value={String(selected.className ?? "")} onChange={(e) => updateSelected("className", e.target.value)} placeholder="예: 조연, 반신, 정보상" />
                </label>
                <label>
                  소속 · 세계관 위치
                  <input value={String(selected.nation ?? "")} onChange={(e) => updateSelected("nation", e.target.value)} placeholder="예: 북부 연합, 외딴 방송국" />
                </label>
                <label>
                  톤 / 질감 (원소 태그)
                  <select value={String(selected.element ?? "fire")} onChange={(e) => updateSelected("element", e.target.value)}>
                    {elementOptions.map((element) => (
                      <option key={element} value={element}>
                        {element}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </fieldset>

            <fieldset className="character-profile-fieldset">
              <legend className="character-profile-legend">시나리오 · 생성형 AI</legend>
              <div className="detail-grid">
                <label className="detail-span-2">
                  로그라인 / 한 줄 요약
                  <textarea
                    rows={2}
                    value={String(selected.description ?? "")}
                    onChange={(e) => updateSelected("description", e.target.value)}
                    placeholder="관객이 이 인물을 한 문장으로 기억하게 만드는 요약."
                  />
                </label>
                <label className="detail-span-2">
                  외형 (카메라·스틸용)
                  <textarea
                    rows={4}
                    value={str(selected, "appearance")}
                    onChange={(e) => updateSelected("appearance", e.target.value)}
                    placeholder="키, 체형, 헤어, 의상 실루엣, 특징적인 소품. 이미지/영상 프롬프트에 그대로 넣어도 되게."
                  />
                </label>
                <label className="detail-span-2">
                  성격 · 말투 · 관계
                  <textarea
                    rows={4}
                    value={str(selected, "personality")}
                    onChange={(e) => updateSelected("personality", e.target.value)}
                    placeholder="말버릇, 트라우마, 타인에게 대하는 방식, 갈등 씨앗."
                  />
                </label>
                <label className="detail-span-2">
                  연출·시나리오 통합 프롬프트
                  <textarea
                    rows={5}
                    value={str(selected, "generationPrompt")}
                    onChange={(e) => updateSelected("generationPrompt", e.target.value)}
                    placeholder="LLM/영상툴에 한 번에 넣을 블록: 누가, 어떤 욕망으로, 어떤 장소에서, 무엇을 원하는지."
                  />
                </label>
                <label className="detail-span-2">
                  시나리오 페이지 (한 줄 = 한 장)
                  <textarea
                    value={Array.isArray(selected.storyPages) ? selected.storyPages.map((line) => String(line)).join("\n") : ""}
                    onChange={(e) => updateSelected("storyPages", e.target.value.split("\n").map((line) => line.trim()).filter(Boolean))}
                    placeholder="씬별 지문·대사 메모"
                  />
                </label>
                <SkillIdsEditor
                  label="연출 블록 (시트 id, 레거리 스킬 슬롯)"
                  value={selectedSkillIds}
                  skillOptions={skillOptions}
                  onChange={(next) => updateSelected("skillIds", next)}
                />
                <label>
                  maxPages
                  <input type="number" value={String(selected.maxPages ?? "")} onChange={(e) => updateSelected("maxPages", Number(e.target.value || 0))} />
                </label>
              </div>
            </fieldset>

            <details className="character-profile-legacy">
              <summary>레거시 수치 (게임 엔진 호환)</summary>
              <p className="character-profile-legacy-hint">에디터 테이블·터미널 데모에서만 쓰입니다. 인물 프로필 작성에는 필수 아님.</p>
              <div className="detail-grid">
                {["str", "agi", "luk", "intel", "atk", "hp"].map((field) => (
                  <label key={field}>
                    {field}
                    <input value={String(selected[field] ?? "")} onChange={(e) => updateSelected(field, Number(e.target.value || 0))} />
                  </label>
                ))}
              </div>
            </details>
          </>
        )}
      </section>
    </div>
  );
};
