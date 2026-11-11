import { describe, expect, it } from "vitest";
import { clamp01, damp, ease, tween, zoomBetween } from "../src/motion.js";
import { midiToHz, moodNotes, nextShimmer, padCutoffHz, PAD_VOICES, seededRandom } from "../src/music.js";
import { hexToRgb, mixPalette, mixRgb, mixVivid, paletteGradient, rgbToHex } from "../src/palette.js";
import { createSwitchPreference, guessQuality, pixelRatioCap } from "../src/preference.js";
import { coverRadius, orbitThrough, rectToWorld, visibleHeightAt, worldToUv } from "../src/space-math.js";

describe("palette", () => {
  it("round-trips hex colours", () => {
    expect(hexToRgb("#ff8000")).toEqual([1, 128 / 255, 0]);
    expect(rgbToHex([1, 128 / 255, 0])).toBe("#ff8000");
    expect(rgbToHex([2, -1, 0.5])).toBe("#ff0080");
  });

  it("rejects colours that are not #rrggbb", () => {
    expect(() => hexToRgb("red")).toThrow(/#12ab9f/);
    expect(() => hexToRgb("#fff")).toThrow();
  });

  it("blends palettes channel by channel", () => {
    const a = { deep: "#000000", mid: "#000000", glow: "#ffffff", accent: "#ff0000" };
    const b = { deep: "#ffffff", mid: "#ffffff", glow: "#000000", accent: "#0000ff" };
    expect(mixPalette(a, b, 0)).toEqual(a);
    expect(mixPalette(a, b, 1)).toEqual(b);
    expect(mixPalette(a, b, 0.5).accent).toBe("#800080");
  });

  it("keeps a hue change colourful instead of passing through grey", () => {
    const blue = hexToRgb("#2f6fe0");
    const orange = hexToRgb("#f06a1a");
    const chroma = (c: readonly number[]): number => Math.max(...c) - Math.min(...c);
    const plain = mixRgb(blue, orange, 0.5);
    const vivid = mixVivid(blue, orange, 0.5);
    expect(chroma(vivid)).toBeGreaterThan(chroma(plain));
    // Close to the average colourfulness of the two ends (clamping may trim a little).
    expect(chroma(vivid)).toBeGreaterThan(((chroma(blue) + chroma(orange)) / 2) * 0.85);
    expect(mixVivid(blue, orange, 0)).toEqual(blue);
    const end = mixVivid(blue, orange, 1);
    end.forEach((channel, index) => expect(channel).toBeCloseTo(orange[index] ?? 0, 10));
  });

  it("builds a CSS gradient from the palette colours", () => {
    const gradient = paletteGradient({ deep: "#010203", mid: "#040506", glow: "#070809", accent: "#0a0b0c" });
    expect(gradient).toContain("#070809");
    expect(gradient).toContain("#010203");
  });
});

describe("motion", () => {
  it("keeps easing curves pinned at 0 and 1", () => {
    for (const curve of Object.values(ease)) {
      expect(curve(0)).toBeCloseTo(0, 6);
      expect(curve(1)).toBeCloseTo(1, 6);
      expect(curve(-1)).toBeCloseTo(0, 6);
      expect(curve(2)).toBeCloseTo(1, 6);
    }
    expect(ease.inOutCubic(0.5)).toBeCloseTo(0.5, 6);
    expect(clamp01(0.3)).toBe(0.3);
  });

  it("damps the same way at any frame rate", () => {
    const oneStep = damp(0, 1, 4, 0.1);
    let twoSteps = damp(0, 1, 4, 0.05);
    twoSteps = damp(twoSteps, 1, 4, 0.05);
    expect(oneStep).toBeCloseTo(twoSteps, 10);
    expect(damp(5, 1, 4, 0)).toBe(5);
  });

  it("zooms in log space so each step looks the same size", () => {
    expect(zoomBetween(1, 100, 0.5)).toBeCloseTo(10, 10);
    expect(zoomBetween(2, 8, 0)).toBe(2);
    expect(zoomBetween(2, 8, 1)).toBeCloseTo(8, 10);
  });

  it("runs a tween frame by frame and resolves at the end", async () => {
    let clock = 0;
    const frames: (() => void)[] = [];
    const seen: number[] = [];
    const running = tween({
      durationMs: 100,
      onUpdate: (t) => seen.push(t),
      now: () => clock,
      requestFrame: (callback) => frames.push(callback),
      cancelFrame: () => undefined,
    });
    clock = 50;
    frames.shift()?.();
    clock = 120;
    frames.shift()?.();
    await running.done;
    expect(seen).toEqual([0, 0.5, 1]);
  });

  it("jumps to the end when the duration is zero, and cancel resolves", async () => {
    const seen: number[] = [];
    await tween({ durationMs: 0, onUpdate: (t) => seen.push(t) }).done;
    expect(seen).toEqual([1]);

    const cancelled = tween({
      durationMs: 100,
      onUpdate: () => undefined,
      now: () => 0,
      requestFrame: () => 1,
      cancelFrame: () => undefined,
    });
    cancelled.cancel();
    await expect(cancelled.done).resolves.toBeUndefined();
  });
});

describe("space math", () => {
  const viewport = { width: 800, height: 600 };

  it("puts an element's centre at the matching world point", () => {
    const height = visibleHeightAt(40, 10);
    const centred = rectToWorld({ left: 350, top: 250, width: 100, height: 100 }, viewport, 40, 10);
    expect(centred.x).toBeCloseTo(0, 10);
    expect(centred.y).toBeCloseTo(0, 10);
    const apparent = (50 * height) / 600;
    expect(centred.radius).toBeCloseTo(10 * Math.sin(Math.atan(apparent / 10)), 10);
    expect(centred.radius).toBeCloseTo(apparent, 1);

    // A planet much wider than the screen stays smaller than the camera distance.
    const giant = rectToWorld({ left: -2000, top: 400, width: 4800, height: 4800 }, viewport, 40, 10);
    expect(giant.radius).toBeLessThan(10);

    // Its silhouette's top edge still meets the element's top edge (400 px down the screen).
    const unit = visibleHeightAt(40, 10) / 600;
    const topAngle = Math.atan(((400 - 300) * unit) / 10);
    const centreAngle = Math.atan(Math.abs(giant.y) / 10);
    const silhouetteTop = centreAngle - Math.asin(giant.radius / Math.hypot(giant.y, 10));
    expect(silhouetteTop).toBeCloseTo(topAngle, 6);

    const topLeft = rectToWorld({ left: 0, top: 0, width: 0, height: 0 }, viewport, 40, 10);
    expect(topLeft.x).toBeLessThan(0);
    expect(topLeft.y).toBeGreaterThan(0);
  });

  it("maps world points back to texture coordinates", () => {
    const disc = rectToWorld({ left: 600, top: 100, width: 0, height: 0 }, viewport, 40, 10);
    const uv = worldToUv(disc.x, disc.y, viewport, 40, 10);
    expect(uv.u).toBeCloseTo(600 / 800, 10);
    expect(uv.v).toBeCloseTo(1 - 100 / 600, 10);
  });

  it("makes a covering sphere reach past the screen corners", () => {
    const radius = coverRadius(viewport, 40, 10, 1);
    const halfHeight = visibleHeightAt(40, 10) / 2;
    const halfWidth = (halfHeight * 800) / 600;
    // The sphere's silhouette must reach the corner direction.
    const cornerAngle = Math.atan(Math.hypot(halfWidth, halfHeight) / 10);
    expect(Math.asin(radius / 10)).toBeCloseTo(cornerAngle, 6);
    expect(coverRadius(viewport, 40, 10)).toBeGreaterThan(radius);
  });

  it("draws orbits that pass through the planet", () => {
    for (const [dx, dy] of [
      [3, -2],
      [0, -4],
      [-5, 1],
      [2, 0],
    ] as const) {
      const { a, b } = orbitThrough(dx, dy);
      expect((dx / a) ** 2 + (dy / b) ** 2).toBeCloseTo(1, 6);
      expect(a).toBeGreaterThan(0);
    }
    expect(orbitThrough(0, 0)).toEqual({ a: 0, b: 0 });
  });
});

describe("music", () => {
  it("converts MIDI notes to hertz", () => {
    expect(midiToHz(69)).toBeCloseTo(440, 10);
    expect(midiToHz(57)).toBeCloseTo(220, 10);
  });

  it("fills every pad voice, repeating short chords an octave up", () => {
    expect(moodNotes({ rootMidi: 38, intervals: [0, 7, 14, 16, 21], brightness: 0.5 })).toEqual([38, 45, 52, 54, 59]);
    const short = moodNotes({ rootMidi: 40, intervals: [0, 7], brightness: 0 });
    expect(short).toHaveLength(PAD_VOICES);
    expect(short).toEqual([40, 47, 52, 59, 64]);
  });

  it("opens the pad filter as brightness rises", () => {
    expect(padCutoffHz(0)).toBeCloseTo(260, 6);
    expect(padCutoffHz(1)).toBeCloseTo(1600, 6);
    expect(padCutoffHz(0.5)).toBeGreaterThan(padCutoffHz(0.2));
  });

  it("chooses distant chimes from the chord, deterministically for a seed", () => {
    const mood = { rootMidi: 38, intervals: [0, 7, 14, 16, 21], brightness: 0.5 };
    const notes = moodNotes(mood);
    const first = nextShimmer(mood, seededRandom(7));
    const again = nextShimmer(mood, seededRandom(7));
    expect(first).toEqual(again);
    const random = seededRandom(42);
    for (let index = 0; index < 50; index += 1) {
      const chime = nextShimmer(mood, random);
      expect(notes.includes(chime.midi - 24) || notes.includes(chime.midi - 36)).toBe(true);
      expect(chime.delayMs).toBeGreaterThanOrEqual(4500);
      expect(chime.delayMs).toBeLessThanOrEqual(10000);
      expect(Math.abs(chime.pan)).toBeLessThanOrEqual(0.8);
    }
  });
});

describe("preferences", () => {
  it("remembers a switch and survives broken storage", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value) };
    const sound = createSwitchPreference(storage, "sound", true);
    expect(sound.get()).toBe(true);
    sound.set(false);
    expect(createSwitchPreference(storage, "sound", true).get()).toBe(false);

    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    const fallback = createSwitchPreference(broken, "sound", true);
    expect(fallback.get()).toBe(true);
    fallback.set(false);
    expect(fallback.get()).toBe(false);
  });

  it("treats unknown or small devices as the low tier", () => {
    expect(guessQuality({})).toBe("low");
    expect(guessQuality({ cores: 8 })).toBe("high");
    expect(guessQuality({ cores: 8, memoryGb: 2 })).toBe("low");
    expect(pixelRatioCap("low")).toBeLessThan(pixelRatioCap("high"));
  });
});
