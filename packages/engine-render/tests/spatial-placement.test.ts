import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  spatialLayout,
  validateSpatialDockProfile,
  validateSpatialLayout,
} from "../src/spatial-layout.js";
import {
  calculateSpatialDockLayout,
  calculateSpatialDockPlacement,
  gravityAlignedQuaternion,
  pixelsPerMeterAtDepth,
  profileSettings,
  selectSpatialPresentationProfile,
  shouldEnableSpatialPanelPointerEvents,
  toggleSpatialDockSelection,
  SPATIAL_DOCK_HINT,
  type SpatialPanelKey,
} from "../src/visuals/spatial-placement.js";
import { hitTest, layoutPanel, layoutPanelPages, wrapPanelText } from "../src/visuals/panel-layout.js";
import { spatialTokens } from "../src/spatial-tokens.js";
import {
  canCreateSpatialPanels,
  shouldShowSpatialSettingsFallback,
} from "../src/screen-renderer.js";

const phoneFov = 60 * Math.PI / 180;
const phoneProjectionY = 1 / Math.tan(phoneFov / 2);

describe("spatial dock layout", () => {
  it("places a headset dock from the first valid viewer pose", () => {
    const placement = calculateSpatialDockPlacement(
      { x: 0, y: 1.6, z: 0 },
      { x: 0, y: 0, z: 0, w: 1 },
      profileSettings("headset").distanceMeters,
      -0.2,
    );

    expect(placement.position.x).toBeCloseTo(0);
    expect(placement.position.y).toBeCloseTo(1.4);
    expect(placement.position.z).toBeCloseTo(-profileSettings("headset").distanceMeters);
    expect(placement.orientation.x).toBeCloseTo(0);
    expect(placement.orientation.y).toBeCloseTo(0);
    expect(placement.orientation.z).toBeCloseTo(0);
    expect(placement.orientation.w).toBeCloseTo(1);
  });

  it("computes projection scale for a phone and a desktop viewport", () => {
    expect(pixelsPerMeterAtDepth(915, 0.75, phoneFov)).toBeCloseTo(1056.5, 0);
    expect(pixelsPerMeterAtDepth(1080, 1, phoneFov)).toBeCloseTo(935.3, 0);
    const phone = calculateSpatialDockLayout(412, 915, phoneProjectionY, "handheld");
    const desktop = calculateSpatialDockLayout(1440, 900, phoneProjectionY, "headset", true);
    expect(phone.pixelsPerMeter).toBeCloseTo(1132, 0);
    expect(desktop.keys).toHaveLength(5);
    expect(desktop.rowWidthPx).toBeLessThanOrEqual(desktop.maxRowWidthPx);
  });

  it("fits four and five equal-width tabs on a 412px phone without paging", () => {
    for (const includeSettings of [false, true]) {
      const layout = calculateSpatialDockLayout(
        412,
        915,
        phoneProjectionY,
        "handheld",
        includeSettings,
      );
      expect(layout.keys).toHaveLength(includeSettings ? 5 : 4);
      expect(layout.rowWidthPx).toBe(412 * 0.92);
      expect(layout.rowWidthPx).toBeLessThanOrEqual(layout.maxRowWidthPx);
      expect(layout.tabWidthPx).toBeGreaterThanOrEqual(48);
      expect(layout.tabHeightMeters * layout.pixelsPerMeter).toBeGreaterThanOrEqual(48);
      expect(layout.keys.includes("settings")).toBe(includeSettings);
    }
    const headsetWithSettings = calculateSpatialDockLayout(
      412,
      915,
      phoneProjectionY,
      "headset",
      true,
    );
    expect(headsetWithSettings.tabWidthPx).toBeGreaterThanOrEqual(60);
    expect(headsetWithSettings.tabHeightMeters * headsetWithSettings.pixelsPerMeter)
      .toBeGreaterThanOrEqual(60);
  });

  it("routes handheld AR taps to spatial panels but keeps headset pointer input off", () => {
    expect(shouldEnableSpatialPanelPointerEvents(false, true, "handheld")).toBe(true);
    expect(shouldEnableSpatialPanelPointerEvents(false, true, "headset")).toBe(false);
    expect(shouldEnableSpatialPanelPointerEvents(false, false, "handheld")).toBe(false);
    expect(shouldEnableSpatialPanelPointerEvents(true, true, "headset")).toBe(true);
  });

  it("renders mission actions in a 2x2 grid with kit minimum targets", () => {
    const actions = [
      { kind: "button" as const, text: "Hint", inputId: "lesson:hint", layoutGroup: "mission-actions" as const, variant: "secondary" as const },
      { kind: "button" as const, text: "Check", inputId: "lesson:check", layoutGroup: "mission-actions" as const, variant: "primary" as const },
      { kind: "button" as const, text: "Free play", inputId: "lesson:free-play", layoutGroup: "mission-actions" as const, variant: "secondary" as const },
      { kind: "button" as const, text: "Reset atom", inputId: "atom/reset", layoutGroup: "mission-actions" as const, variant: "secondary" as const },
    ];
    const rects = layoutPanel(actions, { width: 379, height: 347 });
    expect(rects.map(({ inputId }) => inputId)).toEqual(actions.map(({ inputId }) => inputId));
    expect(rects.every(({ width, height }) => width >= 48 && height >= 48)).toBe(true);
    expect(rects[0]?.variant).toBe("secondary");
    expect(rects[1]?.variant).toBe("primary");
    expect(spatialLayout.minControlSizePx).toBe(48);
    expect(spatialLayout.minPrimaryHandControlSizeDp).toBe(60);
    expect(spatialLayout.minTextSizePx).toBe(16);
    expect(profileSettings("handheld").distanceMeters).toBeCloseTo(0.7);
    const handActions = layoutPanel(
      actions.map((action) => action.inputId === "lesson:check"
        ? { ...action, targetSizeDp: 60 }
        : action),
      { width: 379, height: 347 },
    );
    expect(handActions.find(({ inputId }) => inputId === "lesson:check")?.height)
      .toBeGreaterThanOrEqual(60);
  });

  it("uses Body 1 labels with the handheld floor and 48/60 dp tab heights", () => {
    const phoneTabs = calculateSpatialDockLayout(412, 915, phoneProjectionY, "handheld");
    const headsetTabs = calculateSpatialDockLayout(412, 915, phoneProjectionY, "headset");
    const label = layoutPanel(
      [{
        kind: "button",
        text: "Particles",
        inputId: "particles",
        variant: "secondary",
        textAlign: "center",
        fontSizePx: 14,
      }],
      { width: phoneTabs.tabWidthPx, height: 48 },
      { ...spatialTokens, padPanel: "0px" },
    )[0];

    expect(label?.fontSizePx).toBe(16);
    expect(label?.lines).toEqual(["Particles"]);
    expect(phoneTabs.tabHeightMeters * phoneTabs.pixelsPerMeter).toBe(48);
    expect(headsetTabs.tabHeightMeters * headsetTabs.pixelsPerMeter).toBeCloseTo(60);
  });

  it("wraps lesson text without ellipses and provides page controls for overflow", () => {
    const text = "A complete lesson sentence must remain readable and available on the detail card even when the card needs several pages.";
    const lines = wrapPanelText(text, 64, (value) => value.length * 8);
    expect(lines.join(" ")).toBe(text);
    expect(lines.some((line) => line.includes("…"))).toBe(false);
    const pages = layoutPanelPages(
      [{ kind: "text", text }],
      { width: 120, height: 96 },
      { ...spatialTokens, padPanel: "0px", gapControl: "0px" },
      (value) => value.length * 8,
    ).pages;
    expect(pages.length).toBeGreaterThan(1);
    const renderedText = pages.flatMap((page) =>
      page.filter(({ inputId }) => inputId === undefined).flatMap(({ lines: pageLines }) => pageLines),
    ).join(" ");
    expect(renderedText).toBe(text);
    expect(pages.every((page) => page.filter(({ inputId }) => inputId?.startsWith("dock:detail:"))
      .every(({ width, height }) => width >= 48 && height >= 48))).toBe(true);
  });

  it("uses the one-source tooltip text until a tab is first selected", () => {
    expect(SPATIAL_DOCK_HINT).toBe("Tap a tab to open it. Open Particles to build the atom.");
    let active: SpatialPanelKey | null = "mission";
    active = toggleSpatialDockSelection(active, "mission");
    expect(active).toBeNull();
    active = toggleSpatialDockSelection(active, "particles");
    expect(active).toBe("particles");
  });

  it("keeps disabled controls out of hit testing while preserving the disabled state", () => {
    const rects = layoutPanel([
      { kind: "button", text: "Unavailable", inputId: "disabled", disabled: true },
      { kind: "button", text: "Available", inputId: "enabled" },
    ], { width: 320, height: 180 });
    const disabled = rects.find(({ inputId }) => inputId === "disabled")!;
    const uv = {
      x: (disabled.x + disabled.width / 2) / 320,
      y: 1 - (disabled.y + disabled.height / 2) / 180,
    };
    expect(disabled.disabled).toBe(true);
    expect(hitTest(rects, uv)).toBeNull();
    expect(() => validateSpatialDockProfile({
      ...profileSettings("handheld"),
      pagerButtonPx: 47,
    })).toThrow(RangeError);
  });

  it("rejects layouts below the kit text or target minimums", () => {
    expect(() => validateSpatialLayout({
      ...spatialLayout,
      minTextSizePx: 15,
    })).toThrow(RangeError);
    expect(() => validateSpatialLayout({
      ...spatialLayout,
      minControlSizePx: 47,
    })).toThrow(RangeError);
    expect(() => validateSpatialLayout({
      ...spatialLayout,
      minPrimaryHandControlSizeDp: 59,
    })).toThrow(RangeError);
  });

  it("uses the handheld and headset parameter sets for the requested modes", () => {
    expect(selectSpatialPresentationProfile("immersive-ar", "screen-space")).toBe("handheld");
    expect(selectSpatialPresentationProfile("camera")).toBe("handheld");
    expect(selectSpatialPresentationProfile("immersive-ar", "world-space")).toBe("headset");
    expect(selectSpatialPresentationProfile("immersive-vr")).toBe("headset");
    expect(profileSettings("handheld").distanceMeters).toBeCloseTo(0.7);
    expect(profileSettings("headset").distanceMeters).toBeCloseTo(1);
    expect(profileSettings("headset").downAngleRadians).toBeCloseTo(15 * Math.PI / 180);
  });

  it("expands one card at a time and collapses a card when selected again", () => {
    let active: SpatialPanelKey | null = "mission";
    active = toggleSpatialDockSelection(active, "particles");
    expect(active).toBe("particles");
    active = toggleSpatialDockSelection(active, "particles");
    expect(active).toBeNull();
    active = toggleSpatialDockSelection(active, "elementInfo");
    expect(active).toBe("elementInfo");
  });

  it("keeps panel orientation yaw-only for pitched, rolled, and vertical viewer poses", () => {
    const worldUp = new THREE.Vector3(0, 1, 0);
    for (const pose of [
      new THREE.Euler(0.7, 1.1, 0.8),
      new THREE.Euler(-0.9, -0.6, -1.2),
      new THREE.Euler(Math.PI / 2, 0.4, 0.9),
      new THREE.Euler(-Math.PI / 2, -1.3, 0.7),
    ]) {
      const aligned = gravityAlignedQuaternion(new THREE.Quaternion().setFromEuler(pose));
      const up = worldUp.clone().applyQuaternion(aligned);
      expect(up.x).toBeCloseTo(0);
      expect(up.y).toBeCloseTo(1);
      expect(up.z).toBeCloseTo(0);
    }
  });

  it("preserves presentation gating and settings fallback behavior", () => {
    expect(canCreateSpatialPanels(false, false)).toBe(false);
    expect(canCreateSpatialPanels(true, false)).toBe(true);
    expect(canCreateSpatialPanels(false, true)).toBe(true);
    expect(shouldShowSpatialSettingsFallback(false, false)).toBe(false);
    expect(shouldShowSpatialSettingsFallback(true, false)).toBe(true);
    expect(shouldShowSpatialSettingsFallback(false, true)).toBe(true);
  });
});
