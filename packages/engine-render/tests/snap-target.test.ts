import { describe, expect, it } from "vitest";
import { selectSnapTarget } from "../src/snap-target.js";

describe("snap target selection", () => {
  it("chooses the nearest in-range target", () => {
    expect(selectSnapTarget([
      { target: "shell:2", distance: 2 },
      { target: "nucleus", distance: 1 },
    ])).toBe("nucleus");
  });

  it("uses priority for exact ties and rejects distant candidates", () => {
    expect(selectSnapTarget([
      { target: "shell:1", distance: 1, priority: 0 },
      { target: "nucleus", distance: 1, priority: 1 },
      { target: "shell:2", distance: 4 },
    ], 2)).toBe("nucleus");
  });

  it("returns null when there is no usable target", () => {
    expect(selectSnapTarget([{ target: "shell:1", distance: Number.NaN }])).toBeNull();
  });
});