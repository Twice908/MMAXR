import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const tokenFile = fileURLToPath(new URL("../src/glass-tokens.css", import.meta.url));
const tokenCss = readFileSync(tokenFile, "utf8");
const componentCssFile = fileURLToPath(new URL("../src/atom-builder.css", import.meta.url));
const componentCss = readFileSync(componentCssFile, "utf8");
const backdrops = [
  { name: "pure white", color: [255, 255, 255] },
  { name: "pure black", color: [0, 0, 0] },
  { name: "mid-grey", color: [128, 128, 128] },
  { name: "saturated red", color: [255, 0, 0] },
  { name: "saturated green", color: [0, 255, 0] },
  { name: "saturated blue", color: [0, 0, 255] },
  { name: "saturated magenta", color: [255, 0, 255] },
  { name: "saturated cyan", color: [0, 255, 255] },
  { name: "saturated yellow", color: [255, 255, 0] },
] as const;

type Rgb = readonly [number, number, number];
interface Rgba {
  readonly color: Rgb;
  readonly alpha: number;
}

function getToken(name: string): string {
  const match = new RegExp(`--${name}:\\s*([^;]+);`).exec(tokenCss);
  if (!match) {
    throw new Error(`Missing glass token: --${name}`);
  }
  return match[1]!.trim();
}

function getColorToken(name: string): Rgba {
  const value = getToken(name);
  const rgba = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/.exec(value);
  if (rgba) {
    return {
      color: [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])],
      alpha: Number(rgba[4]),
    };
  }
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (!hex) {
    throw new Error(`Unsupported color token --${name}: ${value}`);
  }
  const valueHex = hex[1]!;
  return {
    color: [
      Number.parseInt(valueHex.slice(0, 2), 16),
      Number.parseInt(valueHex.slice(2, 4), 16),
      Number.parseInt(valueHex.slice(4, 6), 16),
    ],
    alpha: 1,
  };
}

function composite(foreground: Rgba, background: Rgb): Rgb {
  const red = foreground.color[0] * foreground.alpha
    + background[0] * (1 - foreground.alpha);
  const green = foreground.color[1] * foreground.alpha
    + background[1] * (1 - foreground.alpha);
  const blue = foreground.color[2] * foreground.alpha
    + background[2] * (1 - foreground.alpha);
  return [red, green, blue];
}

function luminance(color: Rgb): number {
  const channels = color.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

function contrastRatio(first: Rgb, second: Rgb): number {
  const firstLuminance = luminance(first);
  const secondLuminance = luminance(second);
  return (Math.max(firstLuminance, secondLuminance) + 0.05)
    / (Math.min(firstLuminance, secondLuminance) + 0.05);
}

function alphaTextOnSurface(text: Rgba, surface: Rgb): Rgb {
  return composite(text, surface);
}

function minimumRatio(
  getPair: (backdrop: Rgb) => readonly [Rgb, Rgb],
): { readonly ratio: number; readonly backdrop: string } {
  let minimum = Number.POSITIVE_INFINITY;
  let worstBackdrop = "";
  for (const backdrop of backdrops) {
    const [foreground, background] = getPair(backdrop.color);
    const ratio = contrastRatio(foreground, background);
    if (ratio < minimum) {
      minimum = ratio;
      worstBackdrop = backdrop.name;
    }
  }
  return { ratio: minimum, backdrop: worstBackdrop };
}

function glassSurface(backdrop: Rgb, tokenName: "glass-bg" | "glass-bg-strong"): Rgb {
  return composite(getColorToken(tokenName), backdrop);
}

describe("glass contrast tokens", () => {
  it("documents every tunable variable directly above its declaration", () => {
    const declarations = [...tokenCss.matchAll(/^\s*(--[\w-]+):/gm)];
    expect(declarations.length).toBeGreaterThan(0);
    for (const declaration of declarations) {
      const before = tokenCss.slice(0, declaration.index).trimEnd();
      expect(before.endsWith("*/"), `${declaration[1]} needs a preceding comment`).toBe(true);
    }
  });

  it("uses backdrop filters only within feature support and disables them for fallbacks", () => {
    const supportsStart = componentCss.indexOf("@supports");
    const filterDeclarations = [...componentCss.matchAll(/(?:-webkit-)?backdrop-filter\s*:/g)];
    expect(supportsStart).toBeGreaterThanOrEqual(0);
    expect(filterDeclarations.length).toBeGreaterThan(0);
    for (const declaration of filterDeclarations) {
      expect(declaration.index).toBeGreaterThan(supportsStart);
    }
    expect(componentCss).toMatch(/\.ar-overlay-panel\s*\{[^}]*background: var\(--glass-bg-strong\)/);
    expect(componentCss).toMatch(/\.ar-confirmation\s*\{[^}]*background: var\(--glass-bg-strong\)/);
    expect(componentCss).toMatch(
      /@media \(prefers-reduced-transparency: reduce\), \(prefers-contrast: more\)[\s\S]*backdrop-filter: none;/,
    );
  });

  it("keeps body and muted glass text at WCAG AA on all test backdrops", () => {
    const bodyText = getColorToken("glass-text");
    const mutedText = getColorToken("glass-text-muted");
    for (const surfaceToken of ["glass-bg", "glass-bg-strong"] as const) {
      const bodyResult = minimumRatio((backdrop) => [
        bodyText.color,
        glassSurface(backdrop, surfaceToken),
      ]);
      const mutedResult = minimumRatio((backdrop) => {
        const surface = glassSurface(backdrop, surfaceToken);
        return [alphaTextOnSurface(mutedText, surface), surface];
      });
      expect(bodyResult.ratio, `${surfaceToken} body text fails on ${bodyResult.backdrop}`)
        .toBeGreaterThanOrEqual(4.5);
      expect(mutedResult.ratio, `${surfaceToken} muted text fails on ${mutedResult.backdrop}`)
        .toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps white action text at WCAG AA over glass and arbitrary backdrops", () => {
    const whiteText = getColorToken("glass-primary-text");
    for (const surfaceName of ["glass-bg", "glass-bg-strong"] as const) {
      const result = minimumRatio((backdrop) => {
        const buttonBackground = composite(
          getColorToken("glass-primary-bg"),
          glassSurface(backdrop, surfaceName),
        );
        return [whiteText.color, buttonBackground];
      });
      expect(result.ratio, `primary text fails on ${result.backdrop} over ${surfaceName}`)
        .toBeGreaterThanOrEqual(4.5);
    }
    const dangerText = getColorToken("glass-danger-text");
    const dangerResult = minimumRatio((backdrop) => [
      dangerText.color,
      composite(getColorToken("glass-danger-bg"), backdrop),
    ]);
    expect(dangerResult.ratio, `danger text fails on ${dangerResult.backdrop}`)
      .toBeGreaterThanOrEqual(4.5);
  });
});
