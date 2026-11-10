import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CircuitView, circuitPartTarget, type CircuitSceneFrame } from "../src/circuit-view.js";

const square = [
  { x: 0, y: -2, z: 0 },
  { x: -2, y: -2, z: 0 },
  { x: -2, y: 2, z: 0 },
  { x: 2, y: 2, z: 0 },
  { x: 2, y: -2, z: 0 },
  { x: 0, y: -2, z: 0 },
];

const frame = (flowing: boolean, flowSpeed = 2): CircuitSceneFrame => ({
  parts: [
    { id: "battery", shape: "battery", position: { x: 0, y: -2, z: 0 }, angle: Math.PI, length: 1.5, cells: 2 },
    { id: "key", shape: "switch", position: { x: -2, y: 0, z: 0 }, angle: Math.PI / 2, length: 1.4, closed: flowing },
    { id: "lamp", shape: "bulb", position: { x: 0, y: 2, z: 0 }, angle: 0, length: 1.2, glow: flowing ? 0.8 : 0 },
    { id: "ammeter", shape: "ammeter", position: { x: 2, y: 0, z: 0 }, angle: -Math.PI / 2, length: 1.2, dial: 0.3 },
  ],
  wires: [square],
  currentPath: flowing ? square : [],
  flowSpeed,
});

function chargeX(view: CircuitView): number {
  const charges = view.root.getObjectByName("circuit-charges") as THREE.InstancedMesh;
  const matrix = new THREE.Matrix4();
  charges.getMatrixAt(0, matrix);
  return new THREE.Vector3().setFromMatrixPosition(matrix).x;
}

describe("CircuitView", () => {
  it("draws every part with one pick box each", () => {
    const view = new CircuitView();
    view.update(frame(false));
    expect(view.interactiveMeshes.map((mesh) => mesh.userData.interactionTarget)).toEqual(
      ["battery", "key", "lamp", "ammeter"].map(circuitPartTarget),
    );
    expect(view.root.getObjectByName("circuit-part-lamp")).toBeDefined();
    expect(view.boundingRadius).toBeGreaterThan(2.8);
    view.dispose();
  });

  it("shows no charges or arrows without current", () => {
    const view = new CircuitView();
    view.update(frame(false));
    expect((view.root.getObjectByName("circuit-charges") as THREE.InstancedMesh).count).toBe(0);
    expect(view.root.getObjectByName("circuit-arrows")?.children).toHaveLength(0);
    view.dispose();
  });

  it("moves charges along the current path, and holds them still at speed 0", () => {
    const view = new CircuitView();
    view.update(frame(true));
    expect(view.root.getObjectByName("circuit-arrows")?.children).toHaveLength(4);
    // The path starts by running left along the bottom.
    const before = chargeX(view);
    view.tick(0.05);
    expect(chargeX(view)).toBeLessThan(before);

    view.update(frame(true, 0));
    const still = chargeX(view);
    view.tick(0.05);
    expect(chargeX(view)).toBe(still);
    view.dispose();
  });

  it("moves the charges each time the scene is drawn, using its clock", () => {
    let time = 1000;
    const view = new CircuitView({ now: () => time });
    view.update(frame(true));
    const charges = view.root.getObjectByName("circuit-charges") as THREE.InstancedMesh;
    const draw = () => charges.onBeforeRender(null as never, null as never, null as never, null as never, null as never, null as never);
    draw();
    const before = chargeX(view);
    time += 50;
    draw();
    expect(chargeX(view)).toBeLessThan(before);
    view.dispose();
  });

  it("highlights one part", () => {
    const view = new CircuitView();
    view.update(frame(true));
    view.setHighlight(circuitPartTarget("key"));
    const opacity = (id: string) =>
      ((view.root.getObjectByName(`circuit-pick-${id}`) as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity;
    expect(opacity("key")).toBeGreaterThan(0);
    expect(opacity("lamp")).toBe(0);
    view.dispose();
  });
});
