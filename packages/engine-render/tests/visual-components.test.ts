import { describe, expect, it, vi } from "vitest";
import { MeshBasicMaterial } from "three";
import {
  AngleArc,
  BeamLine,
  createPlaneMapper,
  LabelSprite,
  PointMarker,
  visualTokens,
  type LabelCanvas,
  type LabelCanvasContext,
} from "../src/index.js";

const mapper = createPlaneMapper({ scale: 1, origin: [0, 0, 0] });

function fakeCanvas() {
  const calls: string[] = [];
  const context: LabelCanvasContext = {
    clearRect: () => calls.push("clear"),
    beginPath: () => calls.push("path"),
    roundRect: () => calls.push("round"),
    fill: () => calls.push("fill"),
    fillText: (text) => calls.push(text),
    set fillStyle(_value: string | CanvasGradient | CanvasPattern) {},
    set font(_value: string) {},
    set textAlign(_value: CanvasTextAlign) {},
    set textBaseline(_value: CanvasTextBaseline) {},
  };
  const canvas: LabelCanvas = {
    width: 0,
    height: 0,
    getContext: () => context,
  };
  return { canvas, calls };
}

describe("beam line", () => {
  it("draws solid and dotted ribbons with one reusable geometry", () => {
    const beam = new BeamLine({
      mapper,
      tokens: { ...visualTokens, virtualDash: 0.2, virtualGap: 0.1 },
    });
    beam.setPoints([[0, 0], [2, 0]], "solid");
    expect(beam.mesh.geometry.getAttribute("position").count).toBe(4);

    beam.setPoints([[0, 0], [1, 0]], "dotted");
    const positionStorage = beam.mesh.geometry.getAttribute("position").array;
    expect(beam.mesh.geometry.getAttribute("position").count).toBe(16);
    expect(beam.mesh.geometry.drawRange.count).toBe(24);

    beam.setPoints([[0, 0], [1, 0]], "dotted");
    expect(beam.mesh.geometry.getAttribute("position").array).toBe(positionStorage);
    beam.setPoints([[0, 0], [0.5, 0]], "solid");
    expect(beam.mesh.geometry.getAttribute("position").array).toBe(positionStorage);
    beam.dispose();
  });

  it("disposes geometry and material", () => {
    const beam = new BeamLine({ mapper });
    const geometryDispose = vi.spyOn(beam.mesh.geometry, "dispose");
    const material = beam.mesh.material;
    const materialDispose = vi.spyOn(material, "dispose");

    beam.dispose();

    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
  });
});

describe("angle arc labels", () => {
  it("formats one decimal place and omits trailing zeroes", () => {
    const angled = fakeCanvas();
    const arc = new AngleArc({ mapper, createCanvas: () => angled.canvas });
    arc.set([0, 0], [1, 0], [Math.cos(33.69 * Math.PI / 180), Math.sin(33.69 * Math.PI / 180)]);
    expect(angled.calls).toContain("33.7°");

    const rightAngle = fakeCanvas();
    const square = new AngleArc({ mapper, createCanvas: () => rightAngle.canvas });
    square.set([0, 0], [1, 0], [0, 1]);
    expect(rightAngle.calls).toContain("90°");
    arc.dispose();
    square.dispose();
  });
});

describe("label sprite", () => {
  it("redraws only when its text changes", () => {
    const fake = fakeCanvas();
    const label = new LabelSprite({ createCanvas: () => fake.canvas });

    label.setText("angle");
    label.setText("angle");
    expect(fake.calls.filter((call) => call === "angle")).toHaveLength(1);
    label.setText("new angle");
    expect(fake.calls.filter((call) => call === "new angle")).toHaveLength(1);
    label.dispose();
  });
});

describe("point marker", () => {
  it("uses supplied colors and gives virtual markers lower opacity", () => {
    const customTokens = {
      ...visualTokens,
      objectMarkerColor: 0x123456,
      imageMarkerColor: 0xabcdef,
      virtualOpacity: 0.25,
    };
    const object = new PointMarker({ kind: "object", mapper, tokens: customTokens });
    const image = new PointMarker({ kind: "image", mapper, tokens: customTokens });

    expect((object.mesh.material as MeshBasicMaterial).color.getHex()).toBe(0x123456);
    expect((image.mesh.material as MeshBasicMaterial).color.getHex()).toBe(0xabcdef);
    expect((image.mesh.material as MeshBasicMaterial).opacity).toBeLessThan(
      (object.mesh.material as MeshBasicMaterial).opacity,
    );
    object.dispose();
    image.dispose();
  });
});
