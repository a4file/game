/**
 * API base URL.
 * - Vercel experimental services default: `/_/backend`
 * - 로컬 개발도 동일 prefix 사용(프록시가 4000으로 전달)
 */
export function getApiBaseUrl(): string {
  const explicit = import.meta.env.VITE_API_BASE_URL;
  if (typeof explicit === "string" && explicit.trim() !== "") {
    return explicit.trim();
  }
  return "/_/backend";
}
