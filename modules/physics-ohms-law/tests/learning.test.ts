import { createStore, type EngineAction } from "@mma/engine-core";
import { validateModuleRelease } from "@mma/engine-assess";
import { CIRCUIT_BENCH_ACTION, type Circuit } from "@mma/kit-physics";
import { moduleManifestSchema } from "@mma/schema";
import { describe, expect, it } from "vitest";
import metersItems from "../assessments/m1-meters.json";
import potentialDifferenceItems from "../assessments/m2-potential-difference.json";
import resistanceItems from "../assessments/m3-resistance.json";
import bulbItems from "../assessments/m4-filament-bulb.json";
import rawManifest from "../module.json";
import {
  PART_ID,
  createOhmsLawLessonReducer,
  createOhmsLawLessonState,
  meterSpot,
  ohmsLawCheckState,
  placeMeter,
  swapLoadAction,
  type MeterKind,
  type MeterSpot,
} from "../src/learning.js";

const manifest = moduleManifestSchema.parse(rawManifest);
const missions = manifest.missions;
const items = [...metersItems, ...potentialDifferenceItems, ...resistanceItems, ...bulbItems];

function createLessonStore() {
  return createStore(createOhmsLawLessonReducer(missions, items), createOhmsLawLessonState(missions));
}
type LessonStore = ReturnType<typeof createLessonStore>;

const circuitOf = (store: LessonStore) => store.getState().bench.circuit as Circuit;
const place = (store: LessonStore, kind: MeterKind, spot: MeterSpot): void =>
  store.dispatch({ type: CIRCUIT_BENCH_ACTION.rewire, payload: { circuit: placeMeter(circuitOf(store), kind, spot) } });
const cells = (count: number): EngineAction => ({ type: CIRCUIT_BENCH_ACTION.setCells, payload: { batteryId: PART_ID.battery, cells: count } });
const record = (store: LessonStore): void => {
  const load = circuitOf(store).components.find((part) => part.kind === "resistor" || part.kind === "bulb");
  store.dispatch({ type: CIRCUIT_BENCH_ACTION.recordReading, payload: { ammeterId: "ammeter", voltmeterId: "voltmeter", loadId: load?.id ?? "" } });
};
const swap = (store: LessonStore, loadId: string): void => {
  const action = swapLoadAction(circuitOf(store), loadId);
  if (action) store.dispatch(action);
};
function check(store: LessonStore): void {
  store.dispatch({ type: "mission/check", payload: { state: ohmsLawCheckState(store.getState().bench) } });
}
function answerAll(store: LessonStore, answers: readonly number[]): void {
  for (const answer of answers) {
    store.dispatch({ type: "assessment/answer", payload: { selectedOptionIndex: answer } });
    store.dispatch({ type: "assessment/continue", payload: null });
  }
}
function buildCircuit(store: LessonStore): void {
  place(store, "ammeter", { kind: "gap" });
  place(store, "voltmeter", { kind: "across", targetId: "r10" });
  store.dispatch({ type: CIRCUIT_BENCH_ACTION.setSwitch, payload: { switchId: PART_ID.key, closed: true } });
}

describe("Ohm's Law manifest and questions", () => {
  it("is a valid draft physics module with all four layers and four missions", () => {
    expect(manifest.id).toBe("phys.ohms-law");
    expect(manifest.subject).toBe("physics");
    expect(manifest.releaseStatus).toBe("draft");
    expect(missions.map((mission) => mission.id)).toEqual(["build-circuit", "vary-potential-difference", "vary-resistance", "filament-bulb"]);
    for (const layer of ["manipulate", "simulate", "missions", "check"] as const) {
      expect(manifest.interactions[layer].length).toBeGreaterThan(0);
    }
  });

  it("has eight pending questions with answers spread over every position", () => {
    expect(items).toHaveLength(8);
    expect(new Set(items.map((item) => item.correctOptionIndex))).toEqual(new Set([0, 1, 2, 3]));
    expect(validateModuleRelease({ ...manifest, releaseStatus: "release" }, items).issues).toEqual(
      items.map((item) => `Assessment "${item.id}" is pending review.`),
    );
  });
});

describe("Ohm's Law lesson", () => {
  it("runs all four missions from wiring to the filament bulb", () => {
    const store = createLessonStore();
    store.dispatch({ type: "mission/start", payload: { missionId: "build-circuit" } });

    check(store);
    expect(store.getState().missionProgress["build-circuit"]?.status).toBe("active");
    buildCircuit(store);
    check(store);
    expect(store.getState().missionProgress["build-circuit"]?.status).toBe("completed");
    answerAll(store, [0, 2]);
    expect(store.getState().activeMissionId).toBe("vary-potential-difference");

    for (const count of [1, 2, 3]) {
      store.dispatch(cells(count));
      record(store);
    }
    check(store);
    answerAll(store, [1, 3]);
    expect(store.getState().activeMissionId).toBe("vary-resistance");

    // Still 3 cells: add the 2 Ω and 5 Ω readings to the 10 Ω one.
    for (const loadId of ["r2", "r5"]) {
      swap(store, loadId);
      record(store);
    }
    check(store);
    answerAll(store, [2, 0]);
    expect(store.getState().activeMissionId).toBe("filament-bulb");

    swap(store, PART_ID.bulb);
    for (const count of [1, 2, 4]) {
      store.dispatch(cells(count));
      record(store);
    }
    check(store);
    answerAll(store, [1, 3]);
    expect(Object.values(store.getState().missionProgress).every((progress) => progress.status === "completed")).toBe(true);
    expect(store.getState().questionsCorrect).toBe(8);
  });

  it("keeps the voltmeter across the part to test when the part is swapped", () => {
    const store = createLessonStore();
    buildCircuit(store);
    swap(store, "r5");
    expect(meterSpot(circuitOf(store), "voltmeter")).toEqual({ kind: "across", targetId: "r5" });
    expect(ohmsLawCheckState(store.getState().bench).voltmeterAcrossLoad).toBe(true);
  });

  it("does not count a voltmeter across the battery as across the resistor", () => {
    const store = createLessonStore();
    place(store, "ammeter", { kind: "gap" });
    place(store, "voltmeter", { kind: "across", targetId: PART_ID.battery });
    expect(meterSpot(circuitOf(store), "voltmeter")).toEqual({ kind: "across", targetId: PART_ID.battery });
    expect(ohmsLawCheckState(store.getState().bench).voltmeterAcrossLoad).toBe(false);
  });

  it("rejects a voltmeter in the gap and an ammeter across the resistor, with reasons", () => {
    const store = createLessonStore();
    place(store, "voltmeter", { kind: "gap" });
    expect(meterSpot(circuitOf(store), "voltmeter")).toBeNull();
    expect(store.getState().bench.validationMessages[0]).toContain("The voltmeter is in series");

    place(store, "ammeter", { kind: "across", targetId: "r10" });
    expect(meterSpot(circuitOf(store), "ammeter")).toBeNull();
    expect(store.getState().bench.validationMessages[0]).toContain("in parallel with the resistor");
  });

  it("moves a meter, putting the empty gap back", () => {
    const store = createLessonStore();
    place(store, "ammeter", { kind: "gap" });
    expect(circuitOf(store).components.some((part) => part.id === PART_ID.gap)).toBe(false);
    place(store, "voltmeter", { kind: "across", targetId: PART_ID.battery });
    place(store, "voltmeter", { kind: "across", targetId: "r10" });
    expect(circuitOf(store).components.filter((part) => part.kind === "voltmeter")).toHaveLength(1);
    expect(meterSpot(circuitOf(store), "voltmeter")).toEqual({ kind: "across", targetId: "r10" });
  });
});
