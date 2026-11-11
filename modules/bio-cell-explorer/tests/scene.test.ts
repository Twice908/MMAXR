import { layoutCell } from "@mma/kit-biology";
import { describe, expect, it } from "vitest";
import {
  DETAIL_CELL,
  DETAIL_GROWTH,
  INTRO_SHOT,
  WORDS_ROOM,
  buildSceneFrame,
  cameraShot,
  chapterDetails,
  detailForShot,
  fitDistance,
  organelleAnchor,
  organelleSpot,
  stageLabels,
  stagePlan,
} from "../src/scene.js";

const wide = stagePlan(16 / 9);
const tall = stagePlan(390 / 844);
const cellsFor = (plan: typeof wide) => [layoutCell("plant", { position: plan.plant }), layoutCell("animal", { position: plan.animal })];

describe("stage plan", () => {
  it("puts the cells side by side on wide screens and stacks them on tall ones", () => {
    expect(wide.arrangement).toBe("wide");
    expect(wide.plant.x).toBeLessThan(wide.animal.x);
    expect(tall.arrangement).toBe("tall");
    expect(tall.plant.y).toBeGreaterThan(tall.animal.y);
    expect(stagePlan(0.95).arrangement).toBe("wide");
  });
});

describe("camera shots", () => {
  it("backs away further on narrower screens", () => {
    expect(fitDistance(10, 4, 0.5)).toBeGreaterThan(fitDistance(10, 4, 1.8));
    expect(fitDistance(2, 8, 2)).toBeGreaterThan(fitDistance(2, 4, 2));
  });

  it("starts far out in empty space and leaves room for the words below the model", () => {
    const space = cameraShot(INTRO_SHOT, wide, 16 / 9);
    const full = cameraShot("wide", wide, 16 / 9);
    expect(space.distance).toBeGreaterThan(full.distance * 3);
    // The focus drops below the cells, so they sit in the upper part of the frame.
    expect(full.focus.y).toBeLessThan(0);
    expect(space.focus.y).toBe(0);
    expect(WORDS_ROOM).toBeGreaterThan(0);
  });

  it("frames each cell and the close-ups where they are", () => {
    expect(cameraShot("plant", wide, 1.6).focus.x).toBe(wide.plant.x);
    expect(cameraShot("animal", tall, 0.5).focus.x).toBe(tall.animal.x);
  });

  it("zooms right into the opened organelle, much closer than a cell shot", () => {
    const cells = cellsFor(wide);
    const spot = organelleSpot("mitochondrion", cells)!;
    const close = cameraShot("mito-detail", wide, 1.6, 40, cells);
    expect(close.focus.x).toBeCloseTo(spot.position.x, 6);
    expect(close.distance).toBeLessThan(cameraShot("animal", wide, 1.6).distance / 3);
  });
});

describe("close-ups", () => {
  it("maps shots to close-ups and gathers a chapter's close-ups", () => {
    expect(detailForShot("mito-detail")).toBe("mitochondrion");
    expect(detailForShot("chloro-detail")).toBe("chloroplast");
    expect(detailForShot("wide")).toBeNull();
    expect(chapterDetails({ id: "c", title: "C", missionId: "m", beats: [
      { id: "a", captionText: "A", shot: "plant", durationMs: 1 },
      { id: "b", captionText: "B", shot: "mito-detail", durationMs: 1 },
    ] })).toEqual(["mitochondrion"]);
    expect(chapterDetails(undefined)).toEqual([]);
  });

  it("opens a real mitochondrion in the animal cell and a real chloroplast in the plant cell", () => {
    const cells = cellsFor(wide);
    expect(DETAIL_CELL).toEqual({ mitochondrion: "animal", chloroplast: "plant" });
    const mito = organelleSpot("mitochondrion", cells)!;
    const animal = cells[1]!;
    const placed = animal.organelles.find((item) => item.id === mito.instanceId)!;
    expect(mito.cellId).toBe("animal");
    expect(placed.organelle).toBe("mitochondrion");
    expect(mito.position).toEqual({ x: animal.position.x + placed.position.x, y: placed.position.y, z: placed.position.z });
    expect(mito.length).toBeCloseTo(placed.size.x * DETAIL_GROWTH, 10);
    expect(organelleSpot("chloroplast", cells)?.cellId).toBe("plant");
    expect(organelleSpot("chloroplast", [cells[1]!])).toBeNull();
  });

  it("builds a frame with the close-up in place of the organelle it opens", () => {
    const cells = cellsFor(wide);
    const spot = organelleSpot("chloroplast", cells)!;
    const frame = buildSceneFrame(cells, [spot]);
    expect(frame.cells).toHaveLength(2);
    expect(frame.details).toEqual([{ id: "chloroplast", organelle: "chloroplast", position: spot.position, length: spot.length, yaw: 0, cutaway: true }]);
    expect(frame.hiddenOrganelles).toEqual([`plant:${spot.instanceId}`]);
    expect(buildSceneFrame(cells, []).hiddenOrganelles).toEqual([]);
  });
});

describe("pinned labels", () => {
  const cells = cellsFor(wide);

  it("names both cells, and the highlighted structure", () => {
    const labels = stageLabels({ status: "beats", shot: "plant", highlight: "cell:plant:cell-wall" }, wide, cells);
    expect(labels.map((label) => label.text)).toEqual(["Plant cell", "Animal cell", "Cell wall"]);
    expect(labels[2]).toMatchObject({ tone: "organelle", emphasis: true });
  });

  it("shows no labels while a checkpoint or question waits, so none gives the answer away", () => {
    for (const status of ["intro", "checkpoint", "questions"]) {
      expect(stageLabels({ status, shot: "wide", highlight: null }, wide, cells)).toEqual([]);
    }
  });

  it("names every part of an opened close-up, emphasising the highlighted one", () => {
    const labels = stageLabels({ status: "beats", shot: "mito-detail", highlight: "detail:mitochondrion:cristae" }, wide, cells);
    expect(labels.map((label) => label.text)).toEqual(["Outer membrane", "Inner membrane", "Cristae", "Matrix"]);
    expect(labels.filter((label) => label.emphasis).map((label) => label.text)).toEqual(["Cristae"]);
  });

  it("puts the lower cell's name below it when the cells are stacked", () => {
    const labels = stageLabels({ status: "beats", shot: "wide", highlight: null }, tall, cellsFor(tall));
    expect(labels.map((label) => [label.text, label.side])).toEqual([["Plant cell", "above"], ["Animal cell", "below"]]);
  });

  it("pins an organelle's name to the one nearest the viewer", () => {
    const plant = cells[0]!;
    const anchor = organelleAnchor(plant, "chloroplast");
    const frontZ = Math.max(...plant.organelles.filter((item) => item.organelle === "chloroplast").map((item) => item.position.z));
    expect(anchor?.z).toBeCloseTo(frontZ, 6);
    expect(anchor?.x).toBeLessThan(0);
    expect(organelleAnchor(cells[1]!, "chloroplast")).toBeNull();
  });
});
