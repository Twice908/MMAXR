import { hasCompleteOuterShell } from "./electron-shells.js";

/** How the outermost occupied shell looks: no electrons yet, reactive, or complete. */
export type OuterShellState = "empty" | "reactive" | "complete";

/** The visual cue a renderer gives the outer shell's ring (see engine-render `SceneRing.emphasis`). */
export type RingEmphasis = "pulse" | "settled";

/** The outer-shell state, using the kit's complete-outer-shell rule. */
export function outerShellState(shells: readonly number[]): OuterShellState {
  if (!shells.some((count) => count > 0)) return "empty";
  return hasCompleteOuterShell(shells) ? "complete" : "reactive";
}

/**
 * Mark the outermost occupied shell's ring for a luminous atom: it breathes (`pulse`) while the
 * outer shell is incomplete (reactive) and settles with a flash of light once it is complete.
 * Other rings are left as they are. Works on any atom layout with numbered rings, so it needs no
 * renderer import.
 */
export function withOuterShellEmphasis<Frame extends { readonly rings: readonly { readonly shell: number }[] }>(
  frame: Frame,
  shells: readonly number[],
): EmphasisedFrame<Frame> {
  const state = outerShellState(shells);
  if (state === "empty") return frame as EmphasisedFrame<Frame>;
  let outermost = 0;
  shells.forEach((count, index) => {
    if (count > 0) outermost = index + 1;
  });
  const emphasis: RingEmphasis = state === "complete" ? "settled" : "pulse";
  return {
    ...frame,
    rings: frame.rings.map((ring) => (ring.shell === outermost ? { ...ring, emphasis } : ring)),
  };
}

/** A frame whose rings may carry a {@link RingEmphasis}. */
export type EmphasisedFrame<Frame extends { readonly rings: readonly { readonly shell: number }[] }> = Omit<Frame, "rings"> & {
  readonly rings: readonly (Frame["rings"][number] & { readonly emphasis?: RingEmphasis })[];
};
