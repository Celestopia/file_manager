export const defaultSourceWidth = (viewport: number) =>
  viewport <= 1000 ? 200 : 280;
export const sourcePanelMax = (viewport: number, rightOpen: boolean) =>
  Math.max(
    180,
    Math.min(viewport * 0.5, viewport - 286 - (rightOpen ? 280 : 0)),
  );
export const sourceWidthFor = (
  width: number,
  viewport: number,
  rightOpen = false,
) =>
  width < 100
    ? 0
    : Math.max(180, Math.min(sourcePanelMax(viewport, rightOpen), width));
export const rightPanelMax = (viewport: number, sourceWidth: number) =>
  Math.max(280, Math.min(viewport * 0.6, viewport - sourceWidth - 286));
