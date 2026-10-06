import { describe, expect, it } from "vitest";
import {
  arcPoints,
  createPlaneMapper,
  dashPolyline,
  ribbonVertices,
  visualTokens,
} from "../src/index.js";

describe("plane mapper", () => {
  it("maps to the XZ plane and exactly back", () => {
    const mapper = createPlaneMapper({ scale: 0.1, origin: [1, 2, 3] });
    expect(mapper.toScene(10, 5)).toEqual([2, 2, 2.5]);
    expect(mapper.fromScene(2, 2, 2.5)).toEqual([10, 5]);
  });
});

describe("arc geometry", () => {
  it("generates a quarter-circle with the expected midpoint direction", () => {
    const arc = arcPoints([0, 0], [1, 0], [0, 1], 1, 8);
    expect(arc.points).toHaveLength(9);
    expect(arc.points[0]).toEqual([1, 0]);
    expect(arc.points[8]?.[0]).toBeCloseTo(0, 6);
    expect(arc.points[8]?.[1]).toBeCloseTo(1, 6);
    expect(arc.points.every(([x, y]) => Math.hypot(x, y) === 1)).toBe(true);
    expect(arc.angleDeg).toBe(90);
    expect(arc.midDirection[0]).toBeCloseTo(0.7071068, 6);
    expect(arc.midDirection[1]).toBeCloseTo(0.7071068, 6);
  });

  it("shifts points with its vertex, sweeps opposite directions counter-clockwise, and accepts equal directions", () => {
    const shifted = arcPoints([2, 3], [1, 0], [0, 1], 1, 8);
    expect(shifted.points[0]).toEqual([3, 3]);
    expect(shifted.points[8]?.[0]).toBeCloseTo(2, 6);
    expect(shifted.points[8]?.[1]).toBeCloseTo(4, 6);

    const opposite = arcPoints([0, 0], [1, 0], [-1, 0], 1, 4);
    expect(opposite.angleDeg).toBe(180);
    expect(opposite.midDirection[0]).toBeCloseTo(0, 6);
    expect(opposite.midDirection[1]).toBeCloseTo(1, 6);
    expect(arcPoints([0, 0], [1, 0], [1, 0], 1, 3).angleDeg).toBe(0);
  });
});

describe("ribbon geometry", () => {
  it("creates one centered quad per non-zero segment", () => {
    const ribbon = ribbonVertices([[0, 0], [0, 0], [2, 0]], 0.2);
    expect(ribbon.positions).toHaveLength(8);
    expect(ribbon.indices).toHaveLength(6);
    const vertices = Array.from({ length: ribbon.positions.length / 2 }, (_, index) => [
      ribbon.positions[index * 2],
      ribbon.positions[index * 2 + 1],
    ]);
    expect(vertices).toEqual(
      expect.arrayContaining([
        [0, 0.1],
        [0, -0.1],
        [2, 0.1],
        [2, -0.1],
      ]),
    );
    const triangleArea = (a: number, b: number, c: number) => {
      const point = (index: number) => [
        ribbon.positions[index * 2] as number,
        ribbon.positions[index * 2 + 1] as number,
      ];
      const p = point(a);
      const q = point(b);
      const r = point(c);
      return Math.abs(((q[0]! - p[0]!) * (r[1]! - p[1]!) - (q[1]! - p[1]!) * (r[0]! - p[0]!)) / 2);
    };
    expect(triangleArea(0, 1, 2)).toBeCloseTo(0.2, 6);
    expect(triangleArea(2, 1, 3)).toBeCloseTo(0.2, 6);
  });
});

describe("polyline dashes", () => {
  it("truncates the final dash along a straight path", () => {
    const dashes = dashPolyline([[0, 0], [1, 0]], 0.2, 0.1);
    expect(dashes).toHaveLength(4);
    const ranges = dashes.map((dash) => [dash[0]?.[0] as number, dash[dash.length - 1]?.[0] as number]);
    const expected = [[0, 0.2], [0.3, 0.5], [0.6, 0.8], [0.9, 1]];
    ranges.forEach(([start, end], index) => {
      expect(start).toBeCloseTo(expected[index]?.[0] as number, 6);
      expect(end).toBeCloseTo(expected[index]?.[1] as number, 6);
    });
  });

  it("keeps its pattern continuous around corners", () => {
    const dashes = dashPolyline([[0, 0], [0.15, 0], [0.15, 0.5]], 0.2, 0.1);
    expect(dashes).toHaveLength(3);
    expect(dashes[0]).toEqual([[0, 0], [0.15, 0], [0.15, 0.05000000000000002]]);
    expect(dashes[1]?.[0]?.[1]).toBeCloseTo(0.15, 6);
    expect(dashes[1]?.[1]?.[1]).toBeCloseTo(0.35, 6);
    expect(dashes[2]?.[0]?.[1]).toBeCloseTo(0.45, 6);
    expect(dashes[2]?.[1]?.[1]).toBeCloseTo(0.5, 6);
  });
});

describe("visual tokens", () => {
  it("provides one tunable set of reusable values", () => {
    expect(visualTokens.beamWidth).toBeGreaterThan(0);
    expect(visualTokens.virtualDash).toBeGreaterThan(0);
  });
});
