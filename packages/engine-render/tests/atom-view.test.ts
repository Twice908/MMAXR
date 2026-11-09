import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { AtomView, type ScreenSceneFrame } from "../src/atom-view.js";

const frame: ScreenSceneFrame = {
  nucleusRadius: 0.4,
  spheres: [
    { id: "proton", color: 0xff0000, radius: 0.18, interactionTarget: "nucleus", positions: [{ x: 0, y: 0, z: 0 }] },
    { id: "neutron", color: 0x00ff00, radius: 0.18, interactionTarget: "nucleus", positions: [] },
    { id: "electron", color: 0xffff00, radius: 0.09, interactionTarget: null, positions: [{ x: 1.05, y: 0, z: 0 }] },
  ],
  rings: [
    {
      shell: 1,
      radius: 1.05,
      slots: [
        { id: "1:0", position: { x: 1.05, y: 0, z: 0 }, occupied: true },
        { id: "1:1", position: { x: -1.05, y: 0, z: 0 }, occupied: false },
      ],
    },
  ],
};

describe("AtomView", () => {
  it("draws nucleons, electrons, shell rings and free slots from a frame", () => {
    const view = new AtomView();
    view.update(frame);
    expect(view.root.getObjectByName("atom-proton")).toBeInstanceOf(THREE.InstancedMesh);
    expect(view.root.getObjectByName("atom-neutron")).toBeUndefined();
    expect(view.root.getObjectByName("atom-electron")).toBeInstanceOf(THREE.InstancedMesh);
    expect(view.root.getObjectByName("atom-shell-1")).toBeDefined();
    expect(view.root.getObjectByName("atom-slot-1:1")?.visible).toBe(false);
    expect(view.root.getObjectByName("atom-slot-1:0")).toBeUndefined();
    view.dispose();
  });

  it("exposes nucleus and shell drop targets for picking", () => {
    const view = new AtomView();
    view.update(frame);
    const targets = view.interactiveMeshes.map((mesh) => mesh.userData.interactionTarget).sort();
    expect(targets).toEqual(["nucleus", "shell:1"]);
    view.dispose();
  });

  it("reports the outer radius for scaling", () => {
    const view = new AtomView();
    expect(view.boundingRadius).toBe(1);
    view.update(frame);
    expect(view.boundingRadius).toBeCloseTo(1.085);
    view.dispose();
  });

  it("shows slots and highlights a drop target during a drag", () => {
    const view = new AtomView();
    view.update(frame);
    view.setSlotsVisible(true);
    expect(view.root.getObjectByName("atom-slot-1:1")?.visible).toBe(true);
    const ring = view.root.getObjectByName("atom-shell-1") as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    const idle = ring.material.color.getHex();
    view.setHighlight("shell:1");
    expect(ring.material.color.getHex()).not.toBe(idle);
    view.setHighlight(null);
    expect(ring.material.color.getHex()).toBe(idle);
    view.dispose();
  });

  it("keeps slot visibility across rebuilds and replaces old content", () => {
    const view = new AtomView();
    view.update(frame);
    view.setSlotsVisible(true);
    view.update(frame);
    expect(view.root.getObjectByName("atom-slot-1:1")?.visible).toBe(true);
    let shells = 0;
    view.root.traverse((object) => {
      if (object.name === "atom-shell-1") shells += 1;
    });
    expect(shells).toBe(1);
    view.dispose();
    expect(view.root.parent).toBeNull();
  });
});
