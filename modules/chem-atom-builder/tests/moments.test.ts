import { describe, expect, it } from "vitest";
import { ionBadge, missionMoments, type MomentSnapshot } from "../src/moments.js";

const base: MomentSnapshot = { missionIndex: 0, completed: [], misses: 0, hints: 0, answered: 0, correct: 0, finished: false, charge: 0 };

describe("mission moments", () => {
  it("celebrates a newly completed mission once", () => {
    const next = { ...base, completed: ["build-carbon-12"] };
    expect(missionMoments(base, next)).toEqual([{ kind: "mission-complete", missionId: "build-carbon-12" }]);
    expect(missionMoments(next, next)).toEqual([]);
  });

  it("marks answers, missed checks, hints and the end of the lesson", () => {
    expect(missionMoments(base, { ...base, answered: 1, correct: 1 })).toEqual([{ kind: "answer", correct: true }]);
    expect(missionMoments(base, { ...base, answered: 1 })).toEqual([{ kind: "answer", correct: false }]);
    expect(missionMoments(base, { ...base, misses: 1 })).toEqual([{ kind: "check-miss" }]);
    expect(missionMoments(base, { ...base, hints: 1 })).toEqual([{ kind: "hint" }]);
    expect(missionMoments(base, { ...base, finished: true })).toEqual([{ kind: "lesson-complete" }]);
  });

  it("marks an atom becoming an ion, not every later change", () => {
    expect(missionMoments(base, { ...base, charge: 1 })).toEqual([{ kind: "ion", charge: 1 }]);
    expect(missionMoments({ ...base, charge: 1 }, { ...base, charge: 2 })).toEqual([]);
    expect(missionMoments({ ...base, charge: 1 }, { ...base, charge: -1 })).toEqual([{ kind: "ion", charge: -1 }]);
  });

  it("writes ion badges with a raised charge and a plain reason", () => {
    expect(ionBadge("Na", 1)).toEqual({ label: "Na⁺", detail: "Positive ion: 1 electron lost" });
    expect(ionBadge("Cl", -1)).toEqual({ label: "Cl⁻", detail: "Negative ion: 1 electron gained" });
    expect(ionBadge("Mg", 2)?.label).toBe("Mg²⁺");
    expect(ionBadge("C", 0)).toBeNull();
    expect(ionBadge(undefined, 1)).toBeNull();
  });
});
