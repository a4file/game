import type { TmdbPersonDetail } from "./tmdbEditorApi";

/** TMDB Person Details + images 응답 → 인물 시트 행에 넣을 필드 (id 제외) */
export function buildTmdbCharacterPatch(detail: TmdbPersonDetail): Record<string, unknown> {
  const bio = detail.biography.replace(/\s+/g, " ").trim();
  const bioShort = bio.length > 320 ? `${bio.slice(0, 317)}…` : bio;

  const metaLines = [
    detail.department ? `유형/부서: ${detail.department}` : "",
    detail.genderLabel ? `성별(레퍼런스): ${detail.genderLabel}` : "",
    detail.placeOfBirth ? `출생·활동지: ${detail.placeOfBirth}` : "",
    detail.birthday ? `생일: ${detail.birthday}` : "",
    detail.deathday ? `사망: ${detail.deathday}` : "",
    detail.imdbId ? `IMDb: ${detail.imdbId}` : "",
    detail.homepage ? `공식·홈페이지: ${detail.homepage}` : "",
    detail.popularity != null && Number.isFinite(detail.popularity) ? `TMDB popularity: ${detail.popularity}` : "",
    detail.adult ? "TMDB adult 플래그: true (성인 항목)" : ""
  ].filter(Boolean);

  const aka = detail.alsoKnownAs.slice(0, 8).filter(Boolean).join(", ");

  const stillLines = [
    detail.profileUrl ? `대표 프로필 스틸 (w500): ${detail.profileUrl}` : "",
    detail.profileImageUrls.length > 0
      ? `추가 프로필 스틸 (TMDB images, 상위 ${detail.profileImageUrls.length}장):\n${detail.profileImageUrls.join("\n")}`
      : ""
  ]
    .filter(Boolean)
    .join("\n\n");

  const appearance = [stillLines, bioShort ? `바이오그래피 요약: ${bioShort}` : ""].filter(Boolean).join("\n\n\n");

  const personality = [
    metaLines.join("\n"),
    aka ? `다른 표기: ${aka}` : "",
    detail.knownForSummary ? `작품 크레딧 일부: ${detail.knownForSummary}` : ""
  ]
    .filter(Boolean)
    .join("\n\n");

  const generationPrompt = [
    `실존 배우 레퍼런스 — TMDB person id ${detail.id} (${detail.name}).`,
    detail.genderLabel ? `성별 레퍼런스: ${detail.genderLabel}.` : "",
    detail.imdbId ? `IMDb: ${detail.imdbId}.` : "",
    "기존 작품의 연기 톤·스틸을 참고하되, 본작 세계관·서사에 맞게 재해석할 것.",
    bioShort ? `바이오 요약: ${bioShort}` : ""
  ].join("\n");

  const patch: Record<string, unknown> = {
    name: detail.name,
    description: bioShort || `TMDB 인물 ${detail.name} (id ${detail.id})`,
    appearance,
    personality,
    generationPrompt,
    className: "Actor",
    tmdbPersonId: detail.id,
    tmdbGender: detail.gender
  };

  if (detail.imdbId?.trim()) patch.imdbId = detail.imdbId.trim();
  if (detail.homepage?.trim()) patch.homepage = detail.homepage.trim();
  if (detail.placeOfBirth?.trim()) patch.nation = detail.placeOfBirth.trim();

  return patch;
}

export function newCharacterIdForTmdb(existingRows: Array<{ id?: unknown }>, personId: number): string {
  const ids = new Set(existingRows.map((r) => String(r.id ?? "")));
  const base = `c-tmdb-${personId}`;
  if (!ids.has(base)) return base;
  return `c-tmdb-${personId}-${Date.now()}`;
}

export function emptyCharacterSheetRow(id: string): Record<string, unknown> {
  return {
    id,
    name: "",
    description: "",
    appearance: "",
    personality: "",
    generationPrompt: "",
    rarity: "normal",
    className: "",
    nation: "",
    element: "fire",
    str: 10,
    agi: 10,
    luk: 10,
    intel: 10,
    atk: 10,
    hp: 100,
    skillIds: [],
    level: 1,
    currentPage: 1,
    maxPages: 99,
    storyPages: [],
    awaken: 0
  };
}

/** TMDB 상세 한 건으로 번들용 인물 행 전체 생성 */
export function characterRowFromTmdbDetail(detail: TmdbPersonDetail, existingRows: Array<{ id?: unknown }>): Record<string, unknown> {
  const id = newCharacterIdForTmdb(existingRows, detail.id);
  return { ...emptyCharacterSheetRow(id), ...buildTmdbCharacterPatch(detail) };
}
