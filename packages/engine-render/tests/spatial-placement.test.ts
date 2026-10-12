import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  canCreateSpatialPanels,
  shouldShowSpatialSettingsFallback,
} from "../src/screen-renderer.js";
import {
  calculateSpatialPanelPlacements,
  gravityAlignedQuaternion,
} from "../src/visuals/spatial-placement.js";

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
    expect(placements.arControls.position.y).toBeCloseTo(-0.62);
    expect(placements.arControls.position.z).toBeCloseTo(-1);
    expect(placements.arControls.size).toEqual({ width: 0.58, height: 0.2 });
    expect(placements.mission.position.z).toBeCloseTo(-0.75);
    expect(placements.mission.scale).toBe(0.82);
  });

  it("does not allow spatial panels in ordinary screen mode", () => {
    expect(canCreateSpatialPanels(false, false)).toBe(false);
    expect(canCreateSpatialPanels(true, false)).toBe(true);
    expect(canCreateSpatialPanels(false, true)).toBe(true);
  });

  it("keeps panel orientation gravity-aligned for pitched, rolled, and vertical viewer poses", () => {
    const worldUp = new THREE.Vector3(0, 1, 0);
    const poses = [
      new THREE.Euler(0.7, 1.1, 0.8),
      new THREE.Euler(-0.9, -0.6, -1.2),
      new THREE.Euler(Math.PI / 2, 0.4, 0.9),
      new THREE.Euler(-Math.PI / 2, -1.3, 0.7),
    ];

    for (const pose of poses) {
      const aligned = gravityAlignedQuaternion(new THREE.Quaternion().setFromEuler(pose));
      const alignedUp = worldUp.clone().applyQuaternion(aligned);
      expect(alignedUp.x).toBeCloseTo(0);
      expect(alignedUp.y).toBeCloseTo(1);
      expect(alignedUp.z).toBeCloseTo(0);
    }
  });

  it("shows the DOM settings fallback only while AR or Camera is active", () => {
    expect(shouldShowSpatialSettingsFallback(false, false)).toBe(false);
    expect(shouldShowSpatialSettingsFallback(true, false)).toBe(true);
    expect(shouldShowSpatialSettingsFallback(false, true)).toBe(true);
  });
});
