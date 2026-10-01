import {
  selectProjectedSnapTarget,
  selectSnapTarget,
  type ProjectedDropZone,
  type ScreenPoint,
} from "@mma/engine-render";

/** Pick the nearest visible nucleus or shell drop zone from view-space hits. */
export function selectAtomDropTarget(
  hits: readonly { readonly target: string; readonly distance: number }[],
): string | null {
  return selectSnapTarget(hits);
}

/** Select a tolerant screen-space target without applying chemistry rules. */
export function selectAtomScreenDropTarget(
  pointer: ScreenPoint,
  zones: readonly ProjectedDropZone[],
  tolerancePx: number,
): string | null {
  return selectProjectedSnapTarget(pointer, zones, tolerancePx)?.target ?? null;
}