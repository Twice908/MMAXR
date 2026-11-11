import type { EngineAction } from "@mma/engine-core";
import { describe, expect, it } from "vitest";
import {
  JOURNEY_ACTION,
  LESSON_FLOW_ACTION,
  createJourneyFlowReducer,
  createJourneyFlowState,
  journeyBeatEndedAction,
  journeyMoments,
  journeySnapshot,
  journeyTapAction,
  type JourneyFlowState,
} from "../src/index.js";
import { rawItems } from "./fixtures.js";
import { journey, journeyMissions } from "./journey-fixtures.js";

const reduce = createJourneyFlowReducer(journey, journeyMissions, rawItems);
const act = (type: string, payload: EngineAction["payload"] = null): EngineAction => ({ type, payload });
const missionIds = journey.chapters.map((chapter) => chapter.missionId);
const moments = (before: JourneyFlowState, action: EngineAction) =>
  journeyMoments(journeySnapshot(before), journeySnapshot(reduce(before, action)), missionIds);
const start = () => reduce(createJourneyFlowState(journeyMissions), act(JOURNEY_ACTION.play));
const atCheckpoint = () => [journeyBeatEndedAction("look-1"), journeyBeatEndedAction("look-2")].reduce((state, action) => reduce(state, action), start());

describe("journey moments", () => {
  it("marks a chapter start, but not a beat change or a resume", () => {
    expect(moments(createJourneyFlowState(journeyMissions), act(JOURNEY_ACTION.play))).toEqual([{ kind: "chapter-start", chapterIndex: 0 }]);
    expect(moments(start(), journeyBeatEndedAction("look-1"))).toEqual([]);
    const paused = reduce(start(), act(JOURNEY_ACTION.pause));
    expect(moments(paused, act(JOURNEY_ACTION.play))).toEqual([]);
  });

  it("marks the checkpoint, a wrong answer and a hint", () => {
    const beforeCheckpoint = reduce(start(), journeyBeatEndedAction("look-1"));
    expect(moments(beforeCheckpoint, journeyBeatEndedAction("look-2"))).toEqual([{ kind: "checkpoint" }]);
    expect(moments(atCheckpoint(), journeyTapAction("cell:plant:vacuole"))).toEqual([{ kind: "wrong" }]);
    expect(moments(atCheckpoint(), act(JOURNEY_ACTION.hint))).toEqual([{ kind: "hint" }]);
  });

  it("marks a solved checkpoint together with its chapter", () => {
    expect(moments(atCheckpoint(), journeyTapAction("cell:plant:chloroplast"))).toEqual([
      { kind: "solved" },
      { kind: "chapter-complete", chapterIndex: 0, missionId: "m-look" },
    ]);
  });

  it("marks scored answers and the end of the journey", () => {
    const questions = [journeyTapAction("cell:plant:chloroplast"), act(JOURNEY_ACTION.continue), journeyBeatEndedAction("listen-1")]
      .reduce((state, action) => reduce(state, action), atCheckpoint());
    expect(moments(questions, act(LESSON_FLOW_ACTION.answer, { selectedOptionIndex: 2 }))).toEqual([{ kind: "answer", correct: true }]);
    const lastQuestions = [
      act(LESSON_FLOW_ACTION.answer, { selectedOptionIndex: 2 }),
      act(LESSON_FLOW_ACTION.continue),
      journeyBeatEndedAction("choose-1"),
      act(JOURNEY_ACTION.answer, { value: "mito" }),
      act(JOURNEY_ACTION.continue),
      act(LESSON_FLOW_ACTION.answer, { selectedOptionIndex: 0 }),
    ].reduce((state, action) => reduce(state, action), questions);
    expect(moments(lastQuestions, act(LESSON_FLOW_ACTION.continue))).toEqual([{ kind: "journey-complete" }]);
  });

  it("marks a replayed chapter as a new start", () => {
    expect(moments(atCheckpoint(), act(JOURNEY_ACTION.replayChapter))).toEqual([{ kind: "chapter-start", chapterIndex: 0 }]);
  });
});
