import type { Soundscape } from "@mma/engine-ambience";
import { describe, expect, it, vi } from "vitest";
import { FINISHED_MOOD, INTRO_MOOD, chapterMood, momentSounds, playSteps } from "../src/sound.js";

describe("chapter moods", () => {
  it("gives every chapter its own chord, brighter as the journey goes on", () => {
    const moods = ["two-cells", "mitochondria", "chloroplasts", "recap"].map(chapterMood);
    expect(new Set(moods.map((mood) => JSON.stringify(mood))).size).toBe(4);
    const brightness = moods.map((mood) => mood.brightness);
    expect([...brightness].sort((a, b) => a - b)).toEqual(brightness);
    expect(FINISHED_MOOD.brightness).toBeGreaterThan(brightness[3] as number);
    expect(chapterMood(null)).toEqual(INTRO_MOOD);
    expect(chapterMood("unknown")).toEqual(INTRO_MOOD);
  });
});

describe("moment sounds", () => {
  it("answers right and wrong with confirm and deny", () => {
    expect(momentSounds({ kind: "solved" })).toEqual([{ kind: "cue", name: "confirm" }]);
    expect(momentSounds({ kind: "wrong" })).toEqual([{ kind: "cue", name: "deny" }]);
    expect(momentSounds({ kind: "answer", correct: true })).toEqual([{ kind: "cue", name: "confirm" }]);
    expect(momentSounds({ kind: "answer", correct: false })).toEqual([{ kind: "cue", name: "deny" }]);
    expect(momentSounds({ kind: "hint" })).toEqual([{ kind: "cue", name: "open" }]);
  });

  it("leaves the first chapter start to the fly-in, and rings later chapter starts", () => {
    expect(momentSounds({ kind: "chapter-start", chapterIndex: 0 })).toEqual([]);
    expect(momentSounds({ kind: "chapter-start", chapterIndex: 2 })[0]?.kind).toBe("chord");
  });

  it("lands with a chord when a chapter or the journey is complete, longer at the end", () => {
    const chapter = momentSounds({ kind: "chapter-complete", chapterIndex: 1, missionId: "m" });
    const journey = momentSounds({ kind: "journey-complete" });
    expect(chapter[0]).toEqual({ kind: "arrive" });
    const notes = (steps: typeof chapter) => (steps[1]?.kind === "chord" ? steps[1].midis.length : 0);
    expect(notes(journey)).toBeGreaterThan(notes(chapter));
  });

  it("plays steps on the soundscape, and does nothing without one", () => {
    const sound = { cue: vi.fn(), chord: vi.fn(), sweep: vi.fn(), arrive: vi.fn() } as unknown as Soundscape;
    playSteps(sound, [
      { kind: "cue", name: "select" },
      { kind: "chord", midis: [72, 76], spreadSeconds: 0.1, gain: 0.03 },
      { kind: "sweep", name: "dive", seconds: 1.8 },
      { kind: "arrive" },
    ]);
    expect(sound.cue).toHaveBeenCalledWith("select", {});
    expect(sound.chord).toHaveBeenCalledWith([72, 76], { spreadSeconds: 0.1, gain: 0.03 });
    expect(sound.sweep).toHaveBeenCalledWith("dive", 1.8);
    expect(sound.arrive).toHaveBeenCalledOnce();
    expect(() => playSteps(undefined, [{ kind: "arrive" }])).not.toThrow();
  });
});
