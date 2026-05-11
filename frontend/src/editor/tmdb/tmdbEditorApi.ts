import axios from "axios";
import { getApiBaseUrl } from "../../apiBase";

export type TmdbPersonSearchHit = {
  id: number;
  name: string;
  profileUrl: string | null;
  department: string | null;
  knownForSummary: string;
};

export type TmdbPersonDetail = {
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

const client = () =>
  axios.create({
    baseURL: getApiBaseUrl(),
    timeout: 20_000
  });

export async function searchTmdbPersons(q: string, page = 1): Promise<TmdbPersonSearchHit[]> {
  const { data } = await client().get<{ results: TmdbPersonSearchHit[] }>("/editor/tmdb/person-search", {
    params: { q, page }
  });
  return Array.isArray(data.results) ? data.results : [];
}

export async function fetchTmdbPerson(id: number): Promise<TmdbPersonDetail> {
  const { data } = await client().get<TmdbPersonDetail>(`/editor/tmdb/person/${id}`);
  return data;
}

export function formatTmdbApiError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const msg = (err.response?.data as { error?: { message?: string } })?.error?.message;
    if (typeof msg === "string") return msg;
    if (err.message) return err.message;
  }
  if (err instanceof Error) return err.message;
  return "요청에 실패했습니다.";
}
