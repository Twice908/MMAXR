import type { EngineAction } from "@mma/engine-core";
import { describe, expect, it } from "vitest";
import {
  JOURNEY_ACTION,
  LESSON_FLOW_ACTION,
  createJourneyFlowReducer,
  createJourneyFlowState,
  journeyBeatEndedAction,
  journeyTapAction,
  projectJourneyFlowEvents,
  type JourneyFlowState,
} from "../src/index.js";
import { rawItems } from "./fixtures.js";
import { journey, journeyMissions } from "./journey-fixtures.js";

const reduce = createJourneyFlowReducer(journey, journeyMissions, rawItems);
const act = (type: string, payload: EngineAction["payload"] = null): EngineAction => ({ type, payload });
const run = (state: JourneyFlowState, ...actions: EngineAction[]) => actions.reduce((current, action) => reduce(current, action), state);
const start = () => run(createJourneyFlowState(journeyMissions), act(JOURNEY_ACTION.play));
/** Play to the first checkpoint. */
const atCheckpoint = () => run(start(), journeyBeatEndedAction("look-1"), journeyBeatEndedAction("look-2"));

describe("journey flow", () => {
  it("waits on the intro until Play, then starts chapter one and its mission", () => {
    const initial = createJourneyFlowState(journeyMissions);
    expect(initial.journey.status).toBe("intro");
    expect(reduce(initial, journeyBeatEndedAction("look-1"))).toBe(initial);
    const playing = start();
    expect(playing.journey).toMatchObject({ status: "beats", chapterIndex: 0, beatIndex: 0, paused: false });
    expect(playing.activeMissionId).toBe("m-look");
    expect(playing.missionProgress["m-look"]?.status).toBe("active");
  });

  it("advances beats only for the beat that is playing, and not while paused", () => {
    const playing = start();
    expect(reduce(playing, journeyBeatEndedAction("look-2"))).toBe(playing);
    const paused = reduce(playing, act(JOURNEY_ACTION.pause));
    expect(paused.journey.paused).toBe(true);
    expect(reduce(paused, journeyBeatEndedAction("look-1"))).toBe(paused);
    const resumed = reduce(paused, act(JOURNEY_ACTION.play));
    expect(resumed.journey.paused).toBe(false);
    expect(reduce(resumed, journeyBeatEndedAction("look-1")).journey.beatIndex).toBe(1);
  });

  it("asks the checkpoint after the last beat; skip does the same as a finished beat", () => {
    expect(atCheckpoint().journey.status).toBe("checkpoint");
    expect(run(start(), act(JOURNEY_ACTION.skip), act(JOURNEY_ACTION.skip)).journey.status).toBe("checkpoint");
  });

  it("keeps the checkpoint open on a wrong tap, counting the attempt without failing the mission", () => {
    const wrong = reduce(atCheckpoint(), journeyTapAction("cell:plant:vacuole"));
    expect(wrong.journey).toMatchObject({ status: "checkpoint", checkpointMisses: 1, lastAnswer: { value: "cell:plant:vacuole", correct: false } });
    expect(wrong.missionProgress["m-look"]).toMatchObject({ status: "active", attempts: 1 });
  });

  it("gives hints from the chapter's mission, only at the checkpoint", () => {
    expect(reduce(start(), act(JOURNEY_ACTION.hint)).missionProgress["m-look"]?.hintsUsed).toBe(0);
    const hinted = run(atCheckpoint(), act(JOURNEY_ACTION.hint), act(JOURNEY_ACTION.hint), act(JOURNEY_ACTION.hint));
    expect(hinted.missionProgress["m-look"]?.hintsUsed).toBe(2);
  });

  it("completes the mission on a correct tap, then Continue starts the next chapter", () => {
    const solved = reduce(atCheckpoint(), journeyTapAction("cell:plant:chloroplast"));
    expect(solved.journey.status).toBe("solved");
    expect(solved.missionProgress["m-look"]?.status).toBe("completed");
    expect(solved.journey.unlockedChapterIndex).toBe(1);
    const next = reduce(solved, act(JOURNEY_ACTION.continue));
    expect(next.journey).toMatchObject({ status: "beats", chapterIndex: 1, beatIndex: 0 });
    expect(next.activeMissionId).toBe("m-listen");
  });

  it("shows a checkpoint-less chapter's scored questions, then moves on after them", () => {
    const listening = run(atCheckpoint(), journeyTapAction("cell:plant:chloroplast"), act(JOURNEY_ACTION.continue));
    const questions = reduce(listening, journeyBeatEndedAction("listen-1"));
    expect(questions.journey.status).toBe("questions");
    expect(questions.assessmentIds).toEqual(["assess.test.01"]);
    // Journey buttons wait while questions show.
    expect(reduce(questions, act(JOURNEY_ACTION.skip))).toBe(questions);
    const answered = reduce(questions, act(LESSON_FLOW_ACTION.answer, { selectedOptionIndex: 2 }));
    expect(answered.questionsCorrect).toBe(1);
    const next = reduce(answered, act(LESSON_FLOW_ACTION.continue));
    expect(next.journey).toMatchObject({ status: "beats", chapterIndex: 2 });
    expect(next.activeMissionId).toBe("m-choose");
  });

  it("finishes after the last chapter's questions", () => {
    const chosen = run(
      atCheckpoint(),
      journeyTapAction("cell:plant:chloroplast"),
      act(JOURNEY_ACTION.continue),
      journeyBeatEndedAction("listen-1"),
      act(LESSON_FLOW_ACTION.answer, { selectedOptionIndex: 2 }),
      act(LESSON_FLOW_ACTION.continue),
      journeyBeatEndedAction("choose-1"),
      act(JOURNEY_ACTION.answer, { value: "wall" }),
      act(JOURNEY_ACTION.answer, { value: "mito" }),
    );
    expect(chosen.journey.status).toBe("solved");
    const questions = reduce(chosen, act(JOURNEY_ACTION.continue));
    expect(questions.journey.status).toBe("questions");
    const done = run(questions, act(LESSON_FLOW_ACTION.answer, { selectedOptionIndex: 1 }), act(LESSON_FLOW_ACTION.continue));
    expect(done.journey.status).toBe("finished");
    expect(done.activeMissionId).toBeNull();
    expect(done.questionsAnswered).toBe(2);
  });

  it("replays a chapter and jumps only to unlocked chapters", () => {
    const later = run(atCheckpoint(), journeyTapAction("cell:plant:chloroplast"), act(JOURNEY_ACTION.continue), act(JOURNEY_ACTION.skip));
    expect(later.journey.status).toBe("questions");
    expect(reduce(later, act(JOURNEY_ACTION.goToChapter, { chapterIndex: 0 }))).toBe(later);

    const second = run(atCheckpoint(), journeyTapAction("cell:plant:chloroplast"), act(JOURNEY_ACTION.continue));
    expect(reduce(second, act(JOURNEY_ACTION.goToChapter, { chapterIndex: 2 }))).toBe(second);
    const back = reduce(second, act(JOURNEY_ACTION.goToChapter, { chapterIndex: 0 }));
    expect(back.journey).toMatchObject({ status: "beats", chapterIndex: 0, beatIndex: 0, unlockedChapterIndex: 1 });
    // Revisiting a finished chapter does not restart its mission.
    expect(back.missionProgress["m-look"]?.status).toBe("completed");
    const replayed = reduce(run(atCheckpoint(), journeyTapAction("cell:plant:vacuole")), act(JOURNEY_ACTION.replayChapter));
    expect(replayed.journey).toMatchObject({ chapterIndex: 0, beatIndex: 0, status: "beats", lastAnswer: null });
  });

  it("ignores lesson actions the journey owns, and keeps the module's own fields", () => {
    const state = { ...start(), cells: { zoom: 2 } };
    expect(reduce(state, act(LESSON_FLOW_ACTION.checkMission, { state: { chapter: "look" } }))).toBe(state);
    expect(reduce(state, act(LESSON_FLOW_ACTION.freePlay))).toBe(state);
    expect(reduce(state, act(JOURNEY_ACTION.skip)).cells).toEqual({ zoom: 2 });
  });
});

describe("journey telemetry", () => {
  it("reports mission starts, hints, completions and scored answers", () => {
    const events = (action: EngineAction, before: JourneyFlowState) =>
      projectJourneyFlowEvents(journeyMissions, action, before, reduce(before, action));
    const initial = createJourneyFlowState(journeyMissions);
    expect(events(act(JOURNEY_ACTION.play), initial)).toEqual([{ type: "mission_started", payload: { missionId: "m-look" } }]);
    expect(events(act(JOURNEY_ACTION.hint), atCheckpoint())).toEqual([
      { type: "hint_used", payload: { missionId: "m-look", hintLevel: "nudge", hintIndex: 0 } },
    ]);
    expect(events(journeyTapAction("cell:plant:vacuole"), atCheckpoint())).toEqual([]);
    expect(events(journeyTapAction("cell:plant:chloroplast"), atCheckpoint())).toEqual([
      { type: "mission_completed", payload: { missionId: "m-look", attempts: 1, hintsUsed: 0 } },
    ]);
    const questions = run(atCheckpoint(), journeyTapAction("cell:plant:chloroplast"), act(JOURNEY_ACTION.continue), act(JOURNEY_ACTION.skip));
    expect(events(act(LESSON_FLOW_ACTION.answer, { selectedOptionIndex: 1 }), questions)).toEqual([
      { type: "assessment_answered", payload: { assessmentId: "assess.test.01", selectedOptionIndex: 1, correct: false } },
    ]);
  });
});
