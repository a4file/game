import axios from "axios";

/** Human-readable API failure lines for terminal + console */
export function formatApiFailure(err: unknown, requestLabel: string): string[] {
  const prefix = `[NET]`;
  const lines = [`${prefix} 요청 실패: ${requestLabel}`];
  if (axios.isAxiosError(err)) {
    const code = err.code;
    const msg = err.message;
    const status = err.response?.status;
    let serverMsg: string | undefined;
    const d = err.response?.data;
    if (d && typeof d === "object" && "error" in d) {
      const inner = (d as { error: unknown }).error;
      serverMsg =
        typeof inner === "string"
          ? inner
          : inner && typeof inner === "object" && "message" in inner
            ? String((inner as { message: unknown }).message)
            : JSON.stringify(inner);
    }
    if (code === "ECONNABORTED" || code === "ETIMEDOUT") {
      lines.push(`${prefix} 타임아웃 또는 응답 지연 (${code ?? "timeout"})`);
    } else if (code === "ERR_NETWORK") {
      lines.push(`${prefix} 네트워크 오류(서버 꺼짐·CORS·잘못된 URL)·오프라인 가능`);
    } else if (typeof status === "number") {
      lines.push(`${prefix} HTTP ${status} ${err.response?.statusText ?? ""}`.trim());
    } else {
      lines.push(`${prefix} Axios: ${msg}`);
    }
    if (serverMsg) lines.push(`${prefix} 서버: ${serverMsg.slice(0, 200)}`);
    return lines;
  }
  if (err instanceof Error) {
    lines.push(`${prefix} ${err.name}: ${err.message}`);
    return lines;
  }
  lines.push(`${prefix} 알 수 없는 오류`);
  return lines;
}

export function formatFetchFailure(status: number, statusText: string, urlLabel: string): string[] {
  const prefix = `[NET]`;
  return [`${prefix} 요청 실패: ${urlLabel}`, `${prefix} HTTP ${status} ${statusText}`.trim()];
}
