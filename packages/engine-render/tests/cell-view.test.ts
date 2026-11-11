import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  CellView,
  cellOrganelleTarget,
  organelleDetailTarget,
  parseCellTarget,
  type CellSceneCell,
  type CellSceneFrame,
} from "../src/cell-view.js";
import { preferForeground } from "../src/scene-renderer.js";

const organelle = (id: string, kind: CellSceneCell["organelles"][number]["organelle"], x: number) => ({
  id,
  organelle: kind,
  position: { x, y: -0.6, z: 0 },
  axis: { x: 0, y: 0, z: 1 },
  roll: 0,
  size: { x: 0.4, y: 0.16, z: 0.16 },
});

const plant: CellSceneCell = {
  id: "plant",
  position: { x: -2.5, y: 0, z: 0 },
  body: { shape: "rounded-box", size: { x: 4, y: 3, z: 2.4 }, wallThickness: 0.14, wobble: 0, seed: 1 },
  nucleus: { position: { x: -1.2, y: 0.5, z: 0 }, radius: 0.4, nucleolusRadius: 0.14 },
  reticulum: { facing: { x: 1, y: 0, z: 0 }, innerRadius: 0.48, outerRadius: 0.72 },
  vacuoles: [{ id: "vacuole-1", position: { x: 0.4, y: 0, z: 0 }, radii: { x: 1, y: 0.7, z: 0.5 } }],
  golgi: [{ id: "golgi-1", position: { x: -1.2, y: -0.7, z: 0 }, axis: { x: 0, y: -1, z: 0 }, size: 0.4 }],
  organelles: [organelle("chloroplast-1", "chloroplast", 1.4), organelle("mitochondrion-1", "mitochondrion", -0.2)],
};

const animal: CellSceneCell = {
  ...plant,
  id: "animal",
  position: { x: 2.5, y: 0, z: 0 },
  body: { shape: "blob", size: { x: 3.6, y: 3, z: 2.6 }, wallThickness: 0, wobble: 0.08, seed: 2 },
  vacuoles: [],
  organelles: [organelle("mitochondrion-1", "mitochondrion", 0.8), organelle("lysosome-1", "lysosome", -0.4)],
};

const frame: CellSceneFrame = {
  cells: [plant, animal],
  details: [
    { id: "mito", organelle: "mitochondrion", position: { x: 0, y: 3, z: 0 }, length: 2, yaw: 0, cutaway: true },
    { id: "chloro", organelle: "chloroplast", position: { x: 0, y: -3, z: 0 }, length: 2, yaw: 0, cutaway: false },
  ],
};

const glow = (object: THREE.Object3D) => ((object as THREE.Mesh).material as THREE.MeshPhysicalMaterial).emissive.getHex();
const targets = (view: CellView) => new Set(view.interactiveMeshes.map((mesh) => mesh.userData.interactionTarget as string));

describe("CellView", () => {
  it("draws each cell's structures as pick targets", () => {
    const view = new CellView();
    view.update(frame);
    const found = targets(view);
    for (const structure of ["cell-wall", "cell-membrane", "nucleus", "endoplasmic-reticulum", "golgi-apparatus", "vacuole", "chloroplast", "mitochondrion"]) {
      expect(found.has(cellOrganelleTarget("plant", structure))).toBe(true);
    }
    expect(found.has(cellOrganelleTarget("animal", "cell-wall"))).toBe(false);
    expect(found.has(cellOrganelleTarget("animal", "chloroplast"))).toBe(false);
    expect(found.has(cellOrganelleTarget("animal", "lysosome"))).toBe(true);
    view.dispose();
  });

  it("draws every part of the detail models", () => {
    const view = new CellView();
    view.update(frame);
    const found = targets(view);
    for (const part of ["outer-membrane", "inner-membrane", "cristae", "matrix"] as const) {
      expect(found.has(organelleDetailTarget("mito", part))).toBe(true);
    }
    for (const part of ["outer-membrane", "inner-membrane", "grana", "stroma"] as const) {
      expect(found.has(organelleDetailTarget("chloro", part))).toBe(true);
    }
    view.dispose();
  });

  it("places instanced organelles from the frame", () => {
    const view = new CellView();
    view.update(frame);
    const batch = view.root.getObjectByName("cell-animal-mitochondrion") as THREE.InstancedMesh;
    expect(batch.count).toBe(1);
    const matrix = new THREE.Matrix4();
    batch.getMatrixAt(0, matrix);
    expect(new THREE.Vector3().setFromMatrixPosition(matrix).x).toBeCloseTo(0.8, 6);
    view.dispose();
  });

  it("marks see-through shells so picks reach the organelles inside", () => {
    const view = new CellView();
    view.update(frame);
    const backdrop = view.interactiveMeshes.filter((mesh) => mesh.userData.pickBackdrop === true);
    expect(new Set(backdrop.map((mesh) => mesh.userData.interactionTarget))).toEqual(
      new Set([
        cellOrganelleTarget("plant", "cell-wall"),
        cellOrganelleTarget("plant", "cell-membrane"),
        cellOrganelleTarget("plant", "vacuole"),
        cellOrganelleTarget("animal", "cell-membrane"),
      ]),
    );
    view.dispose();
  });

  it("brightens only the highlighted target", () => {
    const view = new CellView();
    view.update(frame);
    const mito = view.root.getObjectByName("cell-plant-mitochondrion") as THREE.InstancedMesh;
    const chloro = view.root.getObjectByName("cell-plant-chloroplast") as THREE.InstancedMesh;
    view.setHighlight(cellOrganelleTarget("plant", "mitochondrion"));
    expect(glow(mito)).not.toBe(0);
    expect(glow(chloro)).toBe(0);
    view.setHighlight(null);
    expect(glow(mito)).toBe(0);
    view.dispose();
  });

  it("keeps the highlight across a redraw and covers everything in its bounding radius", () => {
    const view = new CellView({ quality: "low" });
    view.update(frame);
    view.setHighlight(cellOrganelleTarget("animal", "nucleus"));
    view.update(frame);
    const nucleus = view.root.getObjectByName("cell-animal-nucleus") as THREE.Mesh;
    expect(glow(nucleus)).not.toBe(0);
    expect(view.boundingRadius).toBeGreaterThan(4);
    view.dispose();
    expect(view.root.parent).toBeNull();
  });

  it("opens a wedge in cut-away detail models", () => {
    const view = new CellView();
    view.update(frame);
    const vertexCount = (detailId: string) => {
      const holder = view.root.getObjectByName(`detail-${detailId}`) as THREE.Group;
      const outer = holder.children.find((child) => child.userData.interactionTarget === organelleDetailTarget(detailId, "outer-membrane")) as THREE.Mesh;
      const box = new THREE.Box3().setFromBufferAttribute(outer.geometry.getAttribute("position") as THREE.BufferAttribute);
      return box.max.z;
    };
    // The closed chloroplast reaches the front (+z); the opened mitochondrion does not.
    expect(vertexCount("chloro")).toBeCloseTo(1, 2);
    expect(vertexCount("mito")).toBeLessThan(0.44 * 0.9);
    view.dispose();
  });
});

describe("hidden organelles", () => {
  it("leaves out the organelles a close-up replaces", () => {
    const view = new CellView();
    view.update({ ...frame, hiddenOrganelles: ["animal:mitochondrion-1"] });
    const batch = view.root.getObjectByName("cell-animal-mitochondrion");
    expect(batch).toBeUndefined();
    expect((view.root.getObjectByName("cell-plant-mitochondrion") as THREE.InstancedMesh).count).toBe(1);
    view.dispose();
  });
});

describe("cell pick targets", () => {
  it("round-trips cell and detail targets and rejects others", () => {
    expect(parseCellTarget(cellOrganelleTarget("plant", "chloroplast"))).toEqual({ kind: "cell", cellId: "plant", organelle: "chloroplast" });
    expect(parseCellTarget(organelleDetailTarget("mito", "cristae"))).toEqual({ kind: "detail", detailId: "mito", part: "cristae" });
    expect(parseCellTarget("detail:mito:nucleus")).toBeNull();
    expect(parseCellTarget("part:battery")).toBeNull();
  });
});

describe("preferForeground", () => {
  const hit = (backdrop: boolean) => {
    const object = new THREE.Object3D();
    if (backdrop) object.userData.pickBackdrop = true;
    return { object, distance: 1 };
  };

  it("drops shell hits when something solid is hit, and keeps them otherwise", () => {
    const shell = hit(true);
    const solid = hit(false);
    expect(preferForeground([shell, solid])).toEqual([solid]);
    expect(preferForeground([shell])).toEqual([shell]);
    expect(preferForeground([])).toEqual([]);
  });
});
