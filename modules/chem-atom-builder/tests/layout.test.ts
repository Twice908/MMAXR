import { describe, expect, it } from "vitest";
import { createChemistryState } from "@mma/kit-chemistry";
import { layoutAtom } from "../src/layout.js";

describe("atom view layout", () => {
  it("derives distinct proton and neutron groups and a shell ring", () => {
    const layout = layoutAtom(createChemistryState(2, 1));

    expect(layout.spheres[0]?.positions).toHaveLength(2);
    expect(layout.spheres[1]?.positions).toHaveLength(1);
    expect(layout.spheres[0]?.color).not.toBe(layout.spheres[1]?.color);
    expect(layout.rings.map((ring) => ring.shell)).toEqual([1, 2]);
  });

  it("previews the next shell as an electron drop target until the kit limit", () => {
    const twoElectrons = layoutAtom(createChemistryState(2, 0, 2));
    const maxElectrons = layoutAtom(createChemistryState(20, 0, 20));

    expect(twoElectrons.rings.map((ring) => ring.shell)).toEqual([1, 2]);
    expect(maxElectrons.rings.map((ring) => ring.shell)).toEqual([1, 2, 3, 4]);
  });

  it("keeps nucleons separated while the packed nucleus grows with count", () => {
    const small = layoutAtom(createChemistryState(2, 1));
    const large = layoutAtom(createChemistryState(20, 20));
    const points = [...large.spheres[0]!.positions, ...large.spheres[1]!.positions];

    expect(large.nucleusRadius).toBeGreaterThan(small.nucleusRadius);
    for (let left = 0; left < points.length; left += 1) {
      for (let right = left + 1; right < points.length; right += 1) {
        const first = points[left]!;
        const second = points[right]!;
        expect(Math.hypot(first.x - second.x, first.y - second.y, first.z - second.z))
          .toBeGreaterThanOrEqual(0.36);
      }
    }
  });

  it("places each electron on its configured shell", () => {
    const layout = layoutAtom(createChemistryState(3, 4, 3));
    const electronPositions = layout.spheres[2]!.positions;

    expect(electronPositions).toHaveLength(3);
    expect(Math.hypot(electronPositions[0]!.x, electronPositions[0]!.y))
      .toBeCloseTo(layout.rings[0]!.radius);
    expect(Math.hypot(electronPositions[1]!.x, electronPositions[1]!.y))
      .toBeCloseTo(layout.rings[0]!.radius);
    expect(Math.hypot(electronPositions[2]!.x, electronPositions[2]!.y))
      .toBeCloseTo(layout.rings[1]!.radius);
  });

  it("derives faint-slot positions and occupancy without changing electron counts", () => {
    const layout = layoutAtom(createChemistryState(2, 0, 1));

    expect(layout.rings[0]?.slots).toHaveLength(2);
    expect(layout.rings[0]?.slots.filter((slot) => slot.occupied)).toHaveLength(1);
    expect(layout.rings[0]?.slots.find((slot) => !slot.occupied)?.position.y).toBeGreaterThan(0);
  });
});