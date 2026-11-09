import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AR_HUD_TABS, arHudStatusText, nextArHudTab } from "../src/ar-hud.js";

const css = readFileSync(fileURLToPath(new URL("../src/ar-hud.css", import.meta.url)), "utf8");

function token(name: string): string {
  const match = new RegExp(`--${name}:\\s*([^;]+);`).exec(css);
  if (!match) throw new Error(`Missing HUD token --${name}`);
  return match[1]!.trim();
}

type Rgb = readonly [number, number, number];

function parse(value: string): { rgb: Rgb; alpha: number } {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const n = Number.parseInt(hex[1]!, 16);
    return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], alpha: 1 };
  }
  const rgba = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(value);
  if (!rgba) throw new Error(`Unsupported colour ${value}`);
  return { rgb: [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])], alpha: Number(rgba[4]) };
}

function over(top: { rgb: Rgb; alpha: number }, bottom: Rgb): Rgb {
  return top.rgb.map((c, i) => c * top.alpha + bottom[i]! * (1 - top.alpha)) as unknown as Rgb;
}

function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// Camera backdrops from black to white, plus saturated colours.
const backdrops: readonly Rgb[] = [
  [0, 0, 0], [128, 128, 128], [255, 255, 255], [255, 0, 0], [0, 255, 0], [0, 0, 255],
];

describe("phone AR HUD", () => {
  it("toggles a sheet closed when its open tab is tapped again", () => {
    expect(nextArHudTab(null, "build")).toBe("build");
    expect(nextArHudTab("build", "build")).toBeNull();
    expect(nextArHudTab("build", "mission")).toBe("mission");
  });

  it("offers four sections in a fixed order", () => {
    expect(AR_HUD_TABS).toEqual(["mission", "build", "element", "sound"]);
  });

  it("shows the mission step and title, or Free play", () => {
    expect(arHudStatusText("Mission 1 of 4", "Build carbon-12", false)).toBe("Mission 1 of 4 · Build carbon-12");
    expect(arHudStatusText("", "Build carbon-12", false)).toBe("Build carbon-12");
    expect(arHudStatusText("Mission 1 of 4", "Build carbon-12", true)).toBe("Free play");
  });

  it("keeps text at WCAG AA on the HUD surface over any camera backdrop", () => {
    const surface = parse(token("hud-surface"));
    for (const backdrop of backdrops) {
      const background = over(surface, backdrop);
      expect(contrast(parse(token("hud-ink")).rgb, background)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(parse(token("hud-muted")).rgb, background)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(parse(token("hud-accent")).rgb, background)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps white text at WCAG AA on primary and exit buttons", () => {
    const white = parse(token("hud-on-accent")).rgb;
    expect(contrast(white, parse(token("hud-accent")).rgb)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(white, parse(token("hud-danger")).rgb)).toBeGreaterThanOrEqual(4.5);
  });

  it("uses at least the Horizon 48px hit target", () => {
    expect(Number.parseInt(token("hud-hit"), 10)).toBeGreaterThanOrEqual(48);
    expect(Number.parseInt(token("hud-tab-height"), 10)).toBeGreaterThanOrEqual(48);
  });
});
