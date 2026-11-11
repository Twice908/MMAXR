/** The parts of the lesson that mission moments react to. */
export interface MomentSnapshot {
  /** Index of the active mission, or -1 when none (free play or finished). */
  readonly missionIndex: number;
  /** Ids of completed missions. */
  readonly completed: readonly string[];
  /** Total Check presses that did not meet the goal, across missions. */
  readonly misses: number;
  readonly hints: number;
  readonly answered: number;
  readonly correct: number;
  readonly finished: boolean;
  /** Atom charge (protons minus electrons). */
  readonly charge: number;
}

/** A moment worth marking with light and sound. */
export type Moment =
  | { readonly kind: "mission-complete"; readonly missionId: string }
  | { readonly kind: "lesson-complete" }
  | { readonly kind: "answer"; readonly correct: boolean }
  | { readonly kind: "check-miss" }
  | { readonly kind: "hint" }
  | { readonly kind: "ion"; readonly charge: number };

/**
 * Moments between two lesson snapshots, in the order they should play. View-only: the moments
 * celebrate what the lesson flow already decided and never change it.
 */
export function missionMoments(previous: MomentSnapshot, next: MomentSnapshot): readonly Moment[] {
  const moments: Moment[] = [];
  for (const missionId of next.completed) {
    if (!previous.completed.includes(missionId)) moments.push({ kind: "mission-complete", missionId });
  }
  if (next.finished && !previous.finished) moments.push({ kind: "lesson-complete" });
  if (next.answered > previous.answered) moments.push({ kind: "answer", correct: next.correct > previous.correct });
  if (next.misses > previous.misses) moments.push({ kind: "check-miss" });
  if (next.hints > previous.hints) moments.push({ kind: "hint" });
  if (next.charge !== 0 && Math.sign(next.charge) !== Math.sign(previous.charge)) {
    moments.push({ kind: "ion", charge: next.charge });
  }
  return moments;
}

const SUPERSCRIPT: Readonly<Record<string, string>> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
};

/**
 * The ion badge for an atom: the symbol with a raised charge (Na⁺, Cl⁻, Mg²⁺) and a short plain
 * reason. Null for a neutral atom or an unknown element.
 */
export function ionBadge(symbol: string | undefined, charge: number): { readonly label: string; readonly detail: string } | null {
  if (!symbol || charge === 0) return null;
  const size = Math.abs(charge);
  const digits = size === 1 ? "" : [...String(size)].map((digit) => SUPERSCRIPT[digit] ?? digit).join("");
  const sign = charge > 0 ? "⁺" : "⁻";
  const electrons = size === 1 ? "1 electron" : `${size} electrons`;
  return {
    label: `${symbol}${digits}${sign}`,
    detail: charge > 0 ? `Positive ion: ${electrons} lost` : `Negative ion: ${electrons} gained`,
  };
}
