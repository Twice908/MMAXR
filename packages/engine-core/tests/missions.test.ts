import { describe, expect, it } from "vitest";
import {
  createMissionProgress,
  evaluateMission,
  failMission,
  requestMissionHint,
  startMission,
  type MissionDefinition,
} from "../src/missions.js";

const mission: MissionDefinition = {
  id: "make-na-ion",
  title: "Make Na+",
  goalText: "Build a sodium ion with a +1 charge.",
  goal: { symbol: "Na", charge: 1 },
  hints: ["Think about sodium's electrons.", "A +1 ion has lost an electron.", "Remove one electron."],
  onComplete: { triggerAssessments: ["assess.atom.ions.02", "assess.atom.ions.03"] },
};

describe("mission evaluation", () => {
  it("completes on a partial-state match and emits its linked assessment ID", () => {
    const started = startMission(mission, createMissionProgress());
    const result = evaluateMission(
      mission,
      { symbol: "Na", charge: 1, protons: 11, electrons: 10 },
      started.progress,
    );

    expect(started.event).toEqual({
      type: "mission_started",
      payload: { missionId: mission.id },
    });
    expect(result.progress).toEqual({ status: "completed", attempts: 1, hintsUsed: 0 });
    expect(result.assessmentIds).toEqual(["assess.atom.ions.02", "assess.atom.ions.03"]);
    expect(result.event).toEqual({
      type: "mission_completed",
      payload: {
        missionId: mission.id,
        attempts: 1,
        hintsUsed: 0,
        assessmentIds: ["assess.atom.ions.02", "assess.atom.ions.03"],
      },
    });
  });

  it("counts each explicit check without failing on a wrong state", () => {
    const started = startMission(mission);
    const firstCheck = evaluateMission(mission, { symbol: "Na", charge: 0 }, started.progress);
    const secondCheck = evaluateMission(mission, { symbol: "Na", charge: 0 }, firstCheck.progress);

    expect(firstCheck.progress).toEqual({ status: "active", attempts: 1, hintsUsed: 0 });
    expect(firstCheck.event).toBeUndefined();
    expect(secondCheck.progress).toEqual({ status: "active", attempts: 2, hintsUsed: 0 });
    expect(secondCheck.event).toBeUndefined();
  });

  it("advances hints through nudge, clue, and explanation, then stops", () => {
    let progress = startMission(mission).progress;
    const levels = [];
    for (let index = 0; index < 3; index += 1) {
      const result = requestMissionHint(mission, progress);
      progress = result.progress;
      levels.push(result.hint?.level);
    }
    const exhausted = requestMissionHint(mission, progress);

    expect(levels).toEqual(["nudge", "clue", "explanation"]);
    expect(progress.hintsUsed).toBe(3);
    expect(exhausted.hint).toBeUndefined();
    expect(exhausted.progress).toEqual(progress);
  });

  it("fails only through an explicit give-up or module-limit transition", () => {
    const started = startMission(mission);
    const wrongCheck = evaluateMission(mission, { symbol: "Na", charge: 0 }, started.progress);
    const failed = failMission(mission, wrongCheck.progress, "limit_reached");

    expect(wrongCheck.progress.status).toBe("active");
    expect(failed.progress).toEqual({ status: "failed", attempts: 1, hintsUsed: 0 });
    expect(failed.event).toEqual({
      type: "mission_failed",
      payload: {
        missionId: mission.id,
        attempts: 1,
        hintsUsed: 0,
        reason: "limit_reached",
      },
    });
  });
});