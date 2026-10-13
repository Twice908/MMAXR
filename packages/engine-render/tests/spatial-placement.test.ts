import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  spatialLayout,
  validateSpatialDockProfile,
} from "../src/spatial-layout.js";
import {
  calculateSpatialDockLayout,
  gravityAlignedQuaternion,
  pixelsPerMeterAtDepth,
  profileSettings,
  selectSpatialPresentationProfile,
  toggleSpatialDockSelection,
  type SpatialPanelKey,
} from "../src/visuals/spatial-placement.js";
import { layoutPanel } from "../src/visuals/panel-layout.js";
import { spatialTokens } from "../src/spatial-tokens.js";
import {
  canCreateSpatialPanels,
  shouldShowSpatialSettingsFallback,
} from "../src/screen-renderer.js";

const phoneFov = 60 * Math.PI / 180;
const phoneProjectionY = 1 / Math.tan(phoneFov / 2);

describe("spatial dock layout", () => {
  it("computes projection scale for a phone and a desktop viewport", () => {
    expect(pixelsPerMeterAtDepth(915, 0.75, phoneFov)).toBeCloseTo(1056.5, 0);
    expect(pixelsPerMeterAtDepth(1080, 1, phoneFov)).toBeCloseTo(935.3, 0);
    const phone = calculateSpatialDockLayout(412, 915, phoneProjectionY, "handheld");
    const desktop = calculateSpatialDockLayout(1440, 900, phoneProjectionY, "headset");
    expect(phone.pixelsPerMeter).toBeCloseTo(1056.5, 0);
    expect(desktop.keys).toHaveLength(5);
    expect(desktop.rowWidthPx).toBeLessThanOrEqual(desktop.maxRowWidthPx);
  });

  it("pages the phone row to fit 92 percent of the visible width", () => {
    const layout = calculateSpatialDockLayout(412, 915, phoneProjectionY, "handheld");
    expect(layout.visibleCount).toBeLessThan(5);
    expect(layout.pageCount).toBeGreaterThan(1);
    expect(layout.rowWidthPx).toBeLessThanOrEqual(layout.maxRowWidthPx);
    expect(layout.keys).toEqual(["mission", "particles"]);
    expect(calculateSpatialDockLayout(412, 915, phoneProjectionY, "handheld", 1).keys)
      .toEqual(["elementInfo", "narration"]);
  });

  it("keeps compact cards, pager targets, detail controls, and text at minimum sizes", () => {
    for (const profile of ["handheld", "headset"] as const) {
      const settings = profileSettings(profile);
      expect(settings.cardWidthPx).toBeGreaterThanOrEqual(44);
      expect(settings.compactHeightPx).toBeGreaterThanOrEqual(44);
      expect(settings.pagerButtonPx).toBeGreaterThanOrEqual(44);
      expect(spatialLayout.minTextSizePx).toBeGreaterThanOrEqual(16);
      const compact = layoutPanel(
        [
          { kind: "heading", text: "Mission", fontSizePx: 18 },
          { kind: "text", text: "Current goal", fontSizePx: 18 },
        ],
        { width: settings.cardWidthPx, height: settings.compactHeightPx },
        { ...spatialTokens, padPanel: "6px", gapControl: "3px" },
      );
      expect(compact).toHaveLength(2);
      expect(compact.every(({ fontSizePx }) => fontSizePx >= 16)).toBe(true);
      const button = layoutPanel(
        [{ kind: "button", text: "Action", inputId: "action" }],
        { width: settings.detailWidthPx, height: 120 },
      )[0];
      expect(button?.width).toBeGreaterThanOrEqual(44);
      expect(button?.height).toBeGreaterThanOrEqual(44);
      expect(button?.fontSizePx).toBeGreaterThanOrEqual(16);
      const pager = layoutPanel(
        [{ kind: "button", text: "›", inputId: "next" }],
        { width: settings.pagerButtonPx, height: settings.pagerButtonPx },
        { ...spatialTokens, padPanel: "0px" },
      )[0];
      expect(pager?.width).toBeGreaterThanOrEqual(44);
      expect(pager?.height).toBeGreaterThanOrEqual(44);
    }
    expect(() => validateSpatialDockProfile({
      ...profileSettings("handheld"),
      pagerButtonPx: 43,
    })).toThrow(RangeError);
  });

  it("uses the handheld and headset parameter sets for the requested modes", () => {
    expect(selectSpatialPresentationProfile("immersive-ar", "screen-space")).toBe("handheld");
    expect(selectSpatialPresentationProfile("camera")).toBe("handheld");
    expect(selectSpatialPresentationProfile("immersive-ar", "world-space")).toBe("headset");
    expect(selectSpatialPresentationProfile("immersive-vr")).toBe("headset");
    expect(profileSettings("handheld").distanceMeters).toBeCloseTo(0.75);
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
