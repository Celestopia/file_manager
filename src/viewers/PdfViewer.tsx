import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
  type CSSProperties,
} from "react";
import { scaledZoom, usePreviewZoom } from "./usePreviewZoom";
import { invoke } from "../native/ipc";
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export function PdfViewer({
  id,
  revision,
  onError,
}: {
  id: string;
  revision: number;
  onError: (message: string) => void;
}) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null),
    [page, setPage] = useState(1),
    [zoom, setZoom] = useState(0),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    if (error) onError(error);
  }, [error, onError]);
  useEffect(() => {
    let cancelled = false;
    let task: ReturnType<typeof pdfjs.getDocument> | undefined;
    setDoc(null);
    setZoom(0);
    setPage(1);
    setError("");
    setLoading(true);
    class Transport extends pdfjs.PDFDataRangeTransport {
      requestDataRange(begin: number, end: number) {
        void (async () => {
          for (let start = begin; start < end; start += 1024 * 1024) {
            if (cancelled) return;
            const stop = Math.min(end, start + 1024 * 1024);
            const bytes = await invoke("pdf_range", {
              id,
              begin: start,
              end: stop,
            });
            if (!cancelled) this.onDataRange(start, new Uint8Array(bytes));
          }
        })().catch((e) => {
          if (!cancelled) {
            setError(String(e));
            setLoading(false);
          }
        });
      }
      abort() {
        cancelled = true;
      }
    }
    void (async () => {
      try {
        const size = await invoke("pdf_size", { id });
        if (cancelled) return;
        const transport = new Transport(size, new Uint8Array(), true);
        task = pdfjs.getDocument({
          range: transport,
          rangeChunkSize: 65536,
          disableStream: true,
          disableAutoFetch: true,
          useWasm: false,
          cMapUrl: "/pdf-assets/cmaps/",
          cMapPacked: true,
          standardFontDataUrl: "/pdf-assets/standard_fonts/",
        });
        const pdf = await task.promise;
        if (!cancelled) {
          setDoc(pdf);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(String(e));
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [id, revision]);
  return (
    <div className="pdf-view">
      <div className="pdf-toolbar">
        <span aria-label="Current PDF page">
          {doc ? `${page} / ${doc.numPages}` : "—"}
        </span>
        <span className="spacer" />
        <label className="zoom">
          Zoom{" "}
          <select
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          >
            <option value={0}>Fit width</option>
            {Array.from(
              new Set([
                0.25,
                0.5,
                0.75,
                1,
                1.25,
                1.5,
                2,
                3,
                4,
                ...(zoom ? [zoom] : []),
              ]),
            )
              .sort((a, b) => a - b)
              .map((value) => (
                <option key={value} value={value}>
                  {Math.round(value * 100)}%
                </option>
              ))}
          </select>
        </label>
      </div>
      {loading && <p className="placeholder">Loading document…</p>}
      {error ? (
        <div className="empty-content">
          PDF preview is unavailable.
          <p>You can still open the source in its default application.</p>
        </div>
      ) : (
        doc && (
          <ContinuousPages
            key={`${id}:${revision}`}
            doc={doc}
            zoom={zoom}
            onZoom={setZoom}
            onPage={setPage}
            onError={setError}
          />
        )
      )}
    </div>
  );
}

function ContinuousPages({
  doc,
  zoom,
  onZoom,
  onPage,
  onError,
}: {
  doc: PDFDocumentProxy;
  zoom: number;
  onZoom: (zoom: number) => void;
  onPage: (page: number) => void;
  onError: (error: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(700);
  const [sizes, setSizes] = useState<{ width: number; height: number }[]>([]);
  const anchor = useRef({ page: 0, fraction: 0 });
  const wheelAnchor = useRef<{
    index: number;
    x: number;
    y: number;
    localX: number;
    localY: number;
  } | null>(null);
  usePreviewZoom(container, (factor, x, y) => {
    const element = container.current!;
    const pages = Array.from(element.children) as HTMLElement[];
    const index = pages.findIndex((p) => p.getBoundingClientRect().bottom > y);
    const target = pages[index];
    if (!target || !sizes[index]) return;
    const rect = target.getBoundingClientRect(),
      bounds = element.getBoundingClientRect();
    const current = zoom || target.offsetWidth / sizes[index].width;
    const next = scaledZoom(current, factor, 0.25, 4);
    if (next === zoom) return;
    wheelAnchor.current = {
      index,
      x: (x - rect.left) / rect.width,
      y: (y - rect.top) / rect.height,
      localX: x - bounds.left,
      localY: y - bounds.top,
    };
    onZoom(next);
  });
  useEffect(() => {
    let stopped = false;
    void (async () => {
      const result = [];
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        if (stopped) return;
        const viewport = page.getViewport({ scale: 1 });
        result.push({ width: viewport.width, height: viewport.height });
      }
      setSizes(result);
    })().catch((e) => {
      if (!stopped) onError(String(e));
    });
    return () => {
      stopped = true;
    };
  }, [doc, onError]);
  useEffect(() => {
    const element = container.current!;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    setWidth(element.clientWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const element = container.current!;
    const pending = wheelAnchor.current;
    if (pending) {
      const target = element.children[pending.index] as HTMLElement;
      element.scrollTop =
        target.offsetTop + pending.y * target.offsetHeight - pending.localY;
      element.scrollLeft =
        target.offsetLeft + pending.x * target.offsetWidth - pending.localX;
      wheelAnchor.current = null;
      return;
    }
    const page = element.children[anchor.current.page] as
      HTMLElement | undefined;
    if (page)
      element.scrollTop =
        page.offsetTop - 24 + anchor.current.fraction * page.offsetHeight;
  }, [width, zoom, sizes]);
  return (
    <div
      ref={container}
      className="pdf-pages"
      onScroll={() => {
        const element = container.current!;
        const pages = Array.from(element.children) as HTMLElement[];
        let index = pages.findIndex(
          (page) => page.offsetTop + page.offsetHeight > element.scrollTop + 24,
        );
        if (index < 0) index = Math.max(0, pages.length - 1);
        const page = pages[index];
        if (page) {
          anchor.current = {
            page: index,
            fraction:
              (element.scrollTop + 24 - page.offsetTop) / page.offsetHeight,
          };
          onPage(index + 1);
        }
      }}
    >
      {sizes.map((size, index) => (
        <PdfPage
          key={index}
          doc={doc}
          number={index + 1}
          scale={zoom || Math.max(0.2, (width - 52) / size.width)}
          size={size}
          root={container}
          onError={onError}
        />
      ))}
    </div>
  );
}

function PdfPage({
  doc,
  number,
  scale,
  size,
  root,
  onError,
}: {
  doc: PDFDocumentProxy;
  number: number;
  scale: number;
  size: { width: number; height: number };
  root: RefObject<HTMLDivElement | null>;
  onError: (error: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    text = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false),
    [visited, setVisited] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setNear(entry.isIntersecting);
        if (entry.isIntersecting) setVisited(true);
      },
      { root: root.current, rootMargin: "800px 0px" },
    );
    observer.observe(host.current!);
    return () => observer.disconnect();
  }, [root]);
  useEffect(() => {
    if (!visited) return;
    let stopped = false;
    let layer: pdfjs.TextLayer | undefined;
    const element = text.current!;
    void (async () => {
      const page = await doc.getPage(number);
      if (stopped) return;
      element.style.setProperty(
        "--total-scale-factor",
        String(scale * page.userUnit),
      );
      layer = new pdfjs.TextLayer({
        textContentSource: page.streamTextContent(),
        container: element,
        viewport: page.getViewport({ scale }),
      });
      await layer.render();
    })().catch((e) => {
      if (!stopped) onError(String(e));
    });
    return () => {
      stopped = true;
      layer?.cancel();
      element.replaceChildren();
    };
  }, [doc, number, scale, visited, onError]);
  useEffect(() => {
    if (!near) return;
    let stopped = false;
    let task: RenderTask | undefined;
    void (async () => {
      const page = await doc.getPage(number);
      if (stopped || !canvas.current) return;
      const viewport = page.getViewport({ scale }),
        element = canvas.current;
      const ratio = window.devicePixelRatio || 1;
      element.width = Math.round(viewport.width * ratio);
      element.height = Math.round(viewport.height * ratio);
      task = page.render({
        canvas: element,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
      });
      await task.promise;
      if (!stopped && window.__SMOKE__ && number === 1)
        await invoke("smoke_result", {
          success: true,
          detail: "PDF page 1 rendered via native ranged reads",
        });
    })().catch((e) => {
      if (!stopped) onError(String(e));
    });
    return () => {
      stopped = true;
      task?.cancel();
    };
  }, [doc, number, scale, near, onError]);
  return (
    <div
      ref={host}
      className="pdf-page"
      data-page={number}
      style={
        {
          width: size.width * scale,
          height: size.height * scale,
          "--total-scale-factor": scale,
        } as CSSProperties
      }
    >
      {near && <canvas ref={canvas} aria-label={`PDF page ${number}`} />}
      <div ref={text} className="textLayer" />
    </div>
  );
}
