import DOMPurify from "dompurify";
import { marked, Renderer } from "marked";
import { memo, useMemo } from "react";

const renderer = new Renderer();
renderer.html = () => "";

export const MarkdownPreview = memo(function MarkdownPreview({
  body,
  className = "",
}: {
  body: string;
  className?: string;
}) {
  const html = useMemo(
    () =>
      DOMPurify.sanitize(marked.parse(body, { async: false, renderer }), {
        FORBID_TAGS: ["img", "iframe", "style", "input", "button", "form"],
        FORBID_ATTR: ["style"],
      }),
    [body],
  );
  return (
    <article
      className={`markdown ${className}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a")) e.preventDefault();
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});
