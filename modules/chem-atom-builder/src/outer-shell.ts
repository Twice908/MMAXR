import type { ScreenSceneFrame } from "@mma/engine-render";
import { hasCompleteOuterShell } from "@mma/kit-chemistry";

/** How the outermost occupied shell looks: no electrons yet, reactive, or complete. */
export type OuterShellState = "empty" | "reactive" | "complete";

/** The outer-shell state, using the kit's (teacher-reviewed) complete-outer-shell rule. */
export function outerShellState(shells: readonly number[]): OuterShellState {
  if (!shells.some((count) => count > 0)) return "empty";
  return hasCompleteOuterShell(shells) ? "complete" : "reactive";
}

/**
 * Mark the outermost occupied shell's ring for the luminous atom: it breathes while the outer
 * shell is incomplete (reactive) and settles with a flash of light once it is complete. Other
 * rings are left as they are.
 */
export function withOuterShellEmphasis(frame: ScreenSceneFrame, shells: readonly number[]): ScreenSceneFrame {
  const state = outerShellState(shells);
  if (state === "empty") return frame;
  let outermost = 0;
  shells.forEach((count, index) => {
    if (count > 0) outermost = index + 1;
  });
  const emphasis = state === "complete" ? "settled" : "pulse";
  return {
    ...frame,
    rings: frame.rings.map((ring) => (ring.shell === outermost ? { ...ring, emphasis } : ring)),
  };
}
