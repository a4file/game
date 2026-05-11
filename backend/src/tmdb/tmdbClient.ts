import axios from "axios";

const TMDB_BASE = "https://api.themoviedb.org/3";
const PROFILE_STILL_SIZE = "w500";
const PROFILE_THUMB_SIZE = "w185";
const MAX_PROFILE_STILLS = 8;

const readToken = (): string | undefined => process.env.TMDB_READ_ACCESS_TOKEN?.trim() || undefined;

const apiKeyValue = (): string | undefined => process.env.TMDB_API_KEY?.trim() || undefined;

/** v3 API Key 또는 읽기 전용 Access Token 중 하나라도 있으면 true */
export const hasTmdbApiKey = (): boolean => Boolean(readToken() || apiKeyValue());

const tmdbAuthHeaders = (): Record<string, string> | undefined => {
  const token = readToken();
  if (token) return { Authorization: `Bearer ${token}` };
  return undefined;
};

const withOptionalHeaders = (base: { params: Record<string, unknown>; timeout: number; validateStatus: () => boolean }) => {
  const h = tmdbAuthHeaders();
  return h ? { ...base, headers: h } : base;
};

/** Bearer 토큰만 쓸 때는 api_key 쿼리를 생략합니다. */
const tmdbQueryKeyParams = (): Record<string, string> => {
  const key = apiKeyValue();
  return key ? { api_key: key } : {};
};

const assertTmdbConfigured = (): void => {
  if (!hasTmdbApiKey()) throw new Error("TMDB_API_KEY or TMDB_READ_ACCESS_TOKEN is not set");
};

const stillUrl = (size: string, profilePath: string | null): string | null => {
  if (!profilePath) return null;
  return `https://image.tmdb.org/t/p/${size}${profilePath}`;
};

const genderLabelKo = (code: unknown): { gender: number; genderLabel: string } => {
  const n = typeof code === "number" ? code : Number(code);
  const g = Number.isFinite(n) ? Math.trunc(n) : 0;
  const labels: Record<number, string> = {
    0: "미설정",
    1: "여성",
    2: "남성",
    3: "논바이너리"
  };
  return { gender: g, genderLabel: labels[g] ?? "미설정" };
};

export type TmdbPersonSearchHit = {
  id: number;
  name: string;
  profileUrl: string | null;
  department: string | null;
  knownForSummary: string;
};

const knownForSummary = (items: unknown): string => {
  if (!Array.isArray(items)) return "";
  const titles: string[] = [];
  for (const raw of items.slice(0, 6)) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const t = o.title ?? o.name;
    if (typeof t === "string" && t.trim()) titles.push(t.trim());
  }
  return titles.join(" · ");
};

const mapSearchHit = (raw: Record<string, unknown>): TmdbPersonSearchHit | null => {
  const id = Number(raw.id);
  if (!Number.isFinite(id)) return null;
  const name = typeof raw.name === "string" ? raw.name : "";
  const profile_path = raw.profile_path == null ? null : String(raw.profile_path);
  const department = raw.known_for_department == null ? null : String(raw.known_for_department);
  return {
    id,
    name: name || `person-${id}`,
    profileUrl: stillUrl(PROFILE_THUMB_SIZE, profile_path),
    department,
    knownForSummary: knownForSummary(raw.known_for)
  };
};

export async function tmdbSearchPersons(query: string, page = 1): Promise<{ results: TmdbPersonSearchHit[]; page: number; totalResults: number }> {
  assertTmdbConfigured();
  const { status, data: raw } = await axios.get(
    `${TMDB_BASE}/search/person`,
    withOptionalHeaders({
      params: {
        ...tmdbQueryKeyParams(),
        query: query.trim(),
        page,
        include_adult: false,
        language: "ko-KR"
      },
      timeout: 15_000,
      validateStatus: () => true
    })
  );
  const data = raw as Record<string, unknown>;

  if (status === 401 || status === 403) {
    throw new Error("TMDB rejected credentials (check TMDB_READ_ACCESS_TOKEN / TMDB_API_KEY).");
  }
  if (status !== 200) {
    throw new Error(typeof data.status_message === "string" ? data.status_message : `TMDB HTTP ${status}`);
  }

  if (typeof data.status_code === "number" && data.status_message) {
    throw new Error(String(data.status_message));
  }

  const rawResults = Array.isArray(data.results) ? (data.results as unknown[]) : [];
  const results = rawResults
    .map((r: unknown) => (r && typeof r === "object" ? mapSearchHit(r as Record<string, unknown>) : null))
    .filter((x: TmdbPersonSearchHit | null): x is TmdbPersonSearchHit => x != null)
    .slice(0, 20);

  const total = typeof data.total_results === "number" ? data.total_results : results.length;
  const pg = typeof data.page === "number" ? data.page : page;

  return { results, page: pg, totalResults: total };
}

export type TmdbPersonDetailPayload = {
  id: number;
  name: string;
  biography: string;
  birthday: string | null;
  deathday: string | null;
  placeOfBirth: string | null;
  alsoKnownAs: string[];
  profileUrl: string | null;
  profileImageUrls: string[];
  department: string | null;
  knownForSummary: string;
  gender: number;
  genderLabel: string;
  imdbId: string | null;
  homepage: string | null;
  popularity: number | null;
  adult: boolean;
};

const extractProfilesFromPersonPayload = (data: Record<string, unknown>): Array<Record<string, unknown>> => {
  const images = data.images;
  if (!images || typeof images !== "object") return [];
  const prof = (images as Record<string, unknown>).profiles;
  return Array.isArray(prof) ? (prof as Array<Record<string, unknown>>) : [];
};

const rankedProfileUrls = (profiles: Array<Record<string, unknown>>, limit: number): string[] => {
  const sorted = [...profiles].sort((a, b) => {
    const va = Number(a.vote_average) || 0;
    const vb = Number(b.vote_average) || 0;
    if (vb !== va) return vb - va;
    const ca = Number(a.vote_count) || 0;
    const cb = Number(b.vote_count) || 0;
    return cb - ca;
  });
  const urls: string[] = [];
  for (const p of sorted) {
    const fp = p.file_path;
    if (typeof fp !== "string" || !fp.startsWith("/")) continue;
    const u = stillUrl(PROFILE_STILL_SIZE, fp);
    if (u && !urls.includes(u)) urls.push(u);
    if (urls.length >= limit) break;
  }
  return urls;
};

async function tmdbFetchPersonImagesProfiles(personId: number): Promise<Array<Record<string, unknown>>> {
  const { status, data: raw } = await axios.get(
    `${TMDB_BASE}/person/${personId}/images`,
    withOptionalHeaders({
      params: { ...tmdbQueryKeyParams() },
      timeout: 15_000,
      validateStatus: () => true
    })
  );
  if (status !== 200) return [];
  const data = raw as Record<string, unknown>;
  const prof = data.profiles;
  return Array.isArray(prof) ? (prof as Array<Record<string, unknown>>) : [];
}

export async function tmdbGetPerson(personId: number): Promise<TmdbPersonDetailPayload> {
  assertTmdbConfigured();
  const { status, data: raw } = await axios.get(
    `${TMDB_BASE}/person/${personId}`,
    withOptionalHeaders({
      params: {
        ...tmdbQueryKeyParams(),
        language: "ko-KR",
        append_to_response: "combined_credits,images"
      },
      timeout: 20_000,
      validateStatus: () => true
    })
  );
  const data = raw as Record<string, unknown>;

  if (status === 401 || status === 403) {
    throw new Error("TMDB rejected credentials (check TMDB_READ_ACCESS_TOKEN / TMDB_API_KEY).");
  }
  if (status === 404) {
    throw new Error("TMDB person not found.");
  }
  if (status !== 200) {
    throw new Error(typeof data.status_message === "string" ? data.status_message : `TMDB HTTP ${status}`);
  }

  if (typeof data.status_code === "number" && data.status_message) {
    throw new Error(String(data.status_message));
  }

  const combined = data.combined_credits as Record<string, unknown> | undefined;
  const cast = combined && Array.isArray(combined.cast) ? combined.cast : [];
  const crew = combined && Array.isArray(combined.crew) ? combined.crew : [];
  const creditTitles: string[] = [];
  for (const entry of [...cast, ...crew].slice(0, 12)) {
    if (!entry || typeof entry !== "object") continue;
    const o = entry as Record<string, unknown>;
    const t = o.title ?? o.name;
    if (typeof t === "string" && t.trim()) creditTitles.push(t.trim());
  }
  const creditLine = [...new Set(creditTitles)].slice(0, 8).join(" · ");

  const aka = Array.isArray(data.also_known_as) ? (data.also_known_as as unknown[]).map((s) => String(s)).filter(Boolean) : [];

  const profile_path = data.profile_path == null ? null : String(data.profile_path);
  const mainStill = stillUrl(PROFILE_STILL_SIZE, profile_path);

  let profiles = extractProfilesFromPersonPayload(data);
  if (profiles.length === 0) {
    profiles = await tmdbFetchPersonImagesProfiles(personId);
  }

  let profileImageUrls = rankedProfileUrls(profiles, MAX_PROFILE_STILLS);
  if (mainStill && !profileImageUrls.includes(mainStill)) {
    profileImageUrls = [mainStill, ...profileImageUrls].slice(0, MAX_PROFILE_STILLS);
  }
  if (profileImageUrls.length === 0 && mainStill) {
    profileImageUrls = [mainStill];
  }

  const { gender, genderLabel } = genderLabelKo(data.gender);

  const imdbRaw = data.imdb_id;
  const imdbId = imdbRaw == null || imdbRaw === "" ? null : String(imdbRaw);

  const homeRaw = data.homepage;
  const homepage = typeof homeRaw === "string" && homeRaw.trim() ? homeRaw.trim() : null;

  const popRaw = data.popularity;
  const popularity = typeof popRaw === "number" && Number.isFinite(popRaw) ? popRaw : typeof popRaw === "string" ? Number(popRaw) : null;

  const adult = Boolean(data.adult);

  const deathday = data.deathday == null || data.deathday === "" ? null : String(data.deathday);

  return {
    id: Number(data.id),
    name: typeof data.name === "string" ? data.name : `person-${personId}`,
    biography: typeof data.biography === "string" ? data.biography : "",
    birthday: data.birthday == null || data.birthday === "" ? null : String(data.birthday),
    deathday,
    placeOfBirth: data.place_of_birth == null || data.place_of_birth === "" ? null : String(data.place_of_birth),
    alsoKnownAs: aka,
    profileUrl: mainStill,
    profileImageUrls,
    department: data.known_for_department == null ? null : String(data.known_for_department),
    knownForSummary: creditLine,
    gender,
    genderLabel,
    imdbId,
    homepage,
    popularity: popularity != null && Number.isFinite(popularity) ? popularity : null,
    adult
  };
}
