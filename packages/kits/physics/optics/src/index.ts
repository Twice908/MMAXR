/** Shared tolerance for geometric comparisons. */
export const EPSILON = 1e-10;

/** A point or direction in a two-dimensional plane. */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/** A ray whose direction has unit length. */
export interface Ray {
  readonly origin: Vec2;
  readonly direction: Vec2;
}

/** The nearest intersection along a ray, with a unit normal facing its source. */
export interface Hit {
  readonly point: Vec2;
  readonly distance: number;
  readonly normal: Vec2;
}

/** A surface that can be intersected by a ray. */
export interface Surface {
  intersect(ray: Ray): Hit | null;
}

/** A finite reflective segment with an oriented start-to-end direction. */
export class PlaneMirror implements Surface {
  readonly start: Vec2;
  readonly end: Vec2;

  constructor(start: Vec2, end: Vec2) {
    if (![start.x, start.y, end.x, end.y].every(Number.isFinite)) {
      throw new RangeError("Mirror endpoints must be finite.");
    }
    if (Math.hypot(end.x - start.x, end.y - start.y) <= EPSILON) {
      throw new RangeError("Mirror endpoints must be distinct.");
    }

    this.start = { x: start.x, y: start.y };
    this.end = { x: end.x, y: end.y };
  }

  intersect(ray: Ray): Hit | null {
    const direction = normalize(ray.direction);
    const segment = subtract(this.end, this.start);
    const offset = subtract(this.start, ray.origin);
    const denominator = cross(direction, segment);
    if (Math.abs(denominator) <= EPSILON) {
      return null;
    }

    const distance = cross(offset, segment) / denominator;
    const segmentPosition = cross(offset, direction) / denominator;
    if (
      distance < -EPSILON ||
      segmentPosition < -EPSILON ||
      segmentPosition > 1 + EPSILON
    ) {
      return null;
    }

    const travelDistance = Math.max(0, distance);
    const point = add(ray.origin, scale(direction, travelDistance));
    const tangent = normalize(segment);
    let normal = { x: -tangent.y, y: tangent.x };
    if (dot(direction, normal) > 0) {
      normal = scale(normal, -1);
    }

    return { point, distance: travelDistance, normal };
  }
}

/** Return the mirror-reflected direction for a unit direction and normal. */
export function reflect(direction: Vec2, normal: Vec2): Vec2 {
  const unitDirection = normalize(direction);
  const unitNormal = normalize(normal);
  return normalize(subtract(unitDirection, scale(unitNormal, 2 * dot(unitDirection, unitNormal))));
}

/** Trace a ray against a surface and return its reflection, or null on a miss. */
export function reflectRay(ray: Ray, surface: Surface): Reflection | null {
  const incidentRay = { origin: ray.origin, direction: normalize(ray.direction) };
  const hit = surface.intersect(incidentRay);
  if (hit === null) {
    return null;
  }

  const normal = normalize(hit.normal);
  const direction = reflect(incidentRay.direction, normal);
  return {
    hit,
    reflectedRay: { origin: hit.point, direction },
    angleOfIncidence: angleFromNormal(-dot(incidentRay.direction, normal)),
    angleOfReflection: angleFromNormal(dot(direction, normal)),
  };
}

/** The details produced by reflecting one ray from a surface. */
export interface Reflection {
  readonly hit: Hit;
  readonly reflectedRay: Ray;
  readonly angleOfIncidence: number;
  readonly angleOfReflection: number;
}

/** A point's mirror image and distances, with side measured along the mirror line. */
export interface PointImage {
  readonly point: Vec2;
  readonly objectDistance: number;
  readonly imageDistance: number;
  readonly imageSide: "left" | "right" | "on";
}

/** The two mirror labels used by a hinged setup. */
export type MirrorName = "A" | "B";

/** A symmetric pair of mirrors with an object on their bisector. */
export interface TwoMirrorSetup {
  /** Angle between the mirrors, in degrees. */
  readonly theta: number;
  /** Distance from the hinge to the object on the positive x-axis. */
  readonly d: number;
}

/** One virtual image formed by a hinged mirror pair. */
export interface TwoMirrorImage {
  readonly position: Vec2;
  readonly polarAngle: number;
  readonly reflectionCount: number;
  readonly mirrorSequence: readonly MirrorName[];
  readonly shared: boolean;
}

/** Result of finding virtual images for a hinged mirror pair. */
export type TwoMirrorResult =
  | { readonly status: "ok"; readonly images: readonly TwoMirrorImage[]; readonly count: number }
  | { readonly status: "unsupported_angle" };

/**
 * Find images by repeated geometric reflection, stopping at each mirror's
 * extension when a sequence leaves the region facing that mirror.
 */
export function computeImages(setup: TwoMirrorSetup): TwoMirrorResult {
  const { theta, d } = setup;
  if (!Number.isFinite(theta) || theta <= 0 || theta > 180) {
    return { status: "unsupported_angle" };
  }
  if (!Number.isFinite(d) || d <= 0) {
    throw new RangeError("Object distance must be finite and positive.");
  }

  const turnsAround = 360 / theta;
  if (Math.abs(turnsAround - Math.round(turnsAround)) > EPSILON) {
    return { status: "unsupported_angle" };
  }

  const halfAngle = (theta * Math.PI) / 360;
  const mirrorA = new PlaneMirror(
    { x: 0, y: 0 },
    { x: Math.cos(halfAngle), y: Math.sin(halfAngle) },
  );
  const mirrorB = new PlaneMirror(
    { x: 0, y: 0 },
    { x: Math.cos(halfAngle), y: -Math.sin(halfAngle) },
  );
  const mirrorLines = { A: mirrorA, B: mirrorB };
  const object = { x: d, y: 0 };
  const images: TwoMirrorImage[] = [];

  for (const firstMirror of ["A", "B"] as const) {
    let position = object;
    let lastMirror = firstMirror;
    const sequence: MirrorName[] = [];

    while (true) {
      const mirror = mirrorLines[lastMirror];
      const objectSide = sideOfLine(object, mirror);
      const currentSide = sideOfLine(position, mirror);
      if (Math.abs(currentSide) <= EPSILON || objectSide * currentSide <= 0) {
        break;
      }

      position = imageOfPoint(position, mirror).point;
      sequence.push(lastMirror);
      const angle = polarAngle(position);
      const existing = images.find(
        (image) => Math.hypot(image.position.x - position.x, image.position.y - position.y) <= EPSILON,
      );
      if (existing === undefined) {
        images.push({
          position,
          polarAngle: angle,
          reflectionCount: sequence.length,
          mirrorSequence: [...sequence],
          shared: false,
        });
      } else if (!existing.shared) {
        const index = images.indexOf(existing);
        images[index] = { ...existing, shared: true };
      }
      lastMirror = lastMirror === "A" ? "B" : "A";
    }
  }

  images.sort((left, right) => left.polarAngle - right.polarAngle);
  return { status: "ok", images, count: images.length };
}

/** One virtual image in the parallel-mirror sequence. */
export interface ParallelImage {
  readonly position: number;
  readonly reflectionCount: number;
}

/**
 * Return the first requested number of reflections between parallel mirrors.
 * The real image sequence is unbounded; views are capped by maxReflections.
 */
export function parallelImages(
  mirrorGap: number,
  objectX: number,
  maxReflections: number,
): readonly ParallelImage[] {
  if (
    !Number.isFinite(mirrorGap) ||
    mirrorGap <= 0 ||
    !Number.isFinite(objectX) ||
    objectX <= 0 ||
    objectX >= mirrorGap
  ) {
    throw new RangeError("The object must lie between mirrors separated by a positive gap.");
  }
  if (!Number.isInteger(maxReflections) || maxReflections < 0) {
    throw new RangeError("Maximum reflections must be a non-negative integer.");
  }
  if (maxReflections === 0) {
    return [];
  }

  let current = [
    { position: -objectX, lastMirror: "left" as const },
    { position: 2 * mirrorGap - objectX, lastMirror: "right" as const },
  ];
  const images: ParallelImage[] = current
    .map(({ position }) => ({ position, reflectionCount: 1 }))
    .sort((left, right) => left.position - right.position);

  for (let reflectionCount = 2; reflectionCount <= maxReflections; reflectionCount += 1) {
    current = current.map(({ position, lastMirror }) => {
      const mirror = lastMirror === "right" ? 0 : mirrorGap;
      return {
        position: 2 * mirror - position,
        lastMirror: mirror === 0 ? "left" as const : "right" as const,
      };
    });
    images.push(
      ...current
        .map(({ position }) => ({ position, reflectionCount }))
        .sort((left, right) => left.position - right.position),
    );
  }

  return images;
}

/** A dotted continuation from a reflection point toward a virtual image. */
export interface VirtualSegment {
  readonly from: Vec2;
  readonly to: Vec2;
}

/** Incidence and reflection angles at one reflection point. */
export interface PathHit {
  readonly point: Vec2;
  readonly angleOfIncidence: number;
  readonly angleOfReflection: number;
}

/** A visible ray path with its virtual continuations. */
export interface VisiblePath {
  readonly status: "ok";
  readonly realPoints: readonly Vec2[];
  readonly virtualSegments: readonly VirtualSegment[];
  readonly hits: readonly PathHit[];
}

/** A ray path that cannot be seen in the selected arrangement. */
export interface InvisiblePath {
  readonly status: "not_visible";
  readonly reason: "eye_behind_mirror" | "outside_mirror" | "degenerate" | "eye_behind_hinge";
}

/** Find the visible ray path for one finite plane mirror using its virtual image. */
export function tracePlanePath(
  object: Vec2,
  mirror: PlaneMirror,
  eye: Vec2,
): VisiblePath | InvisiblePath {
  const objectSide = sideOfLine(object, mirror);
  const eyeSide = sideOfLine(eye, mirror);
  if (Math.abs(objectSide) <= EPSILON || Math.abs(eyeSide) <= EPSILON) {
    return { status: "not_visible", reason: "degenerate" };
  }
  if (objectSide * eyeSide < 0) {
    return { status: "not_visible", reason: "eye_behind_mirror" };
  }

  const image = imageOfPoint(object, mirror).point;
  const intersection = intersectSegments(eye, image, mirror.start, mirror.end);
  if (intersection === "degenerate") {
    return { status: "not_visible", reason: "degenerate" };
  }
  if (intersection === null) {
    return { status: "not_visible", reason: "outside_mirror" };
  }

  const point = intersection.point;
  const normal = mirrorNormal(mirror);
  const angle = incidenceAngle(subtract(point, object), normal);
  return {
    status: "ok",
    realPoints: [object, point, eye],
    virtualSegments: [{ from: point, to: image }],
    hits: [{ point, angleOfIncidence: angle, angleOfReflection: angle }],
  };
}

/** A visible multi-mirror path and the physical mirror order used. */
export interface TwoMirrorPath extends VisiblePath {
  readonly sequence: readonly MirrorName[];
}

/** Trace an image from a hinged mirror pair back through its producing mirrors. */
export function traceTwoMirrorPath(
  setup: TwoMirrorSetup,
  image: TwoMirrorImage,
  eye: Vec2,
  mirrorLength: number,
): TwoMirrorPath | InvisiblePath {
  if (
    !Number.isFinite(mirrorLength) ||
    mirrorLength <= EPSILON ||
    !Number.isFinite(setup.theta) ||
    setup.theta <= 0 ||
    setup.theta > 180
  ) {
    return { status: "not_visible", reason: "outside_mirror" };
  }

  const halfAngle = (setup.theta * Math.PI) / 360;
  const mirrors: Record<MirrorName, PlaneMirror> = {
    A: new PlaneMirror(
      { x: 0, y: 0 },
      { x: mirrorLength * Math.cos(halfAngle), y: mirrorLength * Math.sin(halfAngle) },
    ),
    B: new PlaneMirror(
      { x: 0, y: 0 },
      { x: mirrorLength * Math.cos(halfAngle), y: -mirrorLength * Math.sin(halfAngle) },
    ),
  };
  const eyeAngle = Math.atan2(eye.y, eye.x);
  if (Math.hypot(eye.x, eye.y) <= EPSILON || Math.abs(eyeAngle) > halfAngle + EPSILON) {
    return { status: "not_visible", reason: "eye_behind_hinge" };
  }

  const primarySequence = [...image.mirrorSequence].reverse();
  const sequences =
    image.shared && primarySequence.length > 1
      ? [primarySequence, [...primarySequence].reverse()]
      : [primarySequence];
  let failedReason: InvisiblePath["reason"] = "outside_mirror";

  for (const sequence of sequences) {
    let from = eye;
    let stageImage = image.position;
    const reverseHits: Vec2[] = [];
    const reverseVirtualSegments: VirtualSegment[] = [];
    let failed = false;

    for (const mirrorName of sequence.slice().reverse()) {
      const mirror = mirrors[mirrorName];
      const intersection = intersectSegments(from, stageImage, mirror.start, mirror.end);
      if (intersection === "degenerate") {
        failedReason = "outside_mirror";
        failed = true;
        break;
      }
      if (intersection === null) {
        failedReason = "outside_mirror";
        failed = true;
        break;
      }
      reverseHits.push(intersection.point);
      reverseVirtualSegments.push({ from: intersection.point, to: stageImage });
      stageImage = imageOfPoint(stageImage, mirror).point;
      from = intersection.point;
    }
    if (failed) {
      continue;
    }

    const hitsInPathOrder = [...reverseHits].reverse();
    const realPoints = [stageImage, ...hitsInPathOrder, eye];
    const pathHits = hitsInPathOrder.map((point, index) => {
      const mirror = mirrors[sequence[index] as MirrorName];
      const normal = mirrorNormal(mirror);
      const angle = incidenceAngle(subtract(point, realPoints[index] as Vec2), normal);
      return { point, angleOfIncidence: angle, angleOfReflection: angle };
    });

    return {
      status: "ok",
      realPoints,
      virtualSegments: reverseVirtualSegments.reverse(),
      hits: pathHits,
      sequence,
    };
  }

  return { status: "not_visible", reason: failedReason };
}

/** Reflect a point across the infinite line containing a finite mirror. */
export function imageOfPoint(point: Vec2, mirror: PlaneMirror): PointImage {
  const tangent = normalize(subtract(mirror.end, mirror.start));
  const displacement = subtract(point, mirror.start);
  const signedDistance = cross(tangent, displacement);
  const normal = { x: -tangent.y, y: tangent.x };
  const imagePoint = subtract(point, scale(normal, 2 * signedDistance));

  return {
    point: imagePoint,
    objectDistance: Math.abs(signedDistance),
    imageDistance: Math.abs(signedDistance),
    imageSide:
      Math.abs(signedDistance) <= EPSILON
        ? "on"
        : signedDistance > 0
          ? "right"
          : "left",
  };
}

/** Reflect each point across the infinite line containing a finite mirror. */
export function reflectPoints(points: readonly Vec2[], mirror: PlaneMirror): readonly Vec2[] {
  return points.map((point) => imageOfPoint(point, mirror).point);
}

function angleFromNormal(cosine: number): number {
  const boundedCosine = Math.max(-1, Math.min(1, cosine));
  return (Math.acos(boundedCosine) * 180) / Math.PI;
}

function normalize(vector: Vec2): Vec2 {
  const length = Math.hypot(vector.x, vector.y);
  if (!Number.isFinite(length) || length <= EPSILON) {
    throw new RangeError("A direction must have finite, non-zero length.");
  }
  return { x: vector.x / length, y: vector.y / length };
}

function add(left: Vec2, right: Vec2): Vec2 {
  return { x: left.x + right.x, y: left.y + right.y };
}

function subtract(left: Vec2, right: Vec2): Vec2 {
  return { x: left.x - right.x, y: left.y - right.y };
}

function scale(vector: Vec2, amount: number): Vec2 {
  return { x: vector.x * amount, y: vector.y * amount };
}

function dot(left: Vec2, right: Vec2): number {
  return left.x * right.x + left.y * right.y;
}

function cross(left: Vec2, right: Vec2): number {
  return left.x * right.y - left.y * right.x;
}

function sideOfLine(point: Vec2, mirror: PlaneMirror): number {
  return cross(normalize(subtract(mirror.end, mirror.start)), subtract(point, mirror.start));
}

function polarAngle(point: Vec2): number {
  const angle = (Math.atan2(point.y, point.x) * 180) / Math.PI;
  return angle < 0 ? angle + 360 : angle;
}

function intersectSegments(
  from: Vec2,
  to: Vec2,
  segmentStart: Vec2,
  segmentEnd: Vec2,
): { readonly point: Vec2 } | "degenerate" | null {
  const direction = subtract(to, from);
  const segment = subtract(segmentEnd, segmentStart);
  const denominator = cross(direction, segment);
  if (Math.abs(denominator) <= EPSILON) {
    return "degenerate";
  }

  const offset = subtract(segmentStart, from);
  const pathPosition = cross(offset, segment) / denominator;
  const segmentPosition = cross(offset, direction) / denominator;
  if (
    pathPosition < -EPSILON ||
    pathPosition > 1 + EPSILON ||
    segmentPosition < -EPSILON ||
    segmentPosition > 1 + EPSILON
  ) {
    return null;
  }

  return {
    point: add(from, scale(direction, Math.max(0, Math.min(1, pathPosition)))),
  };
}

function mirrorNormal(mirror: PlaneMirror): Vec2 {
  const tangent = normalize(subtract(mirror.end, mirror.start));
  return { x: -tangent.y, y: tangent.x };
}

function incidenceAngle(direction: Vec2, normal: Vec2): number {
  const unitDirection = normalize(direction);
  const cosine = Math.max(0, Math.min(1, Math.abs(dot(unitDirection, normal))));
  return (Math.acos(cosine) * 180) / Math.PI;
}
