import { describe, expect, it } from "vitest";
import {
  boundingRadius,
  insideMembrane,
  isPresentIn,
  layoutCell,
  type CellLayout,
  type PlacedOrganelleKind,
} from "../src/index.js";

const count = (layout: CellLayout, organelle: PlacedOrganelleKind) =>
  layout.organelles.filter((placed) => placed.organelle === organelle).length;

describe("layoutCell", () => {
  const plant = layoutCell("plant");
  const animal = layoutCell("animal");

  it("is deterministic and changes with the seed", () => {
    expect(layoutCell("plant")).toEqual(plant);
    expect(layoutCell("plant", { seed: 7 }).organelles).not.toEqual(plant.organelles);
  });

  it("draws a walled box for plants and a wall-less blob for animals", () => {
    expect(plant.body.shape).toBe("rounded-box");
    expect(plant.body.wallThickness).toBeGreaterThan(0);
    expect(animal.body.shape).toBe("blob");
    expect(animal.body.wallThickness).toBe(0);
  });

  it("gives plants one large vacuole and animals small ones", () => {
    expect(plant.vacuoles).toHaveLength(1);
    const plantVolume = volume(plant.vacuoles[0]!.radii);
    for (const vacuole of animal.vacuoles) expect(volume(vacuole.radii)).toBeLessThan(plantVolume / 20);
  });

  it("places every requested organelle", () => {
    expect(count(plant, "chloroplast")).toBe(16);
    expect(count(plant, "mitochondrion")).toBe(8);
    expect(count(plant, "ribosome")).toBe(160);
    expect(count(animal, "mitochondrion")).toBe(14);
    expect(count(animal, "lysosome")).toBe(6);
    expect(count(animal, "ribosome")).toBe(200);
  });

  it("places fewer small parts at light density", () => {
    const light = layoutCell("animal", { density: "light" });
    expect(count(light, "ribosome")).toBeLessThan(count(animal, "ribosome"));
    expect(count(light, "mitochondrion")).toBe(10);
  });

  it("only places organelles the cell kind contains", () => {
    for (const layout of [plant, animal]) {
      for (const placed of layout.organelles) expect(isPresentIn(placed.organelle, layout.kind)).toBe(true);
    }
    expect(count(animal, "chloroplast")).toBe(0);
  });

  it("keeps organelles inside the membrane and out of the nucleus and vacuoles", () => {
    for (const layout of [plant, animal]) {
      for (const placed of layout.organelles) {
        const radius = boundingRadius(placed.size);
        expect(insideMembrane(placed.position, radius, layout.body)).toBe(true);
        expect(distance(placed.position, layout.nucleus.position)).toBeGreaterThan(layout.nucleus.radius + radius);
        for (const vacuole of layout.vacuoles) {
          const dx = (placed.position.x - vacuole.position.x) / (vacuole.radii.x + radius);
          const dy = (placed.position.y - vacuole.position.y) / (vacuole.radii.y + radius);
          const dz = (placed.position.z - vacuole.position.z) / (vacuole.radii.z + radius);
          expect(dx * dx + dy * dy + dz * dz).toBeGreaterThan(1);
        }
      }
    }
  });

  it("keeps larger organelles from overlapping each other", () => {
    for (const layout of [plant, animal]) {
      const large = layout.organelles.filter((placed) => placed.organelle !== "ribosome");
      for (let i = 0; i < large.length; i += 1) {
        for (let j = i + 1; j < large.length; j += 1) {
          const a = large[i]!;
          const b = large[j]!;
          expect(distance(a.position, b.position)).toBeGreaterThan(boundingRadius(a.size) + boundingRadius(b.size));
        }
      }
    }
  });

  it("uses unit axes and the given id and position", () => {
    const moved = layoutCell("plant", { id: "left", position: { x: -3, y: 0, z: 0 } });
    expect(moved.id).toBe("left");
    expect(moved.position).toEqual({ x: -3, y: 0, z: 0 });
    for (const placed of moved.organelles) {
      expect(Math.hypot(placed.axis.x, placed.axis.y, placed.axis.z)).toBeCloseTo(1, 6);
    }
    expect(Math.hypot(moved.reticulum.facing.x, moved.reticulum.facing.y)).toBeCloseTo(1, 6);
  });
});

function volume(radii: { x: number; y: number; z: number }): number {
  return radii.x * radii.y * radii.z;
}

function distance(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
