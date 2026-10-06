import { describe, expect, it } from "vitest";
import {
  imageOfPoint,
  PlaneMirror,
  computeImages,
  parallelImages,
  reflect,
  reflectPoints,
  reflectRay,
  type Ray,
  type Vec2,
} from "../src/index.js";

const horizontalMirror = new PlaneMirror({ x: -10, y: 0 }, { x: 10, y: 0 });

describe("plane mirror reflection", () => {
  it.each([
    [0, { x: 0, y: 1 }],
    [30, { x: 0.5, y: Math.sqrt(3) / 2 }],
    [45, { x: Math.SQRT1_2, y: Math.SQRT1_2 }],
    [60, { x: Math.sqrt(3) / 2, y: 0.5 }],
  ])("reflects a ray at %i degrees to the other side of the normal", (degrees, expected) => {
    const angle = (degrees * Math.PI) / 180;
    const ray: Ray = {
      origin: { x: 0, y: 2 },
      direction: { x: Math.sin(angle), y: -Math.cos(angle) },
    };

    const result = reflectRay(ray, horizontalMirror);

    expect(result?.reflectedRay.direction.x).toBeCloseTo(expected.x);
    expect(result?.reflectedRay.direction.y).toBeCloseTo(expected.y);
    expect(result?.angleOfIncidence).toBeCloseTo(degrees);
    expect(result?.angleOfReflection).toBeCloseTo(degrees);
  });

  it("returns a head-on ray along its incoming path", () => {
    const result = reflectRay(
      { origin: { x: 0, y: 2 }, direction: { x: 0, y: -1 } },
      horizontalMirror,
    );

    expect(result?.reflectedRay.direction).toEqual({ x: 0, y: 1 });
    expect(result?.angleOfIncidence).toBe(0);
    expect(result?.angleOfReflection).toBe(0);
  });

  it("turns a horizontal ray by a right angle at a diagonal mirror", () => {
    const diagonalMirror = new PlaneMirror({ x: -10, y: -10 }, { x: 10, y: 10 });
    const reflected = reflect({ x: 1, y: 0 }, { x: -Math.SQRT1_2, y: Math.SQRT1_2 });

    expect(reflected.x).toBeCloseTo(0);
    expect(reflected.y).toBeCloseTo(1);
    expect(
      reflectRay({ origin: { x: -1, y: 0 }, direction: { x: 1, y: 0 } }, diagonalMirror)
        ?.reflectedRay.direction.y,
    ).toBeCloseTo(1);
  });

  it("returns null for a miss, parallel travel, or travel from behind", () => {
    expect(
      reflectRay({ origin: { x: 20, y: 2 }, direction: { x: 0, y: -1 } }, horizontalMirror),
    ).toBeNull();
    expect(
      reflectRay({ origin: { x: 0, y: 2 }, direction: { x: 1, y: 0 } }, horizontalMirror),
    ).toBeNull();
    expect(
      reflectRay({ origin: { x: 0, y: -2 }, direction: { x: 0, y: -1 } }, horizontalMirror),
    ).toBeNull();
  });
});

describe("plane mirror images", () => {
  it("places the image at equal distance on the opposite side", () => {
    const image = imageOfPoint({ x: 0, y: 3 }, horizontalMirror);

    expect(image.point).toEqual({ x: 0, y: -3 });
    expect(image.objectDistance).toBe(3);
    expect(image.imageDistance).toBe(3);
    expect(image.imageSide).toBe("right");
  });

  it("leaves a point on the mirror unchanged", () => {
    const image = imageOfPoint({ x: 4, y: 0 }, horizontalMirror);

    expect(image.point).toEqual({ x: 4, y: 0 });
    expect(image.objectDistance).toBe(0);
    expect(image.imageDistance).toBe(0);
    expect(image.imageSide).toBe("on");
  });

  it("reverses lateral positions of point sets", () => {
    const verticalMirror = new PlaneMirror({ x: 0, y: -10 }, { x: 0, y: 10 });
    const points: readonly Vec2[] = [
      { x: -2, y: 1 },
      { x: 0, y: 1 },
      { x: 2, y: 1 },
    ];

    expect(reflectPoints(points, verticalMirror)).toEqual([
      { x: 2, y: 1 },
      { x: 0, y: 1 },
      { x: -2, y: 1 },
    ]);
  });
});

describe("hinged mirror images", () => {
  it.each([
    [90, [90, 180, 270], 1],
    [60, [60, 120, 180, 240, 300], 1],
    [45, [45, 90, 135, 180, 225, 270, 315], 1],
    [30, [30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330], 1],
    [120, [120, 240], 0],
    [72, [72, 144, 216, 288], 0],
    [180, [180], 1],
  ])("finds the expected images for a %i degree opening", (theta, expectedAngles, sharedCount) => {
    const result = computeImages({ theta, d: 4 });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }
    expect(result.images.map((image) => image.polarAngle)).toHaveLength(expectedAngles.length);
    result.images.forEach((image, index) => {
      expect(image.polarAngle).toBeCloseTo(expectedAngles[index] as number);
    });
    expect(result.count).toBe(expectedAngles.length);
    expect(result.images.filter((image) => image.shared)).toHaveLength(sharedCount);
    for (const image of result.images) {
      expect(Math.hypot(image.position.x, image.position.y)).toBeCloseTo(4);
      expect(image.reflectionCount).toBe(image.mirrorSequence.length);
    }
  });

  it("changes image radii with object distance without changing the image count", () => {
    const near = computeImages({ theta: 60, d: 2 });
    const far = computeImages({ theta: 60, d: 9 });

    expect(near.status).toBe("ok");
    expect(far.status).toBe("ok");
    if (near.status !== "ok" || far.status !== "ok") {
      return;
    }
    expect(near.count).toBe(far.count);
    for (const image of near.images) {
      expect(Math.hypot(image.position.x, image.position.y)).toBeCloseTo(2);
    }
    for (const image of far.images) {
      expect(Math.hypot(image.position.x, image.position.y)).toBeCloseTo(9);
    }
  });

  it("reports an unsupported opening when the turns do not close", () => {
    expect(computeImages({ theta: 100, d: 3 })).toEqual({ status: "unsupported_angle" });
  });
});

describe("parallel mirror images", () => {
  it("returns images in reflection layers up to the requested cap", () => {
    expect(parallelImages(10, 3, 4)).toEqual([
      { position: -3, reflectionCount: 1 },
      { position: 17, reflectionCount: 1 },
      { position: -17, reflectionCount: 2 },
      { position: 23, reflectionCount: 2 },
      { position: -23, reflectionCount: 3 },
      { position: 37, reflectionCount: 3 },
      { position: -37, reflectionCount: 4 },
      { position: 43, reflectionCount: 4 },
    ]);
  });
});
