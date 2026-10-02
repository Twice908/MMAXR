import { describe, expect, it } from "vitest";
import { arContentScale, type ScreenSceneFrame } from "../src/screen-renderer.js";

describe("AR scene scaling", () => {
  it("fits the complete outer geometry to a 27 cm diameter", () => {
    const frame: ScreenSceneFrame = {
      nucleusRadius: 0.5,
      spheres: [{
        id: "proton",
        color: 0,
        radius: 0.18,
        interactionTarget: null,
        positions: [{ x: 0, y: 0, z: 0 }],
      }],
      rings: [{ shell: 1, radius: 2, slots: [] }],
    };
    const scale = arContentScale(frame);

    expect(2 * (2 + 0.035) * scale).toBeCloseTo(0.27);
  });

  it("includes particle extent when there are no shell rings", () => {
    const frame: ScreenSceneFrame = {
      nucleusRadius: 0.5,
      spheres: [{
        id: "proton",
        color: 0,
        radius: 0.2,
        interactionTarget: null,
        positions: [{ x: 2, y: 0, z: 0 }],
      }],
      rings: [],
    };

    expect(arContentScale(frame)).toBeCloseTo(0.27 / 4.4);
  });
});