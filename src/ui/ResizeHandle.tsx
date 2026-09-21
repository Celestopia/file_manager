import { useRef } from "react";

export function ResizeHandle({
  label,
  className = "resize-handle",
  width,
  direction = -1,
  onResize,
  collapsed = false,
}: {
  label: string;
  className?: string;
  width: number;
  direction?: 1 | -1;
  onResize: (width: number) => void;
  collapsed?: boolean;
}) {
  const drag = useRef<{ x: number; width: number } | null>(null);
  return (
    <div
      className={className}
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuenow={width}
      tabIndex={collapsed ? -1 : 0}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        onResize(
          (direction === 1 && e.key === "ArrowLeft" && width <= 180) ||
            (direction === -1 && e.key === "ArrowRight" && width <= 280)
            ? 0
            : width + direction * (e.key === "ArrowRight" ? 20 : -20),
        );
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        drag.current = { x: e.clientX, width };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (drag.current)
          onResize(
            drag.current.width + direction * (e.clientX - drag.current.x),
          );
      }}
      onPointerUp={(e) => {
        drag.current = null;
        if (e.currentTarget.hasPointerCapture(e.pointerId))
          e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onLostPointerCapture={() => {
        drag.current = null;
      }}
    />
  );
}
