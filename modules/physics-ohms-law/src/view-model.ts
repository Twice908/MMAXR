import type { DeepReadonly } from "@mma/engine-core";
import type { LessonView } from "@mma/engine-lesson";
import type { CircuitPartShape, CircuitSceneFrame, XrModulePanelsContent, XrPanelAction } from "@mma/engine-render";
import type { GraphData, GraphMarker, GraphSeries } from "@mma/engine-ui";
import {
  CELL_VOLTS,
  batteryVolts,
  componentById,
  readingFor,
  resistanceFrom,
  roundToResolution,
  type BenchReading,
  type Circuit,
  type CircuitBenchState,
  type CircuitLayout,
  type CircuitPoint,
  type CircuitSolution,
} from "@mma/kit-physics";
import { LOAD_CHOICES, PART_ID, currentLoad, meterSpot, type MeterKind, type MeterSpot } from "./learning.js";

/** Full-scale readings of the meters' dials. */
const AMMETER_RANGE = 3;
const VOLTMETER_RANGE = 6;
const METER_STEP = 0.01;

/** A text tag shown beside a part in the model. */
export interface SceneLabel {
  readonly id: string;
  readonly text: string;
  readonly anchor: CircuitPoint;
  /** Which side of the anchor the label sits on. */
  readonly side: "left" | "right" | "above" | "below";
  readonly tone: "part" | "ammeter" | "voltmeter";
}

/** A place where the chosen meter can go, shown in the model and in the panel. */
export interface MeterSpotView {
  /** "gap" or "across:<part id>"; also the command suffix. */
  readonly key: string;
  readonly label: string;
  readonly spot: MeterSpot;
  readonly position: CircuitPoint;
  /** The chosen meter is already here. */
  readonly current: boolean;
}

/** Panel content for the bench controls. */
export interface BenchView {
  readonly cells: number;
  readonly maxCells: number;
  /** For example "2 cells, 3.0 V". */
  readonly batteryText: string;
  readonly switchClosed: boolean;
  readonly loadId: string;
  readonly ammeterText: string;
  readonly voltmeterText: string;
  readonly status: { readonly text: string; readonly tone: "info" | "error" | "success" };
}

/** Name of a meter for buttons and messages. */
export function meterName(kind: MeterKind): string {
  return kind === "ammeter" ? "Ammeter" : "Voltmeter";
}

/** Meter readings rounded to what the dial shows. */
export function meterReadings(circuit: Circuit, solution: CircuitSolution): { amps: number | null; volts: number | null } {
  return {
    amps: componentById(circuit, PART_ID.ammeter) ? roundToResolution(readingFor(solution, PART_ID.ammeter).amps, METER_STEP) : null,
    volts: componentById(circuit, PART_ID.voltmeter) ? roundToResolution(readingFor(solution, PART_ID.voltmeter).volts, METER_STEP) : null,
  };
}

/**
 * Turn the kit's layout and solution into the drawing. Charges move along the loop
 * (conventional current) faster for a larger current; with reduced motion they stay
 * still and the arrows alone show the direction.
 */
export function toSceneFrame(
  layout: CircuitLayout,
  circuit: Circuit,
  solution: CircuitSolution,
  reducedMotion: boolean,
): CircuitSceneFrame {
  const current = Math.abs(readingFor(solution, PART_ID.battery).amps);
  return {
    parts: layout.parts.map((part) => {
      const component = componentById(circuit, part.id);
      const reading = readingFor(solution, part.id);
      const shape: CircuitPartShape = part.kind;
      const base = { id: part.id, shape, position: part.position, angle: part.angle, length: part.length, outward: part.outward };
      switch (component?.kind) {
        case "battery":
          return { ...base, cells: component.cells };
        case "switch":
          return { ...base, closed: component.closed };
        case "bulb": {
          const ratedAmps = component.curve.points.at(-1)?.amps ?? 1;
          const power = Math.abs(reading.volts * reading.amps);
          return { ...base, glow: Math.sqrt(Math.min(1, power / (component.curve.ratedVolts * ratedAmps))) };
        }
        case "ammeter":
          return { ...base, dial: Math.min(1, Math.abs(reading.amps) / AMMETER_RANGE) };
        case "voltmeter":
          return { ...base, dial: Math.min(1, Math.abs(reading.volts) / VOLTMETER_RANGE) };
        default:
          return base;
      }
    }),
    wires: layout.wires,
    currentPath: current > 1e-9 ? layout.loop : [],
    flowSpeed: current > 1e-9 && !reducedMotion ? Math.min(7, 0.8 + 6 * current) : 0,
  };
}

/** Gap from a meter's centre to a label placed under it on narrow stages. */
const COMPACT_LABEL_DROP = 1.0;

/**
 * Tags beside the parts: cells and volts, ohms, switch state and meter readings.
 * `compact` (narrow stages, where the panel already lists every part) keeps only the
 * two meter readings, each placed under its meter so it stays inside the stage.
 */
export function sceneLabels(
  layout: CircuitLayout,
  circuit: Circuit,
  solution: CircuitSolution,
  compact = false,
): readonly SceneLabel[] {
  const readings = meterReadings(circuit, solution);
  return layout.parts.flatMap((part): SceneLabel[] => {
    const component = componentById(circuit, part.id);
    const label = (text: string, tone: SceneLabel["tone"] = "part"): SceneLabel[] => {
      if (compact && tone === "part") return [];
      if (compact) {
        const anchor = { ...part.position, y: part.position.y - COMPACT_LABEL_DROP };
        return [{ id: part.id, text, anchor, side: "below", tone }];
      }
      return [{ id: part.id, text, anchor: part.labelAnchor, side: part.labelSide, tone }];
    };
    switch (component?.kind) {
      case "battery":
        return label(`${cellsText(component.cells)}, ${batteryVolts(component).toFixed(1)} V`);
      case "switch":
        return label(component.closed ? "Switch closed" : "Switch open");
      case "resistor":
        return label(`${component.ohms} Ω`);
      case "bulb":
        return label("Bulb");
      case "ammeter":
        return label(`A: ${(readings.amps ?? 0).toFixed(2)} A`, "ammeter");
      case "voltmeter":
        return label(`V: ${(readings.volts ?? 0).toFixed(2)} V`, "voltmeter");
      case "wire":
        return label("Empty gap");
      default:
        return [];
    }
  });
}

/** Places the chosen meter can go: the gap, across the load, and across the battery. */
export function meterSpots(layout: CircuitLayout, circuit: Circuit, kind: MeterKind): readonly MeterSpotView[] {
  const now = meterSpot(circuit, kind);
  const load = currentLoad(circuit);
  const gapPart = layout.parts.find((part) => part.id === PART_ID.gap)
    ?? layout.parts.find((part) => part.id === PART_ID[kind] && now?.kind === "gap");
  const spots: MeterSpotView[] = [];
  if (gapPart) {
    spots.push({ key: "gap", label: "In the gap (in series)", spot: { kind: "gap" }, position: gapPart.position, current: now?.kind === "gap" });
  }
  for (const [targetId, name] of [[load?.id, `the ${loadNoun(load?.id)}`], [PART_ID.battery, "the battery"]] as const) {
    const target = layout.parts.find((part) => part.id === targetId);
    if (!target || !targetId) continue;
    spots.push({
      key: `across:${targetId}`,
      label: `Across ${name} (in parallel)`,
      spot: { kind: "across", targetId },
      position: target.acrossAnchor,
      current: now?.kind === "across" && now.targetId === targetId,
    });
  }
  return spots;
}

/** Panel content for the bench. `notice` is a short success message from the page. */
export function buildBenchView(
  bench: DeepReadonly<CircuitBenchState>,
  solution: CircuitSolution,
  notice: string,
): BenchView {
  const circuit = bench.circuit as Circuit;
  const batteryPart = componentById(circuit, PART_ID.battery);
  const switchPart = componentById(circuit, PART_ID.key);
  const cells = batteryPart?.kind === "battery" ? batteryPart.cells : 1;
  const maxCells = batteryPart?.kind === "battery" ? batteryPart.maxCells : 1;
  const readings = meterReadings(circuit, solution);
  const error = bench.validationMessages[0];
  return {
    cells,
    maxCells,
    batteryText: `${cellsText(cells)}, ${(cells * CELL_VOLTS).toFixed(1)} V`,
    switchClosed: switchPart?.kind === "switch" && switchPart.closed,
    loadId: currentLoad(circuit)?.id ?? "",
    ammeterText: readings.amps === null ? "Not connected" : `${readings.amps.toFixed(2)} A`,
    voltmeterText: readings.volts === null ? "Not connected" : `${readings.volts.toFixed(2)} V`,
    status: error
      ? { text: error, tone: "error" }
      : notice
        ? { text: notice, tone: "success" }
        : { text: "", tone: "info" },
  };
}

/** Rows of the readings table. V ÷ I is shown to one decimal place. */
export function readingRows(readings: readonly BenchReading[]): readonly Record<string, string>[] {
  return readings.map((row, index) => {
    const ratio = resistanceFrom(row.volts, row.amps);
    return {
      number: String(index + 1),
      part: loadName(row.loadId),
      cells: String(row.cells),
      volts: row.volts.toFixed(2),
      amps: row.amps.toFixed(2),
      ratio: ratio === null ? "–" : ratio.toFixed(1),
    };
  });
}

const MARKERS: readonly GraphMarker[] = ["circle", "square", "triangle", "diamond"];

/**
 * V–I graph data: current on the x-axis and potential difference on the y-axis, one
 * series per part tested, each joined from the origin. A resistor gives a straight
 * line whose slope is its resistance; the bulb's line bends.
 */
export function graphData(readings: readonly BenchReading[]): GraphData {
  const series: GraphSeries[] = [];
  LOAD_CHOICES.forEach((choice, index) => {
    const points = readings.filter((row) => row.loadId === choice.id).map((row) => ({ x: row.amps, y: row.volts }));
    if (points.length === 0) return;
    series.push({
      id: choice.id,
      label: choice.label,
      points,
      marker: MARKERS[index % MARKERS.length] ?? "circle",
      tone: index,
      joinFromOrigin: true,
    });
  });
  return { series, minXMax: 0.3, minYMax: 1.5 };
}

/** Label of a part to test, such as "10 Ω resistor" or "Bulb". */
export function loadName(loadId: string | undefined): string {
  return LOAD_CHOICES.find((choice) => choice.id === loadId)?.label ?? "part";
}

/** A part to test inside a sentence: "10 Ω resistor" or "bulb". */
export function loadNoun(loadId: string | undefined): string {
  return loadId === PART_ID.bulb ? "bulb" : loadName(loadId);
}

/** Readings shown on the headset panel: the latest few, newest last. */
const XR_READINGS_SHOWN = 4;

/** What the headset / emulator side panel needs besides the lesson. */
export interface XrBenchInput {
  readonly bench: BenchView;
  readonly readings: readonly BenchReading[];
  /** The meter being placed, and the places it can go. */
  readonly tool: MeterKind | null;
  readonly spots: readonly MeterSpotView[];
}

/**
 * Content for the headset and emulator panels: the lesson card, and a side panel with
 * the battery stepper, meter readings, the latest readings and the circuit actions.
 * The Horizon panel font covers ASCII only, so symbols are written out ("ohm", "/").
 */
export function buildXrPanelsContent(
  lesson: LessonView,
  input: XrBenchInput,
  exitLabel: string,
): XrModulePanelsContent {
  const { bench, readings, tool, spots } = input;
  const nextStep = tool
    ? `Choose where to connect the ${tool}.`
    : "Choose a meter, then where to connect it.";
  const placeActions: XrPanelAction[] = tool
    ? [
      ...spots.filter((spot) => !spot.current).map((spot) => ({
        label: ascii(spot.label),
        command: `meter:place:${spot.key}`,
        variant: "primary" as const,
        enabled: true,
      })),
      { label: "Cancel", command: `tool:${tool}`, variant: "secondary", enabled: true },
    ]
    : [
      { label: "Place the ammeter", command: "tool:ammeter", variant: "secondary", enabled: true },
      { label: "Place the voltmeter", command: "tool:voltmeter", variant: "secondary", enabled: true },
    ];
  const rows = readings.map((row, index) => ({ row, number: index + 1 })).slice(-XR_READINGS_SHOWN);
  return {
    lesson: {
      ...lesson,
      title: ascii(lesson.title),
      body: ascii(lesson.body),
      feedback: ascii(lesson.feedback),
      assessment: lesson.assessment
        ? {
          ...lesson.assessment,
          prompt: ascii(lesson.assessment.prompt),
          feedback: ascii(lesson.assessment.feedback),
          options: lesson.assessment.options.map((option) => ({ ...option, label: ascii(option.label) })),
        }
        : null,
    },
    side: {
      title: "CIRCUIT",
      status: ascii(bench.status.text || nextStep),
      statusTone: bench.status.text ? bench.status.tone : "info",
      steppers: {
        title: "BATTERY",
        rows: [{ label: `Cells (${(bench.cells * CELL_VOLTS).toFixed(1)} V)`, count: bench.cells, color: "#2f3a40", addCommand: "cells:add", removeCommand: "cells:remove" }],
      },
      cards: [
        {
          heading: "Meters",
          rows: [
            { label: "Ammeter", value: bench.ammeterText },
            { label: "Voltmeter", value: bench.voltmeterText },
          ],
        },
        {
          heading: rows.length > 0 ? "Latest readings (V, I, V/I)" : "Readings",
          rows: rows.length > 0
            ? rows.map(({ row, number }) => {
              const ratio = resistanceFrom(row.volts, row.amps);
              return {
                label: `${number}. ${ascii(loadName(row.loadId))}`,
                value: `${row.volts.toFixed(2)} V, ${row.amps.toFixed(2)} A, ${ratio === null ? "-" : ratio.toFixed(1)}`,
              };
            })
            : [{ label: "None yet", value: "Close the switch, then record" }],
        },
      ],
      actions: [
        ...placeActions,
        { label: bench.switchClosed ? "Open the switch" : "Close the switch", command: "switch:toggle", variant: "secondary", enabled: true },
        { label: `Part: ${ascii(loadName(bench.loadId))}`, command: "load:next", variant: "secondary", enabled: true },
        { label: "Record reading", command: "reading:record", variant: "primary", enabled: true },
        { label: "Start over", command: "circuit:reset", variant: "secondary", enabled: true },
      ],
    },
    exitLabel,
  };
}

/** The next part to test after `loadId`, wrapping round (for the headset's Part button). */
export function nextLoadId(loadId: string): string {
  const index = LOAD_CHOICES.findIndex((choice) => choice.id === loadId);
  return LOAD_CHOICES[(index + 1) % LOAD_CHOICES.length]?.id ?? loadId;
}

/** Write symbols the ASCII-only Horizon font cannot show: Ω, ÷, minus and dashes. */
export function ascii(text: string): string {
  return text
    .replace(/\s?Ω/g, " ohm")
    .replaceAll("÷", "/")
    .replace(/[−–—]/g, "-");
}

function cellsText(cells: number): string {
  return `${cells} cell${cells === 1 ? "" : "s"}`;
}
