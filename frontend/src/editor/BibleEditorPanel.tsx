import axios from "axios";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getApiBaseUrl } from "../apiBase";
import { formatApiFailure } from "../apiErrors";
import { MarkdownPreview } from "./MarkdownPreview";
import { DOC_CATEGORY_ORDER, groupDocFilesByCategory, normalizeDocFileRow, type DocFileRow } from "./docs/docCategories";

type BibleDocMode = "edit" | "view";

const publicAssetsBase = (): string => {
  const base = import.meta.env.BASE_URL ?? "/";
  return base.endsWith("/") ? base : `${base}/`;
};

/** API·manifest 깨졌을 때 최후 폴백 (백엔드 whitelist와 동일) */
const BIBLE_STATIC_FALLBACK: DocFileRow[] = [
  normalizeDocFileRow({ name: "00-world-bible.md", label: "World Bible", category: "settings" })!,
  normalizeDocFileRow({ name: "01-factions.md", label: "Factions", category: "orgs" })!,
  normalizeDocFileRow({ name: "02-content-standards.md", label: "Content standards", category: "settings" })!,
  normalizeDocFileRow({ name: "03-tone-and-taboos.md", label: "Tone & taboos", category: "settings" })!
];

async function fetchStaticManifestAndFiles(base: string): Promise<DocFileRow[]> {
  const manUrl = `${base}bible-manifest.json`;
  try {
    const r = await fetch(manUrl);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const rows = Array.isArray(data?.files) ? data.files : [];
    const normalized: DocFileRow[] = [];
    for (const row of rows) {
      const doc = normalizeDocFileRow(row as { name?: unknown; label?: unknown; category?: unknown });
      if (doc) normalized.push(doc);
    }
    if (normalized.length > 0) return normalized.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    /* use hardcoded fallback */
  }
  return [...BIBLE_STATIC_FALLBACK];
}

export const BibleEditorPanel = () => {
  const api = useMemo(
    () => axios.create({ baseURL: getApiBaseUrl(), timeout: 25_000 }),
    []
  );

  const [files, setFiles] = useState<DocFileRow[]>([]);
  const [source, setSource] = useState<"api" | "static" | null>(null);
  const [selected, setSelected] = useState("");
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [banner, setBanner] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [docMode, setDocMode] = useState<BibleDocMode>("edit");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setError("");
      setLoadingList(true);
      setSource(null);
      setBanner("");
      const baseHint = `${getApiBaseUrl().replace(/\/?$/, "")}/editor/bible`;

      try {
        const { data } = await api.get<{ files?: unknown[] }>("/editor/bible");
        if (cancelled) return;
        const list = Array.isArray(data?.files)
          ? (data.files.map((f) => normalizeDocFileRow(f as { name?: unknown; label?: unknown; category?: unknown })).filter(Boolean) as DocFileRow[])
          : [];
        setFiles(list);
        setSource("api");
        setBanner("");
        setError("");
        setStatus("[SYS] World Bible 목록 (API)");
        setSelected((prev) => {
          if (prev && list.some((x) => x.name === prev)) return prev;
          return list[0]?.name ?? "";
        });
      } catch (err) {
        if (!cancelled) {
          const netLines = formatApiFailure(err, baseHint).join("\n");
          console.warn("[BibleEditorPanel] API 목록 실패 → 정적 폴백\n", netLines);

          try {
            const pb = publicAssetsBase();
            const staticList = await fetchStaticManifestAndFiles(pb);
            if (cancelled) return;
            setFiles(staticList);
            setSource("static");
            setBanner(
              `${netLines}\n[INFO] API 불가 시 빌드에 포함된 Mythic 폴더만 읽습니다. 편집·저장은 백엔드(/api)·로컬이 필요합니다.`
            );
            setError("");
            setStatus("[SYS] World Bible 목록 (정적 파일 폴백)");
            setSelected((prev) => {
              if (prev && staticList.some((x) => x.name === prev)) return prev;
              return staticList[0]?.name ?? "";
            });
          } catch (fe) {
            if (!cancelled) {
              setBanner("");
              setFiles([]);
              setSource(null);
              setError(`${netLines}\n[ERR] 정적 폴백 로드 실패: ${fe instanceof Error ? fe.message : String(fe)}`);
            }
          }
        }
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const loadFile = useCallback(
    async (name: string) => {
      if (!name) return;
      setError("");
      setStatus("");
      const src = source;
      try {
        if (src === "api") {
          const { data } = await api.get<{ name?: string; content?: string }>(
            `/editor/bible/${encodeURIComponent(name)}`
          );
          const text = typeof data?.content === "string" ? data.content : "";
          setContent(text);
          setDirty(false);
          setStatus(`[SYS] 로드(API): ${data?.name ?? name}`);
          return;
        }
        const pb = publicAssetsBase();
        const url = `${pb}mythic-archive/${encodeURIComponent(name)}`;
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`폴백 HTTP ${res.status} ${url}`);
        }
        setContent(await res.text());
        setDirty(false);
        setStatus(`[SYS] 로드(정적): ${name}`);
      } catch (err) {
        const msg =
          src === "api"
            ? formatApiFailure(err, `/editor/bible/${name}`).join("\n")
            : err instanceof Error
              ? err.message
              : String(err);
        setError(msg);
        setContent("");
      }
    },
    [api, source]
  );

  useEffect(() => {
    if (!selected || loadingList || source === null) return;
    const id = window.setTimeout(() => {
      void loadFile(selected);
    }, 0);
    return () => window.clearTimeout(id);
  }, [selected, loadingList, source, loadFile]);

  const saveFile = async () => {
    if (!selected || source !== "api") {
      setError("저장은 API가 살아 있을 때만 가능합니다(Vercel /tmp 또는 로컬 파일). 정적 폴백에서는 읽기만 됩니다.");
      return;
    }
    setStatus("");
    try {
      await api.put(`/editor/bible/${encodeURIComponent(selected)}`, { content });
      setDirty(false);
      setStatus(`[SYS] 저장됨(API): ${selected}`);
    } catch (err) {
      setError(formatApiFailure(err, `PUT /editor/bible/${selected}`).join("\n"));
    }
  };

  const onSelectFile = (name: string) => {
    if (dirty) {
      const ok = window.confirm("저장하지 않은 변경이 있습니다. 다른 파일로 전환할까요?");
      if (!ok) return;
    }
    setSelected(name);
  };

  const readOnlyHint =
    source === "static"
      ? "읽기 전용 폴백: `npm run dev` 또는 배포 환경에서 `/api`(백엔드)·DB가 필요하면 Neon/ Supabase 등을 연결하세요."
      : "백엔드는 전통적인 SQL DB가 없습니다. 시트는 `sheets.json`/`/tmp`, 바이블은 `docs/mythic-archive` 기준입니다(Vercel에선 비영속).";

  return (
    <div className="bible-editor-layout">
      <aside className="bible-file-sidebar">
        <div className="bible-sidebar-head">문서 목록 (카테고리)</div>
        <div className="bible-file-list">
          {loadingList ? (
            <p className="bible-sidebar-empty">로딩 중…</p>
          ) : files.length === 0 ? (
            <p className="bible-sidebar-empty">파일 없음</p>
          ) : (
            (() => {
              const grouped = groupDocFilesByCategory(files);
              return DOC_CATEGORY_ORDER.map((cat) => {
                const rows = grouped[cat.id];
                return (
                  <div key={cat.id} className="bible-doc-category">
                    <div className="bible-doc-category-head" title={cat.hint}>
                      {cat.label}
                    </div>
                    {rows.length === 0 ? (
                      <p className="bible-sidebar-empty bible-sidebar-empty--nested">문서 없음</p>
                    ) : (
                      rows.map((f) => (
                        <button
                          key={f.name}
                          type="button"
                          className={`bible-file-row ${selected === f.name ? "active" : ""}`}
                          onClick={() => onSelectFile(f.name)}
                        >
                          <span className="bible-file-label">{f.label}</span>
                          <small>{f.name}</small>
                        </button>
                      ))
                    )}
                  </div>
                );
              });
            })()
          )}
        </div>
      </aside>
      <section className="bible-editor-main">
        <div className="bible-toolbar">
          <div className="bible-toolbar-title">
            <span className="sheet-profile-badge">DOCS</span>
            <span className="bible-current-file">{selected || "—"}</span>
            {source === "api" && <small className="bible-source-pill api">API</small>}
            {source === "static" && <small className="bible-source-pill static">정적폴백</small>}
          </div>
          <div className="bible-toolbar-actions">
            <div className="bible-mode-switch" role="tablist" aria-label="문서 표시 모드">
              <button
                type="button"
                role="tab"
                aria-selected={docMode === "edit"}
                className={`bible-mode-btn ${docMode === "edit" ? "active" : ""}`}
                onClick={() => setDocMode("edit")}
              >
                편집
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={docMode === "view"}
                className={`bible-mode-btn ${docMode === "view" ? "active" : ""}`}
                onClick={() => setDocMode("view")}
              >
                보기
              </button>
            </div>
            <button type="button" onClick={() => void loadFile(selected)} disabled={!selected || source === null}>
              reload file
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => void saveFile()}
              disabled={!dirty || !selected || source !== "api"}
              title={source !== "api" ? "API 연결 시에만 저장 가능" : undefined}
            >
              save bible
            </button>
          </div>
        </div>
        <p className="bible-hint">
          Mythic Archive 마크다운. {readOnlyHint}
          {docMode === "edit" ? " 편집 모드: 원문만 표시됩니다." : " 보기 모드: 렌더링된 미리보기만 표시됩니다. 수정은 편집으로 전환하세요."}
        </p>
        {docMode === "edit" ? (
          <textarea
            className="bible-textarea"
            spellCheck={false}
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setDirty(true);
            }}
            placeholder={loadingList || source === null ? "로딩 중…" : "내용이 여기에 표시됩니다."}
            data-llm-key={selected ? `docs:bible:${selected}:markdown` : undefined}
          />
        ) : (
          <MarkdownPreview markdown={content} className="bible-markdown-preview" emptyMessage="이 파일에 표시할 마크다운이 없습니다." />
        )}
        {banner ? <pre className="preview bible-banner-preview">{banner}</pre> : null}
        {error ? <pre className="preview error-preview">{error}</pre> : null}
        {status ? <pre className="preview bible-status-preview">{status}</pre> : null}
      </section>
    </div>
  );
};
