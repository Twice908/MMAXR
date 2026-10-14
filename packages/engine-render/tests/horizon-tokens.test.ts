import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { horizonTokenCssValues, horizonTokens } from "../src/horizon-tokens.js";

const tokenCssFile = fileURLToPath(
  new URL("../../../modules/chem-atom-builder/src/horizon-tokens.css", import.meta.url),
);

describe("Horizon UI tokens", () => {
  it("keeps the CSS custom properties in parity with the typed tokens", () => {
    const css = readFileSync(tokenCssFile, "utf8");
    const cssValues = Object.fromEntries(
      [...css.matchAll(/(--horizon-[\w-]+):\s*([^;]+);/g)]
        .map(([, property, value]) => [property!, value!.trim()] as const),
    );

    expect(cssValues).toEqual(horizonTokenCssValues);
  });

  it("preserves the minimums for ordinary and primary hand-tracked targets", () => {
    expect(horizonTokens.minimumHitTargetDp).toBe(48);
    expect(horizonTokens.primaryHandHitTargetDp).toBe(60);
  });

  it("keeps the provided type scale, icon size, panel sizes, and dp mapping", () => {
    expect(horizonTokens.typeScale).toMatchObject({
      headline1: { sizeDp: 32, lineHeightDp: 36 },
      headline2: { sizeDp: 24, lineHeightDp: 28 },
      headline3: { sizeDp: 20, lineHeightDp: 24 },
      body1: { sizeDp: 14, lineHeightDp: 20 },
      body2: { sizeDp: 11, lineHeightDp: 16 },
      italics: false,
    });
    expect(horizonTokens.iconSizeDp).toBe(24);
    expect(horizonTokens.panelSizeDp).toEqual({
      default: { width: 1024, height: 640 },
      minimum: { width: 384, height: 500 },
      maximum: { width: 1440, height: 1000 },
    });
    expect(horizonTokens.handheldCssPixelsPerDp).toBe(1);
    expect(48 * horizonTokens.metresPerDp).toBeCloseTo(0.046, 3);
  });
});
