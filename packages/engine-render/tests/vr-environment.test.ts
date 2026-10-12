import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import {
  createVrEnvironment,
  createVrEnvironmentForSession,
  shouldCreateVrEnvironment,
} from "../src/visuals/vr-environment.js";

describe("procedural VR environment", () => {
  it("is selected only for opaque immersive VR sessions", () => {
    expect(shouldCreateVrEnvironment("immersive-vr", "opaque")).toBe(true);
    expect(shouldCreateVrEnvironment("immersive-ar", "opaque")).toBe(false);
    expect(shouldCreateVrEnvironment("immersive-vr", "alpha-blend")).toBe(false);
    expect(shouldCreateVrEnvironment("immersive-vr", undefined)).toBe(false);
    expect(createVrEnvironmentForSession("immersive-ar", "opaque")).toBeNull();
    expect(createVrEnvironmentForSession("immersive-vr", "alpha-blend")).toBeNull();
    const created = createVrEnvironmentForSession("immersive-vr", "opaque");
    expect(created).not.toBeNull();
    created?.dispose();
  });

  it("tracks the viewer, places its fallback floor, and releases each VR cycle", () => {
    for (let cycle = 0; cycle < 2; cycle += 1) {
      const environment = createVrEnvironment();
      const disposed = vi.fn();
      const sky = environment.root.getObjectByName("vr-gradient-sky");
      const floor = environment.root.getObjectByName("vr-dim-grid-floor");
      expect(sky).toBeInstanceOf(THREE.Mesh);
      expect(floor).toBeInstanceOf(THREE.Mesh);
      if (!(sky instanceof THREE.Mesh) || !(floor instanceof THREE.Mesh)) {
        throw new Error("VR environment meshes were not created.");
      }
      const geometries = [sky.geometry, floor.geometry, environment.atomRing.geometry];
      const materials = [sky.material, floor.material, environment.atomRing.material]
        .flatMap((material) => Array.isArray(material) ? material : [material]);
      for (const geometry of geometries) geometry.addEventListener("dispose", disposed);
      for (const material of materials) material.addEventListener("dispose", disposed);

      environment.setViewerPosition({ x: 1, y: 2, z: 3 });
      environment.setFallbackFloorFromViewer(1.7);
      expect(sky.position.toArray()).toEqual([1, 2, 3]);
      expect(floor.position.y).toBeCloseTo(0.1);
      expect(environment.triangleCount).toBeLessThan(5_000);
      environment.dispose();

      expect(environment.disposed).toBe(true);
      expect(environment.root.parent).toBeNull();
      expect(environment.atomRing.parent).toBeNull();
      expect(disposed).toHaveBeenCalledTimes(6);
      environment.dispose();
      expect(disposed).toHaveBeenCalledTimes(6);
    }
  });
});
