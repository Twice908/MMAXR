import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import {
  createSpatialSlider,
  spatialSliderHitAreaSizeDp,
  spatialSliderValueFromFraction,
} from "../src/visuals/spatial-slider.js";
import { horizonTokens } from "../src/horizon-tokens.js";
import { ANDROID_PANEL_LIMITS, dpToMeters, PANEL_LIMITS, xrTokens } from "../src/xr-tokens.js";

afterEach(() => vi.unstubAllGlobals());

describe("spatial slider math", () => {
  it("maps fractions to the range and clamps pointer values at both ends", () => {
    const { min, max } = PANEL_LIMITS.distanceMeters;
    expect(spatialSliderValueFromFraction(0, min, max)).toBe(min);
    expect(spatialSliderValueFromFraction(0.5, min, max)).toBeCloseTo(1.2);
    expect(spatialSliderValueFromFraction(1, min, max)).toBe(max);
    expect(spatialSliderValueFromFraction(-1, min, max)).toBe(min);
    expect(spatialSliderValueFromFraction(2, min, max)).toBe(max);
    expect(() => spatialSliderValueFromFraction(0.5, 1, 1)).toThrow(RangeError);
  });

  it("keeps horizontal and vertical hit areas at least 48 dp when scaled down", () => {
    const track = xrTokens.sizesDp.sliderTrack;
    const horizontal = spatialSliderHitAreaSizeDp(
      "horizontal",
      track.length,
      track.thickness,
    );
    const vertical = spatialSliderHitAreaSizeDp(
      "vertical",
      track.length,
      track.thickness,
    );
    const minimumEffectiveTarget = xrTokens.sizesDp.targetMin;

    expect(horizontal.widthDp).toBe(track.length);
    expect(horizontal.heightDp * PANEL_LIMITS.scale.min).toBeGreaterThanOrEqual(minimumEffectiveTarget);
    expect(vertical.heightDp).toBe(track.length);
    expect(vertical.widthDp * PANEL_LIMITS.scale.min).toBeGreaterThanOrEqual(minimumEffectiveTarget);
  });

  it("keeps the Android horizontal slider targets at least 48 dp at minimum scale", () => {
    const context = {
      font: "",
      fillStyle: "",
      textAlign: "left" as CanvasTextAlign,
      textBaseline: "alphabetic" as CanvasTextBaseline,
      measureText: (text: string) => ({ width: text.length * 8 }),
      clearRect: vi.fn(),
      fillText: vi.fn(),
    };
    vi.stubGlobal("document", {
      createElement: () => ({
        width: 1,
        height: 1,
        getContext: () => context,
      }),
    });
    const track = xrTokens.sizesDp.sliderTrack;
    const measuredTrackLengthDp = (384 / 1312 * xrTokens.shellWidthMeters)
      / horizonTokens.metresPerDp;
    const hitArea = spatialSliderHitAreaSizeDp(
      "horizontal",
      measuredTrackLengthDp,
      track.thickness,
      ANDROID_PANEL_LIMITS.scale.min,
    );
    expect(hitArea.widthDp * ANDROID_PANEL_LIMITS.scale.min).toBeGreaterThanOrEqual(48);
    expect(hitArea.heightDp * ANDROID_PANEL_LIMITS.scale.min).toBeGreaterThanOrEqual(48);
    const slider = createSpatialSlider({
      id: "android-scale",
      label: "Scale",
      orientation: "horizontal",
      min: ANDROID_PANEL_LIMITS.scale.min,
      max: ANDROID_PANEL_LIMITS.scale.max,
      value: ANDROID_PANEL_LIMITS.scale.default,
      trackLengthDp: measuredTrackLengthDp,
      minimumGroupScale: ANDROID_PANEL_LIMITS.scale.min,
    });
    if (!(slider.target.object3d instanceof THREE.Mesh) ||
      !(slider.target.object3d.geometry instanceof THREE.PlaneGeometry)) {
      throw new Error("Android slider hit geometry is missing.");
    }
    expect(slider.target.object3d.geometry.parameters.width)
      .toBeCloseTo(dpToMeters(hitArea.widthDp));
    expect(slider.target.object3d.geometry.parameters.height)
      .toBeCloseTo(dpToMeters(hitArea.heightDp));
    const visualTrack = slider.object3d.children.find((child) =>
      child.name === "spatial-slider-track-android-scale");
    if (!(visualTrack instanceof THREE.Mesh) ||
      !(visualTrack.geometry instanceof THREE.PlaneGeometry)) {
      throw new Error("Android slider visual track is missing.");
    }
    expect(visualTrack.geometry.parameters.width).toBeCloseTo(dpToMeters(measuredTrackLengthDp));
    slider.dispose();
  });

  it("renders light glass tracks, accent glass fill and thumb without changing hit bounds", () => {
    const context = {
      font: "",
      fillStyle: "",
      textAlign: "left" as CanvasTextAlign,
      textBaseline: "alphabetic" as CanvasTextBaseline,
      measureText: (text: string) => ({ width: text.length * 8 }),
      clearRect: vi.fn(),
      fillText: vi.fn(),
    };
    vi.stubGlobal("document", {
      createElement: () => ({
        width: 1,
        height: 1,
        getContext: () => context,
      }),
    });
    const slider = createSpatialSlider({
      id: "position-test",
      label: "Position",
      orientation: "horizontal",
      min: PANEL_LIMITS.distanceMeters.min,
      max: PANEL_LIMITS.distanceMeters.max,
      value: 1.2,
    });
    const track = slider.object3d.children.find((child) =>
      child.name === "spatial-slider-track-position-test");
    const fill = slider.object3d.children.find((child) =>
      child.name === "spatial-slider-fill-position-test");
    const thumb = slider.object3d.children.find((child) =>
      child.name === "spatial-slider-thumb-position-test");
    const labelPlate = slider.object3d.children.find((child) =>
      child.name === "spatial-slider-label-plate-position-test");
    const hitArea = slider.target.object3d;
    if (!(track instanceof THREE.Mesh) || !(fill instanceof THREE.Mesh) ||
      !(thumb instanceof THREE.Mesh) || !(hitArea instanceof THREE.Mesh) ||
      !(hitArea.geometry instanceof THREE.PlaneGeometry) ||
      !(track.material instanceof THREE.ShaderMaterial) ||
      !(fill.material instanceof THREE.ShaderMaterial)) {
      throw new Error("Slider meshes are missing.");
    }
    const trackTint = track.material.uniforms.tint?.value;
    const fillTint = fill.material.uniforms.tint?.value;
    if (!(trackTint instanceof THREE.Vector4) || !(fillTint instanceof THREE.Vector4)) {
      throw new Error("Slider glass tint uniforms are missing.");
    }
    const hitSize = spatialSliderHitAreaSizeDp(
      "horizontal",
      xrTokens.sizesDp.sliderTrack.length,
      xrTokens.sizesDp.sliderTrack.thickness,
    );

    expect(track.userData.glassVariant).toBe("sliderTrack");
    expect(fill.userData.glassVariant).toBe("sliderThumb");
    expect(thumb.userData.glassVariant).toBe("sliderThumb");
    expect(labelPlate?.userData.glassVariant).toBe("pill");
    expect(track.material.transparent).toBe(true);
    expect(fill.material.transparent).toBe(true);
    expect(trackTint.w).toBe(xrTokens.glass.variants.sliderTrack.tint.alpha);
    expect(fillTint.w).toBe(xrTokens.glass.variants.sliderThumb.tint.alpha);
    expect(trackTint.x).toBeGreaterThan(fillTint.x);
    expect(hitArea.geometry.parameters.width).toBeCloseTo(dpToMeters(hitSize.widthDp));
    expect(hitArea.geometry.parameters.height).toBeCloseTo(dpToMeters(hitSize.heightDp));
    expect(fill.scale.x).toBeCloseTo(
      (slider.value - PANEL_LIMITS.distanceMeters.min) /
        (PANEL_LIMITS.distanceMeters.max - PANEL_LIMITS.distanceMeters.min),
    );
    slider.dispose();
  });
});
