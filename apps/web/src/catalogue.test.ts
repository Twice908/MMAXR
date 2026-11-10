import { describe, expect, it } from "vitest";
import { SUBJECTS, findExperiment, groupBySubject, type Experiment } from "./catalogue.js";
import { experiments } from "./experiments.js";

function fake(id: string, subject: string): Experiment {
  return {
    id,
    subject,
    title: id,
    estimatedMinutes: 5,
    releaseStatus: "draft",
    load: () => Promise.reject(new Error("not used")),
  };
}

describe("groupBySubject", () => {
  it("lists every subject in order, even those without experiments", () => {
    const sections = groupBySubject([fake("c1", "chemistry")]);
    expect(sections.map((section) => section.subject.id)).toEqual(["physics", "chemistry", "biology"]);
    expect(sections.map((section) => section.experiments.length)).toEqual([0, 1, 0]);
  });

  it("keeps the given order inside a subject and ignores unknown subjects", () => {
    const sections = groupBySubject([fake("p2", "physics"), fake("x", "maths"), fake("p1", "physics")]);
    expect(sections[0]?.experiments.map((experiment) => experiment.id)).toEqual(["p2", "p1"]);
    expect(sections.flatMap((section) => section.experiments)).toHaveLength(2);
  });
});

describe("findExperiment", () => {
  it("finds by id", () => {
    const list = [fake("a", "physics"), fake("b", "biology")];
    expect(findExperiment(list, "b")?.id).toBe("b");
    expect(findExperiment(list, "z")).toBeUndefined();
  });
});

describe("registered experiments", () => {
  it("have unique ids and a subject the dashboard shows", () => {
    const ids = experiments.map((experiment) => experiment.id);
    expect(new Set(ids).size).toBe(ids.length);
    const subjectIds = SUBJECTS.map((subject) => subject.id);
    for (const experiment of experiments) {
      expect(subjectIds).toContain(experiment.subject);
    }
  });

  it("lists Atom Builder under chemistry", () => {
    expect(experiments.find((experiment) => experiment.id === "chem.atom-builder")?.subject).toBe("chemistry");
  });
});
