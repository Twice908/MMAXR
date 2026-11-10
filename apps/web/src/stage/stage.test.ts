import { hexToRgb } from "@mma/engine-ambience";
import { describe, expect, it } from "vitest";
import { experiments } from "../experiments.js";
import { SUBJECTS } from "../catalogue.js";
import { DASHBOARD_PALETTE, planetLook, PLANET_IDS, systemLook } from "./theme.js";
import { sameRoute, transitionFor } from "./transitions.js";

describe("page transitions", () => {
  it("opens from black on the first page", () => {
    expect(transitionFor(null, { name: "login" })).toEqual({ kind: "open" });
    expect(transitionFor(null, { name: "experiment", id: "chem.atom-builder" })).toEqual({ kind: "open" });
  });

  it("launches to the dashboard after sign-in and departs on sign-out", () => {
    expect(transitionFor({ name: "login" }, { name: "dashboard" })).toEqual({ kind: "launch" });
    expect(transitionFor({ name: "dashboard" }, { name: "login" })).toEqual({ kind: "depart" });
  });

  it("dives into a planet and surfaces from the same one", () => {
    expect(transitionFor({ name: "dashboard" }, { name: "experiment", id: "phys.ohms-law" })).toEqual({
      kind: "dive",
      experimentId: "phys.ohms-law",
    });
    expect(transitionFor({ name: "experiment", id: "phys.ohms-law" }, { name: "dashboard" })).toEqual({
      kind: "surface",
      experimentId: "phys.ohms-law",
    });
  });

  it("crossfades anything else", () => {
    expect(transitionFor({ name: "experiment", id: "a" }, { name: "login" })).toEqual({ kind: "fade" });
    expect(transitionFor({ name: "experiment", id: "a" }, { name: "experiment", id: "b" })).toEqual({ kind: "fade" });
  });

  it("compares routes by page and experiment id", () => {
    expect(sameRoute({ name: "dashboard" }, { name: "dashboard" })).toBe(true);
    expect(sameRoute({ name: "experiment", id: "a" }, { name: "experiment", id: "a" })).toBe(true);
    expect(sameRoute({ name: "experiment", id: "a" }, { name: "experiment", id: "b" })).toBe(false);
    expect(sameRoute({ name: "login" }, { name: "dashboard" })).toBe(false);
  });
});

describe("cosmic theme", () => {
  it("gives every listed experiment its own planet, and no planet without an experiment", () => {
    const ids = experiments.map((experiment) => experiment.id).sort();
    expect([...PLANET_IDS].sort()).toEqual(ids);
  });

  it("uses valid colours and distinct palettes and notes for each planet", () => {
    const notes = new Set<number>();
    const glows = new Set<string>();
    for (const id of PLANET_IDS) {
      const look = planetLook(id);
      for (const colour of [...look.planet.colors, look.planet.atmosphere, ...Object.values(look.palette)]) {
        expect(() => hexToRgb(colour)).not.toThrow();
      }
      notes.add(look.note);
      glows.add(look.palette.glow);
      expect(look.palette.glow).not.toBe(DASHBOARD_PALETTE.glow);
    }
    expect(notes.size).toBe(PLANET_IDS.length);
    expect(glows.size).toBe(PLANET_IDS.length);
  });

  it("keeps space dark enough behind text", () => {
    for (const id of PLANET_IDS) {
      const deep = hexToRgb(planetLook(id).palette.deep);
      expect(Math.max(...deep)).toBeLessThan(0.12);
    }
  });

  it("has a star for every subject and a fallback for new ones", () => {
    for (const subject of SUBJECTS) {
      expect(() => hexToRgb(systemLook(subject.id).star.edge)).not.toThrow();
    }
    expect(systemLook("astronomy").size).toBeGreaterThan(0);
    expect(planetLook("unknown.module").size).toBeGreaterThan(0);
  });
});
