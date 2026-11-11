/** A seeded source of numbers in [0, 1). The same seed always gives the same sequence. */
export type SeededRandom = () => number;

/** Create a small, fast seeded generator (mulberry32). */
export function seededRandom(seed: number): SeededRandom {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
