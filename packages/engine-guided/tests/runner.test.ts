import { describe, expect, it } from "vitest";
import { ESLint } from "eslint";
import {
  createGuidedState,
  reduceGuidedExperience,
  type ExperienceDefinition,
  type GuidedAction,
} from "../src/index.js";

const toyExperience: ExperienceDefinition = {
  id: "counter-walkthrough",
  steps: [
    { id: "intro", type: "narrate", hints: ["intro-nudge", "intro-clue", "intro-explanation"] },
    {
      id: "prediction",
      type: "predict",
      options: ["two", "three"],
      correctOptionId: "three",
      hints: ["prediction-nudge", "prediction-clue", "prediction-explanation"],
    },
    {
      id: "adjust",
      type: "manipulate",
      goal: { count: 3 },
      hints: ["adjust-nudge", "adjust-clue", "adjust-explanation"],
    },
    {
      id: "measurement",
      type: "measure",
      expected: 3,
      tolerance: 0,
      unit: "items",
      hints: ["measurement-nudge", "measurement-clue", "measurement-explanation"],
    },
    {
      id: "observations",
      type: "table",
      requiredRows: [
        { id: "first", accepted: { kind: "one_of", values: ["one"] } },
        { id: "second", accepted: { kind: "number", expected: 3, tolerance: 0 } },
      ],
      hints: ["table-nudge", "table-clue", "table-explanation"],
    },
    {
      id: "summary",
      type: "conclude",
      options: ["incorrect", "correct"],
      correctOptionId: "correct",
      hints: ["summary-nudge", "summary-clue", "summary-explanation"],
    },
    {
      id: "review",
      type: "check",
      assessmentIds: ["counter-check"],
      hints: ["review-nudge", "review-clue", "review-explanation"],
    },
    {
      id: "extra-practice",
      type: "narrate",
      level: "extended",
      hints: ["extra-nudge", "extra-clue", "extra-explanation"],
    },
  ],
};

function send(
  state: ReturnType<typeof createGuidedState>,
  action: GuidedAction,
): ReturnType<typeof reduceGuidedExperience> {
  return reduceGuidedExperience(toyExperience, state, action, () => 42);
}

function run(actions: readonly GuidedAction[]) {
  let state = createGuidedState(toyExperience);
  const events = [];
  for (const action of actions) {
    const transition = send(state, action);
    state = transition.state;
    events.push(...transition.events);
  }
  return { state, events };
}

describe("guided experience runner", () => {
  it("completes a subject-neutral walkthrough", () => {
    const { state, events } = run([
      { type: "start", level: "basic" },
      { type: "continue" },
      { type: "answerPrediction", optionId: "two" },
      { type: "evaluateManipulation", moduleState: { count: 2 } },
      { type: "evaluateManipulation", moduleState: { count: 3, note: "ignored" } },
      { type: "submitMeasurement", value: 3 },
      { type: "fillTableRow", rowId: "first", value: "one" },
      { type: "fillTableRow", rowId: "second", value: 3 },
      { type: "answerConclusion", optionId: "correct" },
      { type: "continue" },
    ]);

    expect(state.currentStepId).toBeNull();
    expect(state.completedCount).toBe(7);
    expect(state.completedAt).toBe(42);
    expect(state.predictions).toEqual({ prediction: "two" });
    expect(state.measurements).toEqual({ measurement: 3 });
    expect(state.tableRows).toEqual({ observations: { first: "one", second: 3 } });
    expect(events.map(({ type }) => type)).toContain("experience_completed");
    expect(events.find(({ type }) => type === "prediction_made")).toMatchObject({
      payload: { correct: false },
    });
  });

  it("keeps incorrect submissions active and counts explicit attempts", () => {
    let state = send(createGuidedState(toyExperience), { type: "start", level: "basic" }).state;
    state = send(state, { type: "continue" }).state;
    state = send(state, { type: "answerPrediction", optionId: "two" }).state;
    const wrong = send(state, { type: "evaluateManipulation", moduleState: { count: 2 } });

    expect(wrong.state.currentStepId).toBe("adjust");
    expect(wrong.state.steps.adjust?.status).toBe("active");
    expect(wrong.state.steps.adjust?.attempts).toBe(1);
    const correct = send(wrong.state, {
      type: "evaluateManipulation",
      moduleState: { count: 3 },
    });
    expect(correct.state.steps.adjust?.attempts).toBe(2);
    expect(correct.state.steps.adjust?.status).toBe("done");
  });

  it("uses hints in order and remains on the final hint", () => {
    let state = send(createGuidedState(toyExperience), { type: "start", level: "basic" }).state;
    const levels: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      const transition = send(state, { type: "useHint" });
      state = transition.state;
      levels.push(transition.events[0]?.type === "hint_used" ? transition.events[0].payload.hintLevel : "");
    }

    expect(levels).toEqual(["nudge", "clue", "explanation", "explanation", "explanation"]);
    expect(state.steps.intro?.hintsUsed).toBe(3);
  });

  it("does not let an incorrect prediction block progress", () => {
    let state = send(createGuidedState(toyExperience), { type: "start", level: "basic" }).state;
    state = send(state, { type: "continue" }).state;
    const transition = send(state, { type: "answerPrediction", optionId: "two" });

    expect(transition.state.currentStepId).toBe("adjust");
    expect(transition.state.steps.prediction?.status).toBe("done");
  });

  it("skips steps outside the selected level", () => {
    const basic = run([{ type: "start", level: "basic" }]);
    const extended = run([{ type: "start", level: "extended" }]);

    expect(basic.state.currentStepId).toBe("intro");
    expect(extended.state.currentStepId).toBe("intro");
    let basicState = basic.state;
    let extendedState = extended.state;
    for (const action of [
      { type: "continue" },
      { type: "answerPrediction", optionId: "three" },
      { type: "evaluateManipulation", moduleState: { count: 3 } },
      { type: "submitMeasurement", value: 3 },
      { type: "fillTableRow", rowId: "first", value: "one" },
      { type: "fillTableRow", rowId: "second", value: 3 },
      { type: "answerConclusion", optionId: "correct" },
      { type: "continue" },
    ] satisfies readonly GuidedAction[]) {
      basicState = send(basicState, action).state;
      extendedState = send(extendedState, action).state;
    }
    expect(basicState.currentStepId).toBeNull();
    expect(extendedState.currentStepId).toBe("extra-practice");
  });

  it("freezes progression in playground and returns to the exact step", () => {
    let state = send(createGuidedState(toyExperience), { type: "start", level: "basic" }).state;
    const entered = send(state, { type: "enterPlayground" });
    const blocked = send(entered.state, { type: "continue" });

    expect(blocked.state).toBe(entered.state);
    expect(blocked.reason).toBe("wrong_mode");
    expect(blocked.state.currentStepId).toBe("intro");
    state = send(blocked.state, { type: "returnToGuided" }).state;
    expect(state.mode).toBe("guided");
    expect(state.currentStepId).toBe("intro");
  });

  it("restores snapshots exactly", () => {
    const snapshot = send(createGuidedState(toyExperience), { type: "start", level: "basic" }).state;
    const restored = send(createGuidedState(toyExperience), { type: "restore", snapshot });
    expect(restored.state).toBe(snapshot);
  });

  it("produces identical state and events from the same actions", () => {
    const actions: GuidedAction[] = [
      { type: "start", level: "basic" },
      { type: "continue" },
      { type: "answerPrediction", optionId: "three" },
    ];
    expect(run(actions)).toEqual(run(actions));
  });

  it("rejects forbidden package imports through the lint rule", async () => {
    const eslint = new ESLint();
    const [result] = await eslint.lintText(
      'import { forbidden } from "@mma/kit-chemistry";\nvoid forbidden;\n',
      { filePath: "packages/engine-guided/src/boundary-probe.ts" },
    );

    expect(result?.messages.some(({ ruleId }) => ruleId === "no-restricted-imports")).toBe(true);
  });
});
