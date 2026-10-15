import { describe, expect, it } from "vitest";
import { atomBuilderDesktopReference } from "../src/reference-layout.js";

describe("Atom Builder desktop reference layout data", () => {
  it("normalizes source rectangles against the shell width and origin", () => {
    expect(atomBuilderDesktopReference.shell.normalizedToShellWidth).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1300 / 2028,
    });
    expect(atomBuilderDesktopReference.panels.model.normalizedToShellWidth).toEqual({
      x: 27 / 2028,
      y: 32 / 2028,
      width: 1412 / 2028,
      height: 841 / 2028,
    });
  });

  it("keeps missing reference elements explicit instead of inventing their bounds", () => {
    const regions = new Map(
      atomBuilderDesktopReference.regions.map((region) => [region.id, region]),
    );

    expect(regions.get("positionSliderLabel")?.rect).toBeNull();
    expect(regions.get("scaleSliderLabel")?.rect).toBeNull();
    expect(regions.get("hintsProgressBar")?.rect).toBeNull();
    expect(regions.get("hintsTitle")?.rect).toBeNull();
  });
});
