import { describe, expect, it } from "vitest";
import { lessonMomentSnapshot, missionMoments, playMomentSound, MISSION_CHORD } from "../src/lesson-moments.js";
import type { LessonFlowState } from "../src/lesson-flow.js";

const base: LessonFlowState = {
  mode: "mission",
  activeMissionId: "a",
  missionProgress: {
    a: { status: "active", attempts: 0, hintsUsed: 0 },
    b: { status: "locked", attempts: 0, hintsUsed: 0 },
  } as unknown as LessonFlowState["missionProgress"],
  assessmentIds: [],
  assessmentIndex: 0,
  currentAnswer: null,
  questionsAnswered: 0,
  questionsCorrect: 0,
};

describe("lesson moments", () => {
  it("snapshots the active mission, misses and the finish", () => {
    const snap = lessonMomentSnapshot(base, ["a", "b"]);
    expect(snap.missionIndex).toBe(0);
    expect(snap.finished).toBe(false);
    const done = lessonMomentSnapshot(
      {
        ...base,
        activeMissionId: null,
        missionProgress: {
          a: { status: "completed", attempts: 2, hintsUsed: 1 },
          b: { status: "completed", attempts: 1, hintsUsed: 0 },
        } as unknown as LessonFlowState["missionProgress"],
      },
      ["a", "b"],
    );
    expect(done).toMatchObject({ missionIndex: -1, completed: ["a", "b"], misses: 1, hints: 1, finished: true });
    expect(missionMoments(snap, done).map((moment) => moment.kind)).toEqual([
      "mission-complete",
      "mission-complete",
      "lesson-complete",
      "check-miss",
      "hint",
    ]);
  });

  it("plays each moment's sound", () => {
    const calls: string[] = [];
    const sound = {
      cue: (name: string) => calls.push(`cue:${name}`),
      chord: (midis: readonly number[]) => calls.push(`chord:${midis.join(",")}`),
      arrive: () => calls.push("arrive"),
    };
    playMomentSound(sound, { kind: "mission-complete", missionId: "a" });
    playMomentSound(sound, { kind: "answer", correct: false });
    playMomentSound(sound, { kind: "hint" });
    expect(calls).toEqual(["arrive", `chord:${MISSION_CHORD.join(",")}`, "cue:deny", "cue:open"]);
  });
});
