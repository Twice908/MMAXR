import { describe, expect, it } from "vitest";
import {
  computeImages,
  PlaneMirror,
  tracePlanePath,
  traceTwoMirrorPath,
  type TwoMirrorImage,
  type Vec2,
} from "../src/index.js";

function expectPoints(actual: readonly Vec2[], expected: readonly Vec2[]): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((point, index) => {
    expect(point.x).toBeCloseTo(expected[index]?.x as number, 6);
    expect(point.y).toBeCloseTo(expected[index]?.y as number, 6);
  });
}

function getImage(position: Vec2): TwoMirrorImage {
  const result = computeImages({ theta: 90, d: 4 });
  if (result.status !== "ok") {
    throw new Error("The 90 degree hinged setup must produce images.");
  }
  const image = result.images.find(
    (candidate) =>
      Math.abs(candidate.position.x - position.x) < 1e-6 &&
      Math.abs(candidate.position.y - position.y) < 1e-6,
  );
  if (image === undefined) {
    throw new Error("The requested image must exist.");
  }
  return image;
}

describe("single-mirror ray paths", () => {
  const object = { x: 0, y: 3 };
  const wideMirror = new PlaneMirror({ x: -5, y: 0 }, { x: 5, y: 0 });

  it("finds the reflected path and dotted virtual continuation", () => {
    const path = tracePlanePath(object, wideMirror, { x: 4, y: 3 });

    expect(path.status).toBe("ok");
    if (path.status !== "ok") {
      return;
    }
    expectPoints(path.realPoints, [object, { x: 2, y: 0 }, { x: 4, y: 3 }]);
    expectPoints([path.virtualSegments[0]?.to as Vec2], [{ x: 0, y: -3 }]);
    expect(path.hits[0]?.angleOfIncidence).toBeCloseTo(33.690, 3);
    expect(path.hits[0]?.angleOfReflection).toBeCloseTo(33.690, 3);
  });

  it("handles a head-on view", () => {
    const path = tracePlanePath(object, wideMirror, { x: 0, y: 3 });

    expect(path.status).toBe("ok");
    if (path.status === "ok") {
      expectPoints(path.realPoints, [object, { x: 0, y: 0 }, { x: 0, y: 3 }]);
      expect(path.hits[0]?.angleOfIncidence).toBeCloseTo(0, 3);
      expect(path.hits[0]?.angleOfReflection).toBeCloseTo(0, 3);
    }
  });

  it("rejects a reflection outside the segment and an eye behind the mirror", () => {
    const shortMirror = new PlaneMirror({ x: -1, y: 0 }, { x: 1, y: 0 });
    expect(tracePlanePath(object, shortMirror, { x: 4, y: 3 })).toEqual({
      status: "not_visible",
      reason: "outside_mirror",
    });
    expect(tracePlanePath(object, wideMirror, { x: 4, y: -3 })).toEqual({
      status: "not_visible",
      reason: "eye_behind_mirror",
    });
  });
});

describe("hinged-mirror ray paths", () => {
  const setup = { theta: 90, d: 4 };
  const eye = { x: 6, y: 3 };

  it("traces images formed by each mirror", () => {
    const above = traceTwoMirrorPath(setup, getImage({ x: 0, y: 4 }), eye, 10);
    const below = traceTwoMirrorPath(setup, getImage({ x: 0, y: -4 }), eye, 10);

    expect(above.status).toBe("ok");
    if (above.status === "ok") {
      expectPoints(above.realPoints, [
        { x: 4, y: 0 },
        { x: 24 / 7, y: 24 / 7 },
        eye,
      ]);
      expect(above.hits[0]?.angleOfIncidence).toBeCloseTo(35.538, 3);
      expect(above.hits[0]?.angleOfReflection).toBeCloseTo(35.538, 3);
    }
    expect(below.status).toBe("ok");
    if (below.status === "ok") {
      expectPoints(below.realPoints, [
        { x: 4, y: 0 },
        { x: 24 / 13, y: -24 / 13 },
        eye,
      ]);
    }
  });

  it("uses the valid shared-image sequence", () => {
    const path = traceTwoMirrorPath(setup, getImage({ x: -4, y: 0 }), eye, 10);

    expect(path.status).toBe("ok");
    if (path.status === "ok") {
      expect(path.sequence).toEqual(["B", "A"]);
      expectPoints(path.realPoints, [
        { x: 4, y: 0 },
        { x: 12 / 13, y: -12 / 13 },
        { x: 12 / 7, y: 12 / 7 },
        eye,
      ]);
    }
  });

  it("rejects images when the eye is behind the hinge", () => {
    const images = computeImages(setup);
    expect(images.status).toBe("ok");
    if (images.status === "ok") {
      for (const image of images.images) {
        expect(traceTwoMirrorPath(setup, image, { x: -6, y: 3 }, 10)).toEqual({
          status: "not_visible",
          reason: "eye_behind_hinge",
        });
      }
    }
  });
});
