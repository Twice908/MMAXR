import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { ScreenSceneFrame } from "../src/atom-view.js";
import {
  MoleculeView,
  atomIdFromTarget,
  moleculeAtomTarget,
  type MoleculeSceneFrame,
} from "../src/molecule-view.js";

const atomFrame = (radius: number): ScreenSceneFrame => ({
  nucleusRadius: 0.4,
  spheres: [
    { id: "proton", color: 0xff0000, radius: 0.18, interactionTarget: "nucleus", positions: [{ x: 0, y: 0, z: 0 }] },
    { id: "electron", color: 0xffff00, radius: 0.09, interactionTarget: null, positions: [{ x: radius, y: 0, z: 0 }] },
  ],
  rings: [
    {
      shell: 1,
      radius,
      slots: [
        { id: "1:0", position: { x: radius, y: 0, z: 0 }, occupied: true },
        { id: "1:1", position: { x: -radius, y: 0, z: 0 }, occupied: false },
      ],
    },
  ],
});

const pair = (kind: "attraction" | "bond" | null): MoleculeSceneFrame => ({
  atoms: [
    { id: "na-1", position: { x: -2, y: 0, z: 0 }, radius: 1.2, atom: atomFrame(1.1) },
    { id: "cl-1", position: { x: 2, y: 0, z: 0 }, radius: 1.5, atom: atomFrame(1.4) },
  ],
  links: kind ? [{ from: "na-1", to: "cl-1", kind }] : [],
});

describe("MoleculeView", () => {
  it("draws each atom at its position with one pick sphere per atom", () => {
    const view = new MoleculeView();
    view.update(pair(null));
    expect(view.root.getObjectByName("molecule-atom-na-1")?.position.x).toBe(-2);
    expect(view.root.getObjectByName("molecule-atom-cl-1")?.position.x).toBe(2);
    expect(view.interactiveMeshes.map((mesh) => mesh.userData.interactionTarget)).toEqual(["atom:na-1", "atom:cl-1"]);
    expect(view.interactiveMeshes[1]?.scale.x).toBe(1.5);
    expect(view.boundingRadius).toBeCloseTo(3.5);
    expect(view.atomPosition("cl-1")).toEqual({ x: 2, y: 0, z: 0 });
    expect(view.atomPosition("k-1")).toBeNull();
  });

  it("draws an attraction line, then a bond line, between the atoms", () => {
    const view = new MoleculeView();
    view.update(pair("attraction"));
    const line = view.root.getObjectByName("molecule-link-attraction-na-1-cl-1");
    expect(line).toBeInstanceOf(THREE.Mesh);
    expect(line?.position.x).toBeCloseTo(0);
    view.update(pair("bond"));
    expect(view.root.getObjectByName("molecule-link-attraction-na-1-cl-1")).toBeUndefined();
    expect(view.root.getObjectByName("molecule-link-bond-na-1-cl-1")).toBeInstanceOf(THREE.Mesh);
  });

  it("reuses atoms that stay and removes atoms that leave", () => {
    const view = new MoleculeView();
    view.update(pair(null));
    const sodium = view.root.getObjectByName("molecule-atom-na-1");
    view.update({ atoms: [pair(null).atoms[0]!], links: [] });
    expect(view.root.getObjectByName("molecule-atom-na-1")).toBe(sodium);
    expect(view.root.getObjectByName("molecule-atom-cl-1")).toBeUndefined();
    expect(view.interactiveMeshes).toHaveLength(1);
  });

  it("highlights only the chosen atom and shows free slots on request", () => {
    const view = new MoleculeView();
    view.update(pair(null));
    view.setHighlight("atom:cl-1");
    const opacity = (mesh: THREE.Object3D) => ((mesh as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity;
    expect(view.interactiveMeshes.map(opacity)).toEqual([0, 0.16]);
    view.setHighlight(null);
    expect(view.interactiveMeshes.map(opacity)).toEqual([0, 0]);
    view.setSlotsVisible(true);
    expect(view.root.getObjectByName("atom-slot-1:1")?.visible).toBe(true);
    view.setSlotsVisibleFor(["cl-1"]);
    const slotIn = (id: string) => view.root.getObjectByName(`molecule-atom-${id}`)?.getObjectByName("atom-slot-1:1")?.visible;
    expect([slotIn("na-1"), slotIn("cl-1")]).toEqual([false, true]);
    view.dispose();
    expect(view.root.parent).toBeNull();
  });

  it("adds, re-draws and removes in-scene labels that ignore pointer rays", () => {
    const drawn: string[] = [];
    const view = new MoleculeView({
      createCanvas: () => {
        drawn.push("canvas");
        return { width: 0, height: 0, getContext: () => null } as unknown as HTMLCanvasElement;
      },
    });
    view.update(pair(null));
    const label = (charge: string) => ({ id: "na-1", symbol: "Na", charge, tone: "neutral" as const, position: { x: -2, y: 2, z: 0 } });
    view.setLabels([label("")]);
    const sprite = view.root.getObjectByName("molecule-label-na-1") as THREE.Sprite;
    expect(sprite).toBeInstanceOf(THREE.Sprite);
    expect(sprite.position.y).toBeCloseTo(2 + sprite.scale.y / 2);
    const hits: THREE.Intersection[] = [];
    sprite.raycast(new THREE.Raycaster(), hits);
    expect(hits).toEqual([]);

    view.setLabels([label("")]);
    expect(drawn).toHaveLength(1);
    view.setLabels([label("+")]);
    expect(drawn).toHaveLength(2);
    view.setLabels([]);
    expect(view.root.getObjectByName("molecule-label-na-1")).toBeUndefined();
  });

  it("converts between atom ids and pick targets", () => {
    expect(moleculeAtomTarget("cl-2")).toBe("atom:cl-2");
    expect(atomIdFromTarget("atom:cl-2")).toBe("cl-2");
    expect(atomIdFromTarget("shell:3")).toBeNull();
    expect(atomIdFromTarget("atom:")).toBeNull();
    expect(atomIdFromTarget(null)).toBeNull();
  });
});
