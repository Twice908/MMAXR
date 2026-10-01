import { selectSnapTarget } from "@mma/engine-render";

/** Pick the nearest visible nucleus or shell drop zone from view-space hits. */
export function selectAtomDropTarget(
  hits: readonly { readonly target: string; readonly distance: number }[],
): string | null {
  return selectSnapTarget(hits);
}