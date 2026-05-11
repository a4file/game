import { useMemo } from "react";
import DOMPurify from "dompurify";
import { marked, setOptions } from "marked";

setOptions({ gfm: true, breaks: true });

type Props = {
  markdown: string;
  className?: string;
  emptyMessage?: string;
};

export const MarkdownPreview = ({ markdown, className, emptyMessage = "표시할 내용이 없습니다." }: Props) => {
  const html = useMemo(() => {
    const src = markdown ?? "";
    if (!src.trim()) return "";
    const raw = marked(src, { async: false }) as string;
    return DOMPurify.sanitize(raw);
  }, [markdown]);

  if (!html) {
    return <div className={`markdown-preview markdown-preview--empty ${className ?? ""}`}>{emptyMessage}</div>;
  }

  return <article className={`markdown-preview ${className ?? ""}`} dangerouslySetInnerHTML={{ __html: html }} />;
};
