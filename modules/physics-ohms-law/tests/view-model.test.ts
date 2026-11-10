import { layoutSeriesLoop, solveCircuit, type BenchReading, type Circuit } from "@mma/kit-physics";
import { describe, expect, it } from "vitest";
import { PART_ID, createOhmsLawCircuit, placeMeter } from "../src/learning.js";
import { buildLessonView } from "@mma/engine-lesson";
import {
  ascii,
  buildBenchView,
  buildXrPanelsContent,
  graphData,
  meterSpots,
  nextLoadId,
  readingRows,
  sceneLabels,
  toSceneFrame,
} from "../src/view-model.js";

function benchCircuit(closed: boolean): Circuit {
  let circuit = placeMeter(createOhmsLawCircuit(), "ammeter", { kind: "gap" });
  circuit = placeMeter(circuit, "voltmeter", { kind: "across", targetId: "r10" });
  return {
    components: circuit.components.map((part) => (part.id === PART_ID.key && part.kind === "switch" ? { ...part, closed } : part)),
  };
}

const readings: BenchReading[] = [
  { volts: 1.5, amps: 0.15, loadId: "r10", loadKind: "resistor", loadOhms: 10, cells: 1 },
  { volts: 3, amps: 0.3, loadId: "r10", loadKind: "resistor", loadOhms: 10, cells: 2 },
  { volts: 1.5, amps: 0.19, loadId: "lamp", loadKind: "bulb", loadOhms: null, cells: 1 },
];

describe("readings table and graph", () => {
  it("shows V ÷ I to one decimal place", () => {
    expect(readingRows(readings)[1]).toEqual({ number: "2", part: "10 Ω resistor", cells: "2", volts: "3.00", amps: "0.30", ratio: "10.0" });
    expect(readingRows(readings)[2]?.ratio).toBe("7.9");
  });

  it("plots one series per part, current across and potential difference up", () => {
    const data = graphData(readings);
    expect(data.series.map((series) => [series.label, series.marker])).toEqual([
      ["10 Ω resistor", "triangle"],
      ["Bulb", "diamond"],
    ]);
    expect(data.series[0]?.points).toEqual([{ x: 0.15, y: 1.5 }, { x: 0.3, y: 3 }]);
  });
});

describe("circuit drawing", () => {
  it("moves charges only when the switch is closed, and holds them still for reduced motion", () => {
    const open = benchCircuit(false);
    const closed = benchCircuit(true);
    const openFrame = toSceneFrame(layoutSeriesLoop(open)!, open, solveCircuit(open), false);
    expect(openFrame.currentPath).toEqual([]);
    const closedFrame = toSceneFrame(layoutSeriesLoop(closed)!, closed, solveCircuit(closed), false);
    expect(closedFrame.currentPath.length).toBeGreaterThan(1);
    expect(closedFrame.flowSpeed).toBeGreaterThan(0);
    expect(toSceneFrame(layoutSeriesLoop(closed)!, closed, solveCircuit(closed), true).flowSpeed).toBe(0);
  });

  it("labels the battery, switch, resistor and meter readings", () => {
    const closed = benchCircuit(true);
    const texts = sceneLabels(layoutSeriesLoop(closed)!, closed, solveCircuit(closed)).map((label) => label.text);
    expect(texts).toEqual(["1 cell, 1.5 V", "Switch closed", "A: 0.15 A", "10 Ω", "V: 1.50 V"]);
  });

  it("keeps only the meter readings, under the meters, on narrow stages", () => {
    const closed = benchCircuit(true);
    const labels = sceneLabels(layoutSeriesLoop(closed)!, closed, solveCircuit(closed), true);
    expect(labels.map((label) => [label.text, label.side])).toEqual([["A: 0.15 A", "below"], ["V: 1.50 V", "below"]]);
  });

  it("offers the gap, across the resistor and across the battery for a meter", () => {
    const circuit = createOhmsLawCircuit();
    const spots = meterSpots(layoutSeriesLoop(circuit)!, circuit, "voltmeter");
    expect(spots.map((spot) => spot.label)).toEqual([
      "In the gap (in series)",
      "Across the 10 Ω resistor (in parallel)",
      "Across the battery (in parallel)",
    ]);
    expect(spots.some((spot) => spot.current)).toBe(false);
  });
});

describe("headset panels", () => {
  const lesson = buildLessonView(
    { mode: "mission", activeMissionId: null, missionProgress: {}, assessmentIds: [], assessmentIndex: 0, currentAnswer: null, questionsAnswered: 0, questionsCorrect: 0 } as never,
    [],
    [],
    "",
    { idleEyebrow: "OHM'S LAW", freePlayTitle: "", freePlayBody: "", notYetFeedback: "" },
  );

  it("writes out symbols the panel font cannot show", () => {
    expect(ascii("Across the 10 Ω resistor; V ÷ I − 2")).toBe("Across the 10 ohm resistor; V / I - 2");
  });

  it("offers the meter places while a meter is chosen, and the latest readings", () => {
    const circuit = benchCircuit(true);
    const solution = solveCircuit(circuit);
    const bench = buildBenchView({ circuit, initialCircuit: circuit, readings, validationMessages: [] }, solution, "");
    const content = buildXrPanelsContent(
      lesson,
      { bench, readings, tool: "ammeter", spots: meterSpots(layoutSeriesLoop(circuit)!, circuit, "ammeter") },
      "Exit AR",
    );
    const labels = content.side.actions.map((action) => action.label);
    expect(labels).toContain("Across the 10 ohm resistor (in parallel)");
    expect(labels).toContain("Cancel");
    expect(labels).toContain("Part: 10 ohm resistor");
    expect(content.side.cards[1]?.rows.at(-1)).toEqual({ label: "3. Bulb", value: "1.50 V, 0.19 A, 7.9" });
    expect(JSON.stringify(content)).not.toMatch(/[Ω÷−]/);
  });

  it("cycles the part to test, wrapping round to the first", () => {
    expect(nextLoadId("r10")).toBe(PART_ID.bulb);
    expect(nextLoadId(PART_ID.bulb)).toBe("r2");
  });
});
