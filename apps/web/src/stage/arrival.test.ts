import { describe, expect, it } from "vitest";
import { arrivalCues, captionFor, createArrivalLog, SHORT_ARRIVAL_FROM } from "./arrival.js";
import { arrivalFor } from "./theme.js";

const script = arrivalFor("chem.atom-builder");

describe("module arrival", () => {
  it("has descents for Atom Builder and Ionic Bonding (two atoms), not Ohm's Law yet", () => {
    expect(script).not.toBeNull();
    expect(arrivalFor("chem.ionic-bonding")?.secondShells).toEqual([2, 8, 7]);
    expect(arrivalFor("phys.ohms-law")).toBeNull();
  });

  it("steps through every status line in order, then welcomes", () => {
    if (!script) throw new Error("missing script");
    const seen: string[] = [];
    for (let progress = 0; progress <= 1.0001; progress += 0.01) {
      const line = captionFor(script, progress, false);
      if (seen[seen.length - 1] !== line) seen.push(line);
    }
    expect(seen).toEqual([...script.lines, script.welcome]);
  });

  it("uses the short lines and a welcome back on later visits", () => {
    if (!script) throw new Error("missing script");
    expect(captionFor(script, SHORT_ARRIVAL_FROM, true)).toBe(script.shortLines[0]);
    expect(captionFor(script, 1, true)).toBe(script.welcomeBack);
  });

  it("scores the descent in order and always lands", () => {
    if (!script) throw new Error("missing script");
    for (const short of [false, true]) {
      const cues = arrivalCues(script, short);
      const times = cues.map((cue) => cue.at);
      expect([...times].sort((a, b) => a - b)).toEqual(times);
      expect(cues[cues.length - 1]?.kind).toBe("arrive");
      if (short) expect(times.every((at) => at > SHORT_ARRIVAL_FROM)).toBe(true);
    }
    expect(arrivalCues(script, false).length).toBeGreaterThan(arrivalCues(script, true).length);
  });

  it("remembers first visits per student and module, even without storage", () => {
    const store = new Map<string, string>();
    const log = createArrivalLog({ getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) });
    expect(log.seen("stu_a", "chem.atom-builder")).toBe(false);
    log.mark("stu_a", "chem.atom-builder");
    expect(log.seen("stu_a", "chem.atom-builder")).toBe(true);
    expect(log.seen("stu_b", "chem.atom-builder")).toBe(false);
    expect(createArrivalLog({ getItem: (key) => store.get(key) ?? null, setItem: () => undefined }).seen("stu_a", "chem.atom-builder")).toBe(true);

    const offline = createArrivalLog(null);
    offline.mark("stu_a", "chem.atom-builder");
    expect(offline.seen("stu_a", "chem.atom-builder")).toBe(true);
  });
});
