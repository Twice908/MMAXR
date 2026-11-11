import type { EngineAction } from "@mma/engine-core";
import { describe, expect, it } from "vitest";
import {
  JOURNEY_ACTION,
  JOURNEY_COMMAND,
  LESSON_COMMAND,
  LESSON_FLOW_ACTION,
  buildJourneyView,
  createJourneyFlowReducer,
  createJourneyFlowState,
  journeyBeatEndedAction,
  journeyCommandToAction,
  journeyTapAction,
  type JourneyFlowState,
} from "../src/index.js";
import { items, rawItems } from "./fixtures.js";
import { journey, journeyMissions } from "./journey-fixtures.js";

const reduce = createJourneyFlowReducer(journey, journeyMissions, rawItems);
const act = (type: string, payload: EngineAction["payload"] = null): EngineAction => ({ type, payload });
const run = (state: JourneyFlowState, ...actions: EngineAction[]) => actions.reduce((current, action) => reduce(current, action), state);
const view = (state: JourneyFlowState) => buildJourneyView(state, journey, journeyMissions, items);
const start = () => run(createJourneyFlowState(journeyMissions), act(JOURNEY_ACTION.play));
const atCheckpoint = () => run(start(), journeyBeatEndedAction("look-1"), journeyBeatEndedAction("look-2"));

describe("journey view", () => {
  it("offers only Start on the intro, with every chapter locked", () => {
    const intro = view(createJourneyFlowState(journeyMissions));
    expect(intro.controls).toEqual({ playPause: { label: "Start the journey", command: JOURNEY_COMMAND.play }, skip: null, replay: null });
    expect(intro.chapters.map((chapter) => chapter.state)).toEqual(["locked", "locked", "locked"]);
    expect(intro.beat).toBeNull();
    expect(intro.shot).toBeNull();
  });

  it("shows the playing beat, its shot and highlight, and carries the shot forward", () => {
    const first = view(start());
    expect(first.chapterLabel).toBe("CHAPTER 1 OF 3");
    expect(first.chapterTitle).toBe("Look around");
    expect(first.beat).toEqual({ id: "look-1", cueId: null, captionText: "Two cells float in front of you.", durationMs: 3000 });
    expect(first.shot).toBe("wide");
    expect(first.controls.playPause?.label).toBe("Pause");
    const second = view(reduce(start(), journeyBeatEndedAction("look-1")));
    expect(second.beat?.cueId).toBe("cue-look");
    expect(second.shot).toBe("wide");
    expect(second.highlight).toBe("cell:plant:chloroplast");
    expect(view(reduce(start(), act(JOURNEY_ACTION.pause))).controls.playPause?.label).toBe("Resume");
  });

  it("asks a tap checkpoint without giving the answer away, and explains wrong taps", () => {
    const asked = view(atCheckpoint());
    expect(asked.checkpoint).toMatchObject({ kind: "tap", prompt: "Tap a chloroplast.", options: [], solved: false, feedback: "", hintText: "" });
    expect(asked.highlight).toBeNull();
    expect(asked.controls.skip).toBeNull();
    expect(view(reduce(atCheckpoint(), journeyTapAction("cell:plant:vacuole"))).checkpoint?.feedback).toBe("That is the vacuole. It stores water.");
    expect(view(reduce(atCheckpoint(), journeyTapAction("cell:animal:nucleus"))).checkpoint?.feedback).toBe("Not that one. Look for the green parts.");
    const hinted = view(reduce(atCheckpoint(), act(JOURNEY_ACTION.hint)));
    expect(hinted.checkpoint?.hintText).toBe("Look left.");
    expect(hinted.checkpoint?.hint?.enabled).toBe(true);
  });

  it("explains the answer once solved, highlights it, and offers the next chapter", () => {
    const solved = view(reduce(atCheckpoint(), journeyTapAction("cell:plant:chloroplast")));
    expect(solved.checkpoint).toMatchObject({ solved: true, feedback: "Chloroplasts are green because of chlorophyll.", hint: null });
    expect(solved.checkpoint?.continue).toEqual({ label: "Next chapter", command: JOURNEY_COMMAND.continue });
    expect(solved.highlight).toBe("cell:plant:chloroplast");
    expect(solved.chapters.map((chapter) => chapter.state)).toEqual(["current", "open", "locked"]);
    expect(solved.progress).toBeCloseTo(100 / 3, 6);
  });

  it("shows choice options with their state, and the scored questions after", () => {
    const choosing = run(
      atCheckpoint(),
      journeyTapAction("cell:plant:chloroplast"),
      act(JOURNEY_ACTION.continue),
      journeyBeatEndedAction("listen-1"),
    );
    const questions = view(choosing);
    expect(questions.questions?.prompt).toBe("First question?");
    expect(questions.chapters.every((chapter) => chapter.command === null)).toBe(true);
    const choice = run(choosing, act(LESSON_FLOW_ACTION.answer, { selectedOptionIndex: 2 }), act(LESSON_FLOW_ACTION.continue), journeyBeatEndedAction("choose-1"), act(JOURNEY_ACTION.answer, { value: "wall" }));
    const wrong = view(choice);
    expect(wrong.checkpoint?.options.map((option) => [option.label, option.state])).toEqual([
      ["A. Mitochondrion", "idle"],
      ["B. Cell wall", "incorrect"],
    ]);
    expect(wrong.checkpoint?.feedback).toBe("The cell wall gives shape and support.");
    const right = view(reduce(choice, act(JOURNEY_ACTION.answer, { value: "mito" })));
    expect(right.checkpoint?.options[0]?.state).toBe("correct");
    expect(right.checkpoint?.continue?.label).toBe("Questions");
  });
});

describe("journey commands", () => {
  it("maps buttons, chapter jumps, choice answers and question commands to actions", () => {
    expect(journeyCommandToAction(JOURNEY_COMMAND.play)).toEqual(act(JOURNEY_ACTION.play));
    expect(journeyCommandToAction(JOURNEY_COMMAND.replay)).toEqual(act(JOURNEY_ACTION.replayChapter));
    expect(journeyCommandToAction(`${JOURNEY_COMMAND.chapterPrefix}2`)).toEqual(act(JOURNEY_ACTION.goToChapter, { chapterIndex: 2 }));
    expect(journeyCommandToAction(`${JOURNEY_COMMAND.answerPrefix}mito`)).toEqual(act(JOURNEY_ACTION.answer, { value: "mito" }));
    expect(journeyCommandToAction(`${LESSON_COMMAND.answerPrefix}1`)).toEqual(act(LESSON_FLOW_ACTION.answer, { selectedOptionIndex: 1 }));
    expect(journeyCommandToAction(LESSON_COMMAND.continue)).toEqual(act(LESSON_FLOW_ACTION.continue));
    expect(journeyCommandToAction(LESSON_COMMAND.check)).toBeNull();
    expect(journeyCommandToAction("module:zoom")).toBeNull();
  });
});
