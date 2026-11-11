import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { AtomView, type ScreenSceneFrame } from "../src/atom-view.js";

const frame: ScreenSceneFrame = {
  nucleusRadius: 0.3,
  spheres: [
    { id: "proton", color: 0xd64c35, radius: 0.18, interactionTarget: null, positions: [{ x: 0, y: 0, z: 0 }] },
    { id: "electron", color: 0xf0b323, radius: 0.1, interactionTarget: null, positions: [{ x: 1, y: 0, z: 0 }] },
  ],
  rings: [{ shell: 1, radius: 1, slots: [{ id: "1:0", position: { x: 1, y: 0, z: 0 }, occupied: true }], emphasis: "pulse" }],
};

describe("luminous atom", () => {
  it("can be raycast without a camera, as IWSDK's XR pointer does every frame", () => {
    const view = new AtomView({ style: "luminous" });
    view.update(frame);
    view.root.updateMatrixWorld(true);
    const raycaster = new THREE.Raycaster(new THREE.Vector3(0, 0, 5), new THREE.Vector3(0, 0, -1));
    expect(() => raycaster.intersectObject(view.root, true)).not.toThrow();
    view.dispose();
  });

  it("keeps the shell drop targets for picking", () => {
    const view = new AtomView({ style: "luminous" });
    view.update(frame);
    const targets = view.interactiveMeshes.map((mesh) => mesh.userData.interactionTarget as string);
    expect(targets).toEqual(expect.arrayContaining(["nucleus", "shell:1"]));
    view.dispose();
  });
});
