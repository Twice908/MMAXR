import { createStore, type EngineAction } from "@mma/engine-core";
import { assessmentItemSchema } from "@mma/engine-assess";
import { moduleManifestSchema } from "@mma/schema";
import { describe, expect, it } from "vitest";
import carbon12Items from "../assessments/m1-carbon-12.json";
import sodiumItems from "../assessments/m2-sodium-ion.json";
import carbon14Items from "../assessments/m3-carbon-14.json";
import chlorideItems from "../assessments/m4-chloride-ion.json";
import rawManifest from "../module.json";
import {
  createAtomBuilderLearningReducer,
  createAtomBuilderLearningState,
  missionCheckState,
} from "../src/learning.js";
import { buildXrLessonContent } from "../src/xr-lesson.js";

const manifest = moduleManifestSchema.parse(rawManifest);
const missions = manifest.missions;
const rawItems = [...carbon12Items, ...sodiumItems, ...carbon14Items, ...chlorideItems];
const items = rawItems.map((item) => assessmentItemSchema.parse(item));
const extras = {
  lastHintText: "",
  caption: "",
  exitLabel: "Exit VR",
  session: { inXr: false, canEnterVr: true, canEnterAr: false },
  narration: { audioEnabled: false, muted: false, captionsEnabled: true },
};

function startedStore() {
  const store = createStore(
    createAtomBuilderLearningReducer(missions, rawItems),
    createAtomBuilderLearningState(missions),
  );
  store.dispatch({ type: "mission/start", payload: { missionId: missions[0]!.id } });
  return store;
}

const dispatchAll = (store: ReturnType<typeof startedStore>, actions: EngineAction[]): void => {
  for (const action of actions) store.dispatch(action);
};

describe("immersive lesson content", () => {
  it("shows the active mission with the same commands as the screen UI", () => {
    const content = buildXrLessonContent(startedStore().getState(), missions, items, extras);
    expect(content.eyebrow).toBe(`MISSION 1 OF ${missions.length}`);
    expect(content.title).toBe(missions[0]!.title);
    expect(content.body).toBe(missions[0]!.goalText);
    expect(content.hint).toEqual({ label: "Hint", command: "lesson:hint", enabled: true });
    expect(content.check).toEqual({ label: "Check", command: "lesson:check", enabled: true });
    expect(content.freePlay?.command).toBe("lesson:free-play");
    expect(content.assessment).toBeNull();
    expect(content.particles.map((row) => [row.id, row.addCommand, row.removeCommand])).toEqual([
      ["proton", "particle:add:proton", "particle:remove:proton"],
      ["neutron", "particle:add:neutron", "particle:remove:neutron"],
      ["electron", "particle:add:electron", "particle:remove:electron"],
    ]);
    expect(content.resetAtom.command).toBe("atom/reset");
    expect(content.exitLabel).toBe("Exit VR");
  });

  it("mirrors particle counts and element facts from chemistry state", () => {
    const store = startedStore();
    dispatchAll(store, [
      { type: "particle/add", payload: { particle: "proton" } },
      { type: "particle/add", payload: { particle: "neutron" } },
    ]);
    const state = store.getState();
    const content = buildXrLessonContent(state, missions, items, extras);
    const electrons = state.chemistry.shells.reduce((sum, count) => sum + count, 0);
    expect(content.particles.map((row) => row.count)).toEqual([
      state.chemistry.protons,
      state.chemistry.neutrons,
      electrons,
    ]);
    expect(content.element.rows[0]).toEqual({ label: "Atomic number Z", value: String(state.chemistry.protons) });
  });

  it("shows the latest hint text with its hint level", () => {
    const store = startedStore();
    store.dispatch({ type: "mission/hint", payload: null });
    const content = buildXrLessonContent(store.getState(), missions, items, {
      ...extras,
      lastHintText: missions[0]!.hints[0] ?? "",
    });
    expect(content.feedback).toBe(`nudge: ${missions[0]!.hints[0]}`);
  });

  it("explains a failed check", () => {
    const store = startedStore();
    store.dispatch({ type: "mission/check", payload: { state: missionCheckState(store.getState().chemistry) } });
    const content = buildXrLessonContent(store.getState(), missions, items, extras);
    expect(content.feedback).toContain("Not yet.");
  });

  it("hides mission actions in free play", () => {
    const store = startedStore();
    store.dispatch({ type: "mode/free-play", payload: null });
    const content = buildXrLessonContent(store.getState(), missions, items, extras);
    expect(content.eyebrow).toBe("FREE PLAY");
    expect(content.hint).toBeNull();
    expect(content.check).toBeNull();
    expect(content.freePlay).toBeNull();
    expect(content.assessment).toBeNull();
  });

  it("passes the narration caption through", () => {
    const content = buildXrLessonContent(startedStore().getState(), missions, items, {
      ...extras,
      caption: "Welcome to the lesson.",
    });
    expect(content.caption).toBe("Welcome to the lesson.");
  });

  it("labels the narration toggles from narration state and passes session state through", () => {
    const state = startedStore().getState();
    const off = buildXrLessonContent(state, missions, items, extras);
    expect(off.narration.sound).toEqual({ label: "Sound off", command: "narration:sound" });
    expect(off.narration.captions.label).toBe("Captions on");
    expect(off.session).toEqual({ inXr: false, canEnterVr: true, canEnterAr: false });
    const muted = buildXrLessonContent(state, missions, items, {
      ...extras,
      narration: { audioEnabled: true, muted: true, captionsEnabled: false },
    });
    expect(muted.narration.sound.label).toBe("Unmute");
    expect(muted.narration.captions.label).toBe("Captions off");
  });
});
