/** Shared geometry for Fall 2: live map above, own Safety controls below. */
export function getSafetySplitPanelHeight(viewportHeight: number): number {
  return Math.min(Math.max(viewportHeight * 0.5, 390), 500);
}
