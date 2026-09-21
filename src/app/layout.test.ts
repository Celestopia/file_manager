import { expect, it } from "vitest";
import { rightPanelMax, sourcePanelMax, sourceWidthFor } from "./layout";
it("allows half-window source lists while reserving usable reader and right-panel space", () => {
  expect(sourceWidthFor(1000, 1600)).toBe(800);
  expect(sourceWidthFor(1000, 1600, true)).toBe(800);
  expect(sourcePanelMax(850, true)).toBe(284);
  for (const viewport of [850, 1000, 1240, 1600, 2560]) {
    const left = sourcePanelMax(viewport, true);
    const right = rightPanelMax(viewport, left);
    expect(left).toBeLessThanOrEqual(viewport / 2);
    expect(viewport - left - right).toBeGreaterThanOrEqual(286);
  }
  expect(sourceWidthFor(99, 1600, true)).toBe(0);
});
