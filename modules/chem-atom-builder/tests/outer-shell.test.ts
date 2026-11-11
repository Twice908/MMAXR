import { describe, expect, it } from "vitest";
import { layoutAtom } from "../src/layout.js";
import { outerShellState, withOuterShellEmphasis } from "../src/outer-shell.js";

// Shell fillings below follow the Bohr-Bury examples in CLAUDE.md (K is 2,8,8,1).
describe("outer-shell emphasis", () => {
  it("names the outer-shell state from the kit's rule", () => {
    expect(outerShellState([])).toBe("empty");
    expect(outerShellState([0])).toBe("empty");
    expect(outerShellState([2, 8, 8, 1])).toBe("reactive");
    expect(outerShellState([2, 8])).toBe("complete");
  });

  it("marks only the outermost occupied ring", () => {
    const shells = [2, 8, 8, 1];
    const frame = withOuterShellEmphasis(
      layoutAtom({ protons: 19, neutrons: 20, shells, validationMessages: [] } as unknown as Parameters<typeof layoutAtom>[0]),
      shells,
    );
    const marked = frame.rings.filter((ring) => ring.emphasis !== undefined);
    expect(marked).toHaveLength(1);
    expect(marked[0]?.shell).toBe(4);
    expect(marked[0]?.emphasis).toBe("pulse");
  });

  it("settles a complete outer shell and leaves an empty atom unmarked", () => {
    const complete = withOuterShellEmphasis(
      layoutAtom({ protons: 10, neutrons: 10, shells: [2, 8], validationMessages: [] } as unknown as Parameters<typeof layoutAtom>[0]),
      [2, 8],
    );
    expect(complete.rings.find((ring) => ring.shell === 2)?.emphasis).toBe("settled");
    const empty = layoutAtom({ protons: 1, neutrons: 0, shells: [], validationMessages: [] } as unknown as Parameters<typeof layoutAtom>[0]);
    expect(withOuterShellEmphasis(empty, [])).toBe(empty);
  });
});
