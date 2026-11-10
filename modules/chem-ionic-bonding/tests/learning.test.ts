import { createStore, type EngineAction } from "@mma/engine-core";
import { validateModuleRelease } from "@mma/engine-assess";
import { IONIC_BONDING_ACTION, ionicBondingCheckState, ionicCompoundById } from "@mma/kit-chemistry";
import { moduleManifestSchema } from "@mma/schema";
import { describe, expect, it } from "vitest";
import giveElectronItems from "../assessments/m1-give-electron.json";
import joinIonsItems from "../assessments/m2-join-ions.json";
import rawManifest from "../module.json";
import { createIonicLessonReducer, createIonicLessonState, projectIonicLessonEvents } from "../src/learning.js";

const manifest = moduleManifestSchema.parse(rawManifest);
const missions = manifest.missions;
const items = [...giveElectronItems, ...joinIonsItems];
const nacl = ionicCompoundById("nacl")!;

function createLessonStore() {
  return createStore(createIonicLessonReducer(missions, items), createIonicLessonState(missions, nacl));
}
const transfer = (from: string, to: string): EngineAction => ({ type: IONIC_BONDING_ACTION.transfer, payload: { from, to } });
const join: EngineAction = { type: IONIC_BONDING_ACTION.bond, payload: null };

function check(store: ReturnType<typeof createLessonStore>): void {
  store.dispatch({ type: "mission/check", payload: { state: ionicBondingCheckState(store.getState().bonding) } });
}
function answerAll(store: ReturnType<typeof createLessonStore>, answers: readonly number[]): void {
  for (const answer of answers) {
    store.dispatch({ type: "assessment/answer", payload: { selectedOptionIndex: answer } });
    store.dispatch({ type: "assessment/continue", payload: null });
  }
}

describe("Ionic Bonding manifest and questions", () => {
  it("is a valid draft module with all four layers and two missions", () => {
    expect(manifest.id).toBe("chem.ionic-bonding");
    expect(manifest.releaseStatus).toBe("draft");
    expect(manifest.missions.map((mission) => mission.id)).toEqual(["give-electron", "join-ions"]);
    for (const layer of ["manipulate", "simulate", "missions", "check"] as const) {
      expect(manifest.interactions[layer].length).toBeGreaterThan(0);
    }
  });

  it("has four pending questions whose answers sit in different positions", () => {
    expect(items).toHaveLength(4);
    expect(new Set(items.map((item) => item.correctOptionIndex))).toEqual(new Set([0, 1, 2, 3]));
    expect(items.every((item) => item.reviewStatus === "pending")).toBe(true);
    // Release stays blocked until the teacher reviews the questions.
    expect(validateModuleRelease({ ...manifest, releaseStatus: "release" }, items).issues).toEqual(
      items.map((item) => `Assessment "${item.id}" is pending review.`),
    );
  });
});

describe("Ionic Bonding lesson flow", () => {
  it("keeps mission 1 open until the electron has moved", () => {
    const store = createLessonStore();
    store.dispatch({ type: "mission/start", payload: { missionId: "give-electron" } });
    check(store);
    expect(store.getState().missionProgress["give-electron"]).toEqual({ status: "active", attempts: 1, hintsUsed: 0 });

    store.dispatch(transfer("na-1", "cl-1"));
    check(store);
    expect(store.getState().missionProgress["give-electron"]?.status).toBe("completed");
    expect(store.getState().assessmentIds).toEqual(["assess.ionic.transfer.01", "assess.ionic.transfer.02"]);
  });

  it("runs both missions and all four questions to the end", () => {
    const store = createLessonStore();
    store.dispatch({ type: "mission/start", payload: { missionId: "give-electron" } });
    store.dispatch(transfer("na-1", "cl-1"));
    check(store);
    answerAll(store, [0, 1]);
    expect(store.getState().activeMissionId).toBe("join-ions");

    check(store);
    expect(store.getState().missionProgress["join-ions"]?.status).toBe("active");
    store.dispatch(join);
    check(store);
    answerAll(store, [2, 3]);
    expect(store.getState()).toMatchObject({
      activeMissionId: null,
      questionsAnswered: 4,
      questionsCorrect: 4,
      bonding: { bonded: true },
    });
  });

  it("passes bonding actions to the kit and ignores unknown actions", () => {
    const store = createLessonStore();
    const before = store.getState();
    store.dispatch({ type: "particle/add", payload: { particle: "proton" } });
    expect(store.getState()).toBe(before);
    store.dispatch(transfer("cl-1", "na-1"));
    expect(store.getState().bonding.validationMessages).toHaveLength(1);
    store.dispatch({ type: IONIC_BONDING_ACTION.reset, payload: null });
    expect(store.getState().bonding).toEqual(createIonicLessonState(missions, nacl).bonding);
  });

  it("projects lesson events only", () => {
    const store = createLessonStore();
    const run = (action: EngineAction) => {
      const previous = store.getState();
      store.dispatch(action);
      return projectIonicLessonEvents(missions, action, previous, store.getState()).map((event) => event.type);
    };
    expect(run({ type: "mission/start", payload: { missionId: "give-electron" } })).toEqual(["mission_started"]);
    expect(run(transfer("na-1", "cl-1"))).toEqual([]);
  });
});
