import { describe, expect, it } from "vitest";
import { GRAPH_BOX, buildGraphGeometry, graphSummary, niceTicks } from "../src/xy-graph.js";

describe("niceTicks", () => {
  it("uses steps of 1, 2 or 5 times a power of ten and reaches the maximum", () => {
    expect(niceTicks(0.3)).toEqual([0, 0.1, 0.2, 0.3]);
    expect(niceTicks(6)).toEqual([0, 2, 4, 6]);
    expect(niceTicks(0.45)).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5]);
    expect(niceTicks(3)).toEqual([0, 1, 2, 3]);
    expect(niceTicks(0)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
  });
});

describe("buildGraphGeometry", () => {
  it("puts the origin at the bottom left and the axis ends at the top right", () => {
    const geometry = buildGraphGeometry({ series: [{ id: "r", label: "10 Ω", marker: "circle", tone: 0, joinFromOrigin: true, points: [{ x: 0.3, y: 3 }] }] });
    expect(geometry.xMax).toBe(0.3);
    expect(geometry.yMax).toBe(3);
    expect(geometry.toPixel(0, 0)).toEqual({ x: GRAPH_BOX.left, y: GRAPH_BOX.height - GRAPH_BOX.bottom });
    expect(geometry.toPixel(0.3, 3)).toEqual({ x: GRAPH_BOX.width - GRAPH_BOX.right, y: GRAPH_BOX.top });
  });

  it("keeps the minimum axis ends before points arrive", () => {
    const geometry = buildGraphGeometry({ series: [], minXMax: 0.5, minYMax: 6 });
    expect([geometry.xMax, geometry.yMax]).toEqual([0.5, 6]);
  });
});

describe("graphSummary", () => {
  const options = { title: "V–I graph", xLabel: "Current (A)", yLabel: "Potential difference (V)", emptyText: "No readings yet." };
  it("names each series with its point count", () => {
    expect(graphSummary(options, { series: [{ id: "r", label: "10 Ω", marker: "circle", tone: 0, joinFromOrigin: true, points: [{ x: 0.15, y: 1.5 }, { x: 0.3, y: 3 }] }] }))
      .toBe("V–I graph, Potential difference (V) against Current (A). 10 Ω: 2 points.");
    expect(graphSummary(options, { series: [] })).toBe("V–I graph. No readings yet.");
  });
});
