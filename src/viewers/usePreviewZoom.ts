import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

export function scaledZoom(
  current: number,
  factor: number,
  min: number,
  max: number,
) {
  return Math.min(max, Math.max(min, current * factor));
}

// Native non-passive listener prevents WebView page zoom; batch smooth wheel events.
export function usePreviewZoom(
  root: RefObject<HTMLElement | null>,
  onZoom: (factor: number, x: number, y: number) => void,
) {
  const callback = useRef(onZoom);
  useLayoutEffect(() => {
    callback.current = onZoom;
  });
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    let frame = 0,
      delta = 0,
      x = 0,
      y = 0;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      event.stopPropagation();
      const unit =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? element.clientHeight
            : 1;
      delta += event.deltaY * unit;
      x = event.clientX;
      y = event.clientY;
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          const factor = Math.exp(
            -Math.max(-300, Math.min(300, delta)) * 0.0015,
          );
          delta = 0;
          callback.current(factor, x, y);
        });
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => {
      element.removeEventListener("wheel", wheel);
      cancelAnimationFrame(frame);
    };
  }, [root]);
}
