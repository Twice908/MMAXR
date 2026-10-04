import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  createRaycastPicker,
  createScreenRayPicker,
} from "../src/raycast-picker.js";
import { FakeDomElement } from "./helpers/fake-dom.js";

describe("raycast pickers", () => {
  function makeScene(meshInputId: string | null = "box:1") {
    const scene = new THREE.Scene();
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
    );
    if (meshInputId !== null) mesh.userData.inputId = meshInputId;
    group.add(mesh);
    scene.add(group);
    return { scene, group, mesh };
  }

  it("picks a world-space object by ray", () => {
    const { scene } = makeScene();
    const picker = createRaycastPicker(scene);

    const result = picker({
      origin: new THREE.Vector3(0, 0, 3),
      direction: new THREE.Vector3(0, 0, -1),
      source: "xr-controller",
      handedness: "right",
    });

    expect(result?.target).toBe("box:1");
    expect(result?.distance).toBeGreaterThan(0);
  });

  it("falls back to a tagged parent when the hit child is untagged", () => {
    const { scene, group, mesh } = makeScene(null);
    group.userData.inputId = "group:1";
    const picker = createRaycastPicker(scene);

    const result = picker({
      origin: new THREE.Vector3(0, 0, 3),
      direction: new THREE.Vector3(0, 0, -1),
      source: "xr-hand",
      handedness: "left",
    });

    expect(result?.target).toBe("group:1");
    expect(result?.object).toBe(group);
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  });

  it("prefers the nearest tagged object when both child and parent are tagged", () => {
    const { scene, group } = makeScene("child:1");
    group.userData.inputId = "group:1";
    const picker = createRaycastPicker(scene);

    const result = picker({
      origin: new THREE.Vector3(0, 0, 3),
      direction: new THREE.Vector3(0, 0, -1),
      source: "xr-controller",
    });

    expect(result?.target).toBe("child:1");
  });

  it("returns null for a miss", () => {
    const { scene } = makeScene();
    const picker = createRaycastPicker(scene);

    expect(
      picker({
        origin: new THREE.Vector3(5, 5, 3),
        direction: new THREE.Vector3(0, 0, -1),
        source: "xr-controller",
      }),
    ).toBeNull();
  });

  it("converts screen coordinates to a camera ray", () => {
    const { scene } = makeScene();
    const camera = new THREE.PerspectiveCamera(60, 4 / 3, 0.1, 100);
    camera.position.set(0, 0, 3);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();

    const dom = new FakeDomElement();
    const picker = createScreenRayPicker(camera, scene, dom as unknown as HTMLElement);

    expect(picker(400, 300)).toBe("box:1");
  });

  it("respects an object filter", () => {
    const { scene } = makeScene();
    const picker = createRaycastPicker(scene, {
      filter: () => false,
    });

    expect(
      picker({
        origin: new THREE.Vector3(0, 0, 3),
        direction: new THREE.Vector3(0, 0, -1),
        source: "xr-controller",
      }),
    ).toBeNull();
  });
});
