/**
 * API base URL.
 * - Vercel(루트 배포): `api/[[...slug]].js` → 동일 출처 **`/api`**
 * - 로컬: Vite가 `/api`·`/_/backend`를 백엔드(기본 4000)로 프록시
 */
export function getApiBaseUrl(): string {
  const explicit = import.meta.env.VITE_API_BASE_URL;
  if (typeof explicit === "string" && explicit.trim() !== "") {
    return explicit.trim();
  }
  return "/api";
}
