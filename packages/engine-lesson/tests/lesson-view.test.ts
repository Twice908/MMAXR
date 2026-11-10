import { describe, expect, it } from "vitest";
import {
  buildLessonView,
  createLessonFlowReducer,
  createLessonFlowState,
  lessonCommandToAction,
  type LessonFlowState,
  type LessonViewCopy,
} from "../src/index.js";
import { items, missions, rawItems } from "./fixtures.js";

const copy: LessonViewCopy = {
  idleEyebrow: "COUNTER",
  freePlayTitle: "Count freely",
  freePlayBody: "Press plus or minus.",
  notYetFeedback: "Not yet.",
};
const reducer = createLessonFlowReducer(missions, rawItems);

function run(...actions: { type: string; payload: unknown }[]): LessonFlowState {
  return actions.reduce<LessonFlowState>(
    (state, action) => reducer<LessonFlowState>(state, action as never),
    createLessonFlowState(missions),
  );
}

const start = { type: "mission/start", payload: { missionId: "reach-three" } };
const view = (state: LessonFlowState, hint = "") => buildLessonView(state, missions, items, hint, copy);

describe("lesson view", () => {
  it("uses the module's idle eyebrow before a mission starts", () => {
    expect(view(run())).toMatchObject({ eyebrow: "COUNTER", title: "Getting ready", body: "", hint: null, check: null });
  });

  it("shows the active mission with Hint, Check and Free play", () => {
    expect(view(run(start))).toMatchObject({
      eyebrow: "MISSION 1 OF 2",
      title: "Reach three",
      body: "Set the counter to 3.",
      progress: 0,
      feedback: "",
      hint: { label: "Hint", command: "lesson:hint", enabled: true },
      check: { label: "Check", command: "lesson:check", enabled: true },
      freePlay: { label: "Free play", command: "lesson:free-play" },
      assessment: null,
    });
  });

  it("shows hint text and then the module's not-yet feedback", () => {
    const hinted = run(start, { type: "mission/hint", payload: null });
    expect(view(hinted, "Count up.").feedback).toBe("nudge: Count up.");
    const wrong = run(start, { type: "mission/check", payload: { state: { count: 1 } } });
    expect(view(wrong).feedback).toBe("Not yet.");
  });

  it("shows the triggered question, then marks the chosen and correct options", () => {
    const done = [start, { type: "mission/check", payload: { state: { count: 3 } } }];
    const asking = view(run(...done));
    expect(asking.feedback).toBe("Goal met. Answer the questions to continue.");
    expect(asking.progress).toBe(50);
    expect(asking.assessment).toMatchObject({ step: "QUESTION 1 OF 2", prompt: "First question?", continueLabel: null });
    expect(asking.assessment?.options[0]).toEqual({
      label: "A. One",
      command: "lesson:assessment:answer:0",
      state: "idle",
      disabled: false,
    });

    const answered = view(run(...done, { type: "assessment/answer", payload: { selectedOptionIndex: 0 } }));
    expect(answered.assessment?.options.map((option) => option.state)).toEqual(["incorrect", "idle", "answer", "idle"]);
    expect(answered.assessment?.feedback).toBe("Not quite. The correct answer is Three. Three is right.");
    expect(answered.assessment?.continueLabel).toBe("Next question");
  });

  it("summarises a finished lesson and shows free play copy", () => {
    const finished = run(
      start,
      { type: "mission/check", payload: { state: { count: 3 } } },
      { type: "assessment/answer", payload: { selectedOptionIndex: 2 } },
      { type: "assessment/continue", payload: null },
      { type: "assessment/answer", payload: { selectedOptionIndex: 0 } },
      { type: "assessment/continue", payload: null },
      { type: "mission/check", payload: { state: { count: 0 } } },
      { type: "assessment/answer", payload: { selectedOptionIndex: 0 } },
      { type: "assessment/continue", payload: null },
    );
    expect(view(finished)).toMatchObject({
      eyebrow: "LESSON COMPLETE",
      title: "Well done",
      body: "2 missions done. 0 hints used. 2 questions correct out of 3.",
      progress: 100,
      hint: null,
      check: null,
    });
    expect(view(run(start, { type: "mode/free-play", payload: null }))).toMatchObject({
      eyebrow: "FREE PLAY",
      title: "Count freely",
      body: "Press plus or minus.",
      freePlay: null,
    });
  });
});

describe("lesson commands", () => {
  it("maps lesson buttons to lesson actions and leaves module commands alone", () => {
    const checkState = () => ({ count: 3 });
    expect(lessonCommandToAction("lesson:hint", checkState)).toEqual({ type: "mission/hint", payload: null });
    expect(lessonCommandToAction("lesson:check", checkState)).toEqual({ type: "mission/check", payload: { state: { count: 3 } } });
    expect(lessonCommandToAction("lesson:free-play", checkState)).toEqual({ type: "mode/free-play", payload: null });
    expect(lessonCommandToAction("lesson:assessment:continue", checkState)).toEqual({ type: "assessment/continue", payload: null });
    expect(lessonCommandToAction("lesson:assessment:answer:3", checkState)).toEqual({
      type: "assessment/answer",
      payload: { selectedOptionIndex: 3 },
    });
    expect(lessonCommandToAction("lesson:assessment:answer:4", checkState)).toBeNull();
    expect(lessonCommandToAction("particle:add:proton", checkState)).toBeNull();
  });
});
