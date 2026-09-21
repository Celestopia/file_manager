import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { scaledZoom, usePreviewZoom } from "./usePreviewZoom";
import { invoke } from "../native/ipc";
import { MarkdownPreview } from "./MarkdownPreview";
export function TextSourceViewer({
  id,
  revision,
  markdown,
  onError,
}: {
  id: string;
  revision: number;
  markdown: boolean;
  onError: (message: string) => void;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setContent(null);
    setFailed(false);
    void invoke("read_source_text", { id })
      .then((text) => {
        if (active) setContent(text);
      })
      .catch((error) => {
        if (active) {
          setFailed(true);
          onError(String(error));
        }
      });
    return () => {
      active = false;
    };
  }, [id, revision, onError]);
  if (failed)
    return (
      <div className="empty-content">
        <h2>Text preview unavailable</h2>
        <p>Open the source in its default application.</p>
      </div>
    );
  if (content === null)
    return <div className="empty-content">Loading document…</div>;
  if (content === "")
    return <div className="empty-content">This file is empty.</div>;
  return <TextPreview key={id} content={content} markdown={markdown} />;
}

function TextPreview({
  content,
  markdown,
}: {
  content: string;
  markdown: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const anchor = useRef<{ fraction: number; y: number } | null>(null);
  const changeZoom = (next: number, y = 0) => {
    const element = root.current!;
    anchor.current = {
      fraction: (element.scrollTop + y) / element.scrollHeight,
      y,
    };
    setZoom(next);
  };
  usePreviewZoom(root, (factor, _x, y) =>
    changeZoom(
      scaledZoom(zoom, factor, 0.5, 2.5),
      y - root.current!.getBoundingClientRect().top,
    ),
  );
  useLayoutEffect(() => {
    if (anchor.current) {
      root.current!.scrollTop =
        anchor.current.fraction * root.current!.scrollHeight - anchor.current.y;
      anchor.current = null;
    }
  }, [zoom]);
  return (
    <div className="text-source-container">
      <div className="pdf-toolbar">
        <span className="spacer" />
        <span aria-label="Text zoom">{Math.round(zoom * 100)}%</span>
        <button onClick={() => changeZoom(1)} disabled={zoom === 1}>
          Reset zoom
        </button>
      </div>
      <div
        ref={root}
        className="text-source-view"
        style={{ "--preview-scale": zoom } as CSSProperties}
        aria-label={
          markdown ? "Markdown source preview" : "Text source preview"
        }
      >
        {markdown ? (
          <MarkdownPreview body={content} className="source-markdown" />
        ) : (
          <pre className="source-plain-text">{content}</pre>
        )}
      </div>
    </div>
  );
}
