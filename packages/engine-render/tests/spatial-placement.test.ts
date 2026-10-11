import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  canCreateSpatialPanels,
  shouldShowSpatialSettingsFallback,
} from "../src/screen-renderer.js";
import { calculateSpatialPanelPlacements } from "../src/visuals/spatial-placement.js";

describe("spatial panel placement", () => {
  it("places panels around the atom in the initial viewer orientation", () => {
    const placements = calculateSpatialPanelPlacements(
      { x: 0, y: 0, z: -0.6 },
      new THREE.Quaternion(),
      400,
      800,
    );

    expect(placements.mission.position.y).toBeCloseTo(0.37);
    expect(placements.particles.position.x).toBeCloseTo(-0.36);
    expect(placements.elementInfo.position.x).toBeCloseTo(0.36);
    expect(placements.narration.position.y).toBeCloseTo(-0.37);
    expect(placements.mission.position.z).toBeCloseTo(-0.75);
    expect(placements.mission.scale).toBe(0.82);
  });

  it("does not allow spatial panels in ordinary screen mode", () => {
    expect(canCreateSpatialPanels(false, false)).toBe(false);
    expect(canCreateSpatialPanels(true, false)).toBe(true);
    expect(canCreateSpatialPanels(false, true)).toBe(true);
  });

  it("shows the DOM settings fallback only while AR or Camera is active", () => {
    expect(shouldShowSpatialSettingsFallback(false, false)).toBe(false);
    expect(shouldShowSpatialSettingsFallback(true, false)).toBe(true);
    expect(shouldShowSpatialSettingsFallback(false, true)).toBe(true);
  });
});
