// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { scaledZoom, usePreviewZoom } from "./usePreviewZoom";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("intercepts only Ctrl+wheel, batches trackpad deltas and normalizes line units", () => {
  let flush!: FrameRequestCallback;
  const request = vi.fn((callback: FrameRequestCallback) => {
    flush = callback;
    return 1;
  });
  vi.stubGlobal("requestAnimationFrame", request);
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const zoom = vi.fn();
  function Fixture() {
    const root = useRef<HTMLDivElement>(null);
    usePreviewZoom(root, zoom);
    return <div ref={root} />;
  }
  const view = render(<Fixture />),
    element = view.container.firstChild!;
  expect(fireEvent.wheel(element, { deltaY: 100, cancelable: true })).toBe(
    true,
  );
  expect(request).not.toHaveBeenCalled();
  expect(
    fireEvent.wheel(element, {
      deltaY: -1,
      deltaMode: 1,
      ctrlKey: true,
      cancelable: true,
    }),
  ).toBe(false);
  fireEvent.wheel(element, { deltaY: -16, ctrlKey: true });
  expect(request).toHaveBeenCalledOnce();
  act(() => flush(0));
  expect(zoom.mock.calls[0][0]).toBeCloseTo(Math.exp(32 * 0.0015));
  fireEvent.wheel(element, { deltaY: 100, ctrlKey: true });
  view.unmount();
  expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
});
it("bounds PDF and text zoom in both directions", () => {
  expect(scaledZoom(3.9, 2, 0.25, 4)).toBe(4);
  expect(scaledZoom(0.3, 0.1, 0.25, 4)).toBe(0.25);
  expect(scaledZoom(2.4, 2, 0.5, 2.5)).toBe(2.5);
  expect(scaledZoom(0.6, 0.1, 0.5, 2.5)).toBe(0.5);
});
