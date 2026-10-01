import { describe, expect, it } from "vitest";
import { selectAtomDropTarget } from "../src/snap.js";

describe("atom snap target", () => {
  it("selects the nearest hit surface for a release", () => {
    expect(selectAtomDropTarget([
      { target: "shell:2", distance: 5 },
      { target: "nucleus", distance: 1 },
    ])).toBe("nucleus");
  });
});