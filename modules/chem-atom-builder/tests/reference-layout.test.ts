import { describe, expect, it } from "vitest";
import {
  atomBuilderDesktopLayoutElements,
  atomBuilderDesktopReference,
} from "../src/reference-layout.js";
import { horizonTokens } from "../../../packages/engine-render/src/horizon-tokens.js";
import { xrTokens } from "../../../packages/engine-render/src/xr-tokens.js";

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
    expect(regions.get("positionSliderLabel")?.label).toBe("Position");
    expect(regions.get("scaleSliderLabel")?.label).toBe("Scale");
    expect(regions.get("positionSliderTrack")?.orientation).toBe("horizontal");
    expect(regions.get("scaleSliderTrack")?.orientation).toBe("vertical");
    expect(regions.get("hintsProgressBar")?.rect).toBeNull();
    expect(regions.get("hintsTitle")?.rect).toBeNull();
  });

  it("records all visible controls, rows, actions, sliders, and header text", () => {
    const layout = atomBuilderDesktopReference;
    const regions = new Map(layout.regions.map((region) => [region.id, region]));
    const requiredIds = [
      "modelArea",
      "captionsOn",
      "speedChip1x",
      "narrationOn",
      "replay",
      "captionTextArea",
      "particleTitle",
      "protonSwatch", "protonLabelAndCount", "protonMinus", "protonPlus",
      "neutronSwatch", "neutronLabelAndCount", "neutronMinus", "neutronPlus",
      "electronSwatch", "electronLabelAndCount", "electronMinus", "electronPlus",
      "elementBlock", "elementSymbol", "elementName", "elementNumber",
      "propertyRowAtomicNumber", "propertyRowMassNumber", "propertyRowCharge",
      "propertyRowElectronicConfiguration", "propertyRowOuterShell",
      "missionLabel", "missionProgressBar", "missionTitle", "missionBody", "missionHintLine",
      "hintsLabel", "hintsBody",
      "hintButton", "checkButton", "freePlayButton", "futureLogoSlot",
      "positionSliderTrack", "positionSliderLabel",
      "scaleSliderTrack", "scaleSliderLabel",
      "resetViewButton", "resetAtomButton",
    ];

    expect(Object.keys(layout.panels)).toEqual(["model", "particles", "mission", "hints"]);
    expect(layout.header.brand.text).toBe("MMAXR");
    expect(layout.header.moduleTitle.text).toBe("Atom Builder");
    expect(requiredIds.filter((id) => !regions.has(id))).toEqual([]);
    expect(regions.get("positionSliderTrack")?.orientation).toBe("horizontal");
    expect(regions.get("scaleSliderTrack")?.orientation).toBe("vertical");
  });

  it("keeps every structural element contained, separated, and backed by glass", () => {
    const elements = atomBuilderDesktopLayoutElements;
    const byId = new Map(elements.map((element) => [element.id, element]));
    const minimumGap = xrTokens.gapsDp.inline * horizonTokens.metresPerDp
      / xrTokens.shellWidthMeters;
    const bounds = (elementId: string) => {
      const rect = byId.get(elementId)?.rect?.normalizedToShellWidth;
      if (!rect) throw new Error(`Reference element ${elementId} has no measured bounds.`);
      return rect;
    };
    const contains = (
      container: ReturnType<typeof bounds>,
      child: ReturnType<typeof bounds>,
    ): boolean => child.x >= container.x &&
      child.y >= container.y &&
      child.x + child.width <= container.x + container.width &&
      child.y + child.height <= container.y + container.height;

    expect(byId.size).toBe(elements.length);
    expect(elements.map(({ id }) => id)).toEqual(expect.arrayContaining([
      "canvas",
      "shell",
      "model-panel",
      "particles-panel",
      "mission-panel",
      "hints-panel",
      ...atomBuilderDesktopReference.regions.map(({ id }) => id),
      "brand",
      "moduleTitle",
    ]));

    for (const element of elements) {
      if (element.rect && element.parentId) {
        const parent = byId.get(element.parentId);
        expect(parent, `${element.id} has a structural parent`).toBeDefined();
        if (parent?.rect) {
          expect(
            contains(bounds(parent.id), bounds(element.id)),
            `${element.id} fits inside ${parent.id}`,
          ).toBe(true);
        }
      }
      if (element.textBounds) {
        expect(element.rect, `${element.id} text has a measured box`).not.toBeNull();
        expect(
          contains(bounds(element.id), element.textBounds.normalizedToShellWidth),
          `${element.id} text fits inside its box`,
        ).toBe(true);
      }
      if (element.role === "label") {
        expect(element.backingSurfaceId, `${element.id} has a glass backing`).toBeTruthy();
        const backing = byId.get(element.backingSurfaceId ?? "");
        expect(
          backing?.role === "surface" || backing?.role === "control",
          `${element.id} backing is a glass surface or control`,
        ).toBe(true);
      }
    }

    const siblings = new Map<string, typeof elements[number][]>();
    for (const element of elements) {
      if (!element.parentId || !element.rect) continue;
      const list = siblings.get(element.parentId) ?? [];
      list.push(element);
      siblings.set(element.parentId, list);
    }
    for (const [parentId, group] of siblings) {
      for (let firstIndex = 0; firstIndex < group.length; firstIndex += 1) {
        const first = group[firstIndex]!;
        for (const second of group.slice(firstIndex + 1)) {
          if (first.stackId && first.stackId === second.stackId) continue;
          const a = bounds(first.id);
          const b = bounds(second.id);
          const gapX = Math.max(0, b.x - a.x - a.width, a.x - b.x - b.width);
          const gapY = Math.max(0, b.y - a.y - a.height, a.y - b.y - b.height);
          if (gapX === 0 && gapY === 0) {
            expect(
              first.stackId && first.stackId === second.stackId,
              `${first.id} and ${second.id} only overlap in a declared stack inside ${parentId}`,
            ).toBeTruthy();
            continue;
          }
          expect(
            Math.max(gapX, gapY),
            `${first.id} and ${second.id} preserve the inline token gap`,
          ).toBeGreaterThanOrEqual(minimumGap);
        }
      }
    }
  });
});
