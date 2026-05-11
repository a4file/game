import { useEffect } from "react";
import { useRpgStore } from "../rpg/store";
import { AdminEditorShell } from "../editor/AdminEditorShell";

/** 터미널·퀵액션·상단 게임 헤더 없이 시트 에디터만 표시합니다. */
export const TerminalShell = () => {
  const bundle = useRpgStore((s) => s.bundle);
  const loadBundle = useRpgStore((s) => s.loadBundle);
  const setBundle = useRpgStore((s) => s.setBundle);
  const bundleConnection = useRpgStore((s) => s.bundleConnection);

  useEffect(() => {
    void loadBundle();
  }, [loadBundle]);

  return (
    <div className="editor-app-root">
      {bundle ? (
        <AdminEditorShell bundle={bundle} onUpdateBundle={setBundle} />
      ) : (
        <section className="editor-app-placeholder" aria-live="polite">
          <h1 className="editor-app-placeholder-title">시트 에디터</h1>
          <p className="editor-app-placeholder-lead">
            번들을 불러오는 중이거나 API에 연결되지 않았습니다. 환경 변수 <code>VITE_API_BASE_URL</code>과 백엔드가 동작하는지 확인한 뒤 페이지를 새로고침하세요.
          </p>
          <p className="editor-app-placeholder-meta">
            마지막 로드: {bundleConnection.atMs ? new Date(bundleConnection.atMs).toLocaleString() : "—"} · ok:{" "}
            {bundleConnection.ok ? "yes" : "no"} · source: {bundleConnection.source ?? "none"}
          </p>
          {bundleConnection.lines.length > 0 && (
            <pre className="editor-app-placeholder-log">{bundleConnection.lines.slice(-12).join("\n")}</pre>
          )}
        </section>
      )}
    </div>
  );
};
