/** API origin. Dev: 빈 문자열 → Vite 프록시로 동일 출처 요청(IPv6 localhost 이슈 회피). */
export function getApiBaseUrl(): string {
  const explicit = import.meta.env.VITE_API_BASE_URL;
  if (typeof explicit === "string" && explicit.trim() !== "") {
    return explicit.trim();
  }
  if (import.meta.env.DEV) {
    return "";
  }
  /** Vercel (and same-origin static hosts): Express lives under `/api/*`. */
  return "/api";
}
