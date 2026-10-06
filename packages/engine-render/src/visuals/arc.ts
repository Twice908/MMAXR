/** A point in the flat plane used for visual geometry. */
export type Point2 = readonly [number, number];

/** Points and orientation data for a circular arc. */
export interface ArcGeometry {
  readonly points: readonly Point2[];
  readonly angleDeg: number;
  readonly midDirection: Point2;
}

/**
 * Generate points over the smaller sweep between two directions.
 * Opposite directions sweep counter-clockwise from dirA.
 */
export function arcPoints(
  vertex: Point2,
  dirA: Point2,
  dirB: Point2,
  radius: number,
  segments: number,
): ArcGeometry {
  if (!Number.isFinite(radius) || radius < 0 || !Number.isInteger(segments) || segments < 1) {
    throw new RangeError("Arc radius must be non-negative and segments must be a positive integer.");
  }
  const startAngle = Math.atan2(dirA[1], dirA[0]);
  const rawSweep = Math.atan2(
    dirA[0] * dirB[1] - dirA[1] * dirB[0],
    dirA[0] * dirB[0] + dirA[1] * dirB[1],
  );
  const sweep =
    Math.abs(Math.abs(rawSweep) - Math.PI) <= 1e-12
      ? Math.PI
      : Math.abs(rawSweep) > Math.PI
        ? rawSweep - Math.sign(rawSweep) * 2 * Math.PI
        : rawSweep;
  const points = Array.from({ length: segments + 1 }, (_, index) => {
    const angle = startAngle + (sweep * index) / segments;
    return [vertex[0] + radius * Math.cos(angle), vertex[1] + radius * Math.sin(angle)] as const;
  });
  const midAngle = startAngle + sweep / 2;
  return {
    points,
    angleDeg: (Math.abs(sweep) * 180) / Math.PI,
    midDirection: [Math.cos(midAngle), Math.sin(midAngle)],
  };
}
