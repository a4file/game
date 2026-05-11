import { useEffect, useState } from "react";
import { fetchTmdbPerson, formatTmdbApiError, searchTmdbPersons, type TmdbPersonDetail, type TmdbPersonSearchHit } from "./tmdbEditorApi";
import { characterRowFromTmdbDetail } from "./tmdbCharacterMap";

interface Props {
  existingCharacterRows: Array<{ id?: unknown }>;
  onAppend: (row: Record<string, unknown>, options: { castToStory: boolean }) => void;
}

/** 캐스팅보드(PERSON)에서 TMDB 검색 → 시트 추가 / 스토리 캐스팅 */
export const TmdbCastingPanel = ({ existingCharacterRows, onAppend }: Props) => {
  const [tmdbQ, setTmdbQ] = useState("");
  const [tmdbHits, setTmdbHits] = useState<TmdbPersonSearchHit[]>([]);
  const [tmdbLoading, setTmdbLoading] = useState(false);
  const [tmdbErr, setTmdbErr] = useState("");
  const [tmdbPick, setTmdbPick] = useState<TmdbPersonSearchHit | null>(null);
  const [tmdbDetail, setTmdbDetail] = useState<TmdbPersonDetail | null>(null);
  const [tmdbDetailLoading, setTmdbDetailLoading] = useState(false);

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

  const commit = (castToStory: boolean) => {
    if (!tmdbDetail) return;
    const row = characterRowFromTmdbDetail(tmdbDetail, existingCharacterRows);
    onAppend(row, { castToStory });
    setTmdbPick(null);
    setTmdbDetail(null);
    setTmdbHits([]);
    setTmdbQ("");
  };

  return (
    <div className="tmdb-cast-panel tmdb-cast-panel--casting-board">
      <div className="tmdb-cast-panel-head">
        <h4 className="tmdb-cast-panel-title">TMDB로 인물 추가</h4>
        <p className="tmdb-cast-panel-lead">
          검색 후 <strong>시트에만 추가</strong>하거나, <strong>시트 + 이 스토리 캐스팅</strong>을 한 번에 할 수 있습니다. 수동 연결만 하려면 SYSTEM → 인물에서 편집하세요.
        </p>
      </div>
      <div className="tmdb-cast-search-row">
        <input
          className="tmdb-cast-search-input"
          value={tmdbQ}
          onChange={(e) => setTmdbQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void runTmdbSearch();
          }}
          placeholder="배우 이름"
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
                선택: <strong>{tmdbDetail.name}</strong> (TMDB #{tmdbDetail.id}) → 새 시트 id는 <code>c-tmdb-…</code> 형식이며, 같은 TMDB id가 이미 있으면 접미가 붙습니다.
              </p>
              <div className="tmdb-cast-action-btns tmdb-cast-action-btns--stack">
                <button type="button" onClick={() => commit(false)} disabled={tmdbDetailLoading}>
                  인물 시트에만 추가
                </button>
                <button type="button" className="primary" onClick={() => commit(true)} disabled={tmdbDetailLoading}>
                  시트 추가 + 이 스토리에 캐스팅
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
