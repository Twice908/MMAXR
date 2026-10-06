import { describe, expect, it, vi } from "vitest";
import { AngleArc, createPlaneMapper } from "@mma/engine-render";
import { computeImages, traceTwoMirrorPath } from "@mma/kit-physics-optics";
import type { LabelCanvas, LabelCanvasContext } from "@mma/engine-render";

describe("two-mirror angle labels", () => {
  it("labels the (0, 4) image path incidence angle from the kit hit as 35.5 degrees", () => {
    const setup = { theta: 90, d: 4 };
    const images = computeImages(setup);
    expect(images.status).toBe("ok");
    if (images.status !== "ok") {
      return;
    }
    const image = images.images.find(({ position }) => Math.abs(position.x) < 0.001 && Math.abs(position.y - 4) < 0.001);
    expect(image).toBeDefined();
    if (!image) {
      return;
    }
    const path = traceTwoMirrorPath(setup, image, { x: 6, y: 3 }, 10);
    expect(path.status).toBe("ok");
    if (path.status !== "ok") {
      return;
    }
    const hit = path.hits[0];
    expect(hit?.angleOfIncidence).toBeCloseTo(35.54, 1);
    if (!hit) {
      return;
    }

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
    const createCanvas = (width: number, height: number): LabelCanvas => ({
      width,
      height,
      getContext: () => context,
    });
    const incidence = new AngleArc({
      mapper: createPlaneMapper({ scale: 1, origin: [0, 0, 0] }),
      createCanvas,
    });
    const previous = path.realPoints[0];
    const next = path.realPoints[2];
    expect(previous).toBeDefined();
    expect(next).toBeDefined();
    if (!previous || !next) {
      return;
    }
    const incoming: readonly [number, number] = [
      previous.x - hit.point.x,
      previous.y - hit.point.y,
    ];
    const outgoing: readonly [number, number] = [
      next.x - hit.point.x,
      next.y - hit.point.y,
    ];
    const normal: readonly [number, number] = [1, -1];
    incidence.set([hit.point.x, hit.point.y], incoming, normal, hit.angleOfIncidence);
    expect(context.fillText).toHaveBeenLastCalledWith("35.5°", 256, 64);
    const reflection = new AngleArc({
      mapper: createPlaneMapper({ scale: 1, origin: [0, 0, 0] }),
      createCanvas,
    });
    reflection.set([hit.point.x, hit.point.y], normal, outgoing, hit.angleOfReflection);
    expect(context.fillText).toHaveBeenLastCalledWith("35.5°", 256, 64);
    incidence.dispose();
    reflection.dispose();
  });
});
