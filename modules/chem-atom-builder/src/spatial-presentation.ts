export type SpatialPresentationMode = "screen" | "ar" | "camera";

export function isSpatialPresentationMode(mode: SpatialPresentationMode): boolean {
  return mode === "ar" || mode === "camera";
}

export function setSpatialPanelsDomHidden(root: HTMLElement, hidden: boolean): void {
  root.classList.toggle("spatial-panels-active", hidden);
}

export function tryCreateSpatialPanels<T>(
  create: () => T,
  onFailure: (error: unknown) => void,
): T | null {
  try {
    return create();
  } catch (error) {
    onFailure(error);
    return null;
  }
}
