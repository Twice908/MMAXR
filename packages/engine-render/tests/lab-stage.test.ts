import { describe, expect, it, vi } from "vitest";
import { Color, Scene } from "three";
import { createPlaneMapper } from "../src/visuals/plane-mapper.js";
import { gridSegments } from "../src/visuals/grid-segments.js";
import { LabStage } from "../src/visuals/lab-stage.js";
import { TextCard } from "../src/visuals/text-card.js";
import { LabelSprite } from "../src/visuals/label-sprite.js";
import { visualTokens, type VisualTokens } from "../src/visuals/tokens.js";
import type { LabelCanvas, LabelCanvasContext } from "../src/visuals/label-sprite.js";

const mapper = createPlaneMapper({ scale: 1, origin: [0, 0, 0] });

describe("gridSegments", () => {
  it("returns the centred 10-by-10 one-unit grid with six major lines", () => {
    const segments = gridSegments(10, 1, 5);
    expect(segments).toHaveLength(22);
    expect(segments.filter(({ major }) => major)).toHaveLength(6);
    expect(segments.every(({ from, to }) =>
      Math.hypot(to[0] - from[0], to[1] - from[1]) === 10,
    )).toBe(true);
    expect(segments.slice(0, 11).map(({ from }) => from[0])).toEqual([
      -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5,
    ]);
  });
});

describe("LabStage", () => {
  it("switches modes in place and restores opaque surfaces", () => {
    const tokens = { ...visualTokens, stageBackgroundColor: 0x123456 };
    const scene = new Scene();
    const stage = new LabStage({ mapper, tokens });
    scene.add(stage.group);
    stage.setMode("opaque");
    expect((scene.background as Color).getHex()).toBe(tokens.stageBackgroundColor);
    expect(stage.plate.visible).toBe(true);
    expect(stage.floor.visible).toBe(true);
    const childCount = stage.group.children.length;

    stage.setMode("transparent");
    expect(scene.background).toBeNull();
    expect(stage.plate.visible).toBe(false);
    expect(stage.floor.visible).toBe(false);
    expect(stage.grid.visible).toBe(true);
    stage.setGridVisible(false);
    expect(stage.grid.visible).toBe(false);
    stage.setGridVisible(true);
    stage.setMode("opaque");
    expect(stage.plate.visible).toBe(true);
    expect(stage.floor.visible).toBe(true);
    expect(stage.group.children).toHaveLength(childCount);
  });

  it("disposes every stage geometry and material", () => {
    const stage = new LabStage({ mapper });
    const resources = [
      stage.plate.geometry,
      stage.plate.material,
      stage.floor.geometry,
      stage.floor.material,
      stage.grid.geometry,
      stage.grid.material,
    ];
    const disposers = resources.map((resource) => vi.spyOn(resource, "dispose"));
    stage.dispose();
    disposers.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
  });
});

describe("TextCard", () => {
  it("mirrors without altering text and redraws only for a changed value", () => {
    const context = {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      fill: vi.fn(),
      fillText: vi.fn(),
      fillStyle: "",
      font: "",
      textAlign: "center",
      textBaseline: "middle",
    } as LabelCanvasContext;
    const canvasFactory = (width: number, height: number): LabelCanvas => ({
      width,
      height,
      getContext: () => context,
    });
    const card = new TextCard({ mapper, createCanvas: canvasFactory });
    card.setText("Object");
    card.setMirrored(true);
    expect(card.mesh.scale.x).toBe(-1);
    expect(context.fillText).toHaveBeenLastCalledWith("Object", card.canvas.width / 2, card.canvas.height / 2);
    const draws = vi.mocked(context.fillText).mock.calls.length;
    card.setText("Object");
    expect(context.fillText).toHaveBeenCalledTimes(draws);
    card.setText("Image");
    expect(context.fillText).toHaveBeenCalledTimes(draws + 1);
    expect(context.fillText).toHaveBeenLastCalledWith("Image", card.canvas.width / 2, card.canvas.height / 2);
    card.setPose([1, 2], 90);
    expect(card.mesh.rotation.y).toBeCloseTo(Math.PI / 2);
    const disposeGeometry = vi.spyOn(card.mesh.geometry, "dispose");
    const disposeMaterial = vi.spyOn(card.mesh.material, "dispose");
    const map = card.mesh.material.map;
    if (!map) {
      throw new Error("Text card has no canvas texture.");
    }
    const disposeTexture = vi.spyOn(map, "dispose");
    card.dispose();
    expect(disposeGeometry).toHaveBeenCalledOnce();
    expect(disposeMaterial).toHaveBeenCalledOnce();
    expect(disposeTexture).toHaveBeenCalledOnce();
  });
});

it("draws labels above geometry at no less than their token minimum", () => {
  const context = {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    fillStyle: "",
    font: "",
    textAlign: "center",
    textBaseline: "middle",
  } as LabelCanvasContext;
  const label = new LabelSprite({
    tokens: { ...visualTokens, labelMinWidth: 2 },
    createCanvas: (width, height) => ({ width, height, getContext: () => context }),
  });
  label.setText("Readable");
  expect(label.sprite.material.depthTest).toBe(false);
  expect(label.sprite.renderOrder).toBe(visualTokens.labelRenderOrder);
  expect(label.sprite.scale.x).toBeGreaterThanOrEqual(2);
  label.dispose();
});

it("uses token-provided dimensions and colour on the stage and card", () => {
  const tokens: VisualTokens = {
    ...visualTokens,
    stagePlateSize: 7,
    textCardWidth: 3,
    stagePlateColor: 0x112233,
  };
  const stage = new LabStage({ mapper, tokens });
  const context = {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    fillStyle: "",
    font: "",
    textAlign: "center",
    textBaseline: "middle",
  } as LabelCanvasContext;
  const card = new TextCard({
    mapper,
    tokens,
    createCanvas: (width, height) => ({ width, height, getContext: () => context }),
  });
  expect(stage.plate.geometry.parameters.width).toBe(7);
  expect(stage.plate.material.color.getHex()).toBe(0x112233);
  expect(card.mesh.geometry.parameters.width).toBe(3);
});
