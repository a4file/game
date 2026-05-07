import axios from "axios";
import { useEffect, useMemo, useState } from "react";
import { getApiBaseUrl } from "../apiBase";

const apiTargetHint = () => {
  const base = getApiBaseUrl();
  return base === "" ? "Vite 프록시 → 127.0.0.1:4000" : base;
};

export const BibleEditorPanel = () => {
  const api = useMemo(() => axios.create({ baseURL: getApiBaseUrl() }), []);
  const [files, setFiles] = useState<Array<{ name: string; label: string }>>([]);
  const [selected, setSelected] = useState("");
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loadingList, setLoadingList] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setError("");
      setLoadingList(true);
      try {
        const { data } = await api.get<{ files: Array<{ name: string; label: string }> }>("/editor/bible");
        if (cancelled) return;
        setFiles(data.files);
        if (data.files[0] && !selected) {
          setSelected(data.files[0].name);
        }
        setStatus("[SYS] bible file list loaded");
      } catch (err) {
        if (!cancelled) {
          const ax = axios.isAxiosError(err);
          const detail = ax
            ? `${err.code ?? err.message}${err.response ? ` (HTTP ${err.response.status})` : ""}`
            : err instanceof Error
              ? err.message
              : String(err);
          setError(
            `바이블 목록을 불러오지 못했습니다. 백엔드(${apiTargetHint()})가 :4000에서 실행 중인지 확인하세요.\n${detail}`
          );
        }
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  const loadFile = async (name: string) => {
    if (!name) return;
    setError("");
    setStatus("");
    try {
      const { data } = await api.get<{ name: string; content: string }>(
        `/editor/bible/${encodeURIComponent(name)}`
      );
      setContent(data.content);
      setDirty(false);
      setStatus(`[SYS] loaded ${data.name}`);
    } catch {
      setError(`파일을 불러오지 못했습니다: ${name}`);
    }
  };

  useEffect(() => {
    if (!selected || loadingList) return;
    void loadFile(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, loadingList]);

  const saveFile = async () => {
    if (!selected) return;
    setError("");
    setStatus("");
    try {
      await api.put(`/editor/bible/${encodeURIComponent(selected)}`, { content });
      setDirty(false);
      setStatus(`[SYS] saved ${selected}`);
    } catch {
      setError("저장에 실패했습니다.");
    }
  };

  const onSelectFile = (name: string) => {
    if (dirty) {
      const ok = window.confirm("저장하지 않은 변경이 있습니다. 다른 파일로 전환할까요?");
      if (!ok) return;
    }
    setSelected(name);
  };

  return (
    <div className="bible-editor">
      <div className="bible-toolbar">
        <label className="bible-select-label">
          문서
          <select
            value={selected}
            onChange={(e) => {
              onSelectFile(e.target.value);
            }}
            disabled={loadingList || files.length === 0}
          >
            {files.map((f) => (
              <option key={f.name} value={f.name}>
                {f.label} — {f.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => void loadFile(selected)} disabled={!selected}>
          reload file
        </button>
        <button type="button" onClick={() => void saveFile()} disabled={!dirty || !selected}>
          save bible
        </button>
      </div>
      <p className="bible-hint">
        Mythic Archive 마크다운. 저장 시 저장소의{" "}
        <code>docs/mythic-archive/</code> 파일이 갱신됩니다.
      </p>
      <textarea
        className="bible-textarea"
        spellCheck={false}
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          setDirty(true);
        }}
        placeholder={loadingList ? "로딩 중…" : "내용이 여기에 표시됩니다."}
      />
      {error && <pre className="preview error-preview">{error}</pre>}
      {status && <pre className="preview">{status}</pre>}
    </div>
  );
};
