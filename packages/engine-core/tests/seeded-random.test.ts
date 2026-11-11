import { describe, expect, it } from "vitest";
import { seededRandom } from "../src/index.js";

describe("seededRandom", () => {
  it("repeats for the same seed, differs for another, and stays in [0, 1)", () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    const c = seededRandom(43);
    const values = Array.from({ length: 200 }, () => a());
    expect(values).toEqual(Array.from({ length: 200 }, () => b()));
    expect(values).not.toEqual(Array.from({ length: 200 }, () => c()));
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
  });
});
