/** Mission moments now live in engine-lesson (shared with Ionic Bonding); re-exported here. */
export { missionMoments, type Moment, type MomentSnapshot } from "@mma/engine-lesson";

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
