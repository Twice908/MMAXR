import type { Point2 } from "./arc.js";

/** Split a polyline into equally patterned dash paths. */
export function dashPolyline(
  points: readonly Point2[],
  dash: number,
  gap: number,
): readonly (readonly Point2[])[] {
  if (!Number.isFinite(dash) || dash <= 0 || !Number.isFinite(gap) || gap < 0) {
    throw new RangeError("Dash must be positive and gap must be non-negative.");
  }
  if (points.length < 2) {
    return [];
  }

  const segments: { start: Point2; end: Point2; startDistance: number; length: number }[] = [];
  let totalLength = 0;
  for (let index = 0; index + 1 < points.length; index += 1) {
    const start = points[index] as Point2;
    const end = points[index + 1] as Point2;
    const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
    if (length > 0) {
      segments.push({ start, end, startDistance: totalLength, length });
      totalLength += length;
    }
  }
  if (segments.length === 0) {
    return [];
  }

  const result: Point2[][] = [];
  const period = dash + gap;
  for (let dashStart = 0; dashStart < totalLength; dashStart += period) {
    const dashEnd = Math.min(dashStart + dash, totalLength);
    const dashPoints: Point2[] = [];
    for (const segment of segments) {
      const segmentStart = segment.startDistance;
      const segmentEnd = segmentStart + segment.length;
      const overlapStart = Math.max(dashStart, segmentStart);
      const overlapEnd = Math.min(dashEnd, segmentEnd);
      if (overlapEnd <= overlapStart) {
        continue;
      }
      const from = interpolate(
        segment.start,
        segment.end,
        (overlapStart - segmentStart) / segment.length,
      );
      const to = interpolate(
        segment.start,
        segment.end,
        (overlapEnd - segmentStart) / segment.length,
      );
      if (
        dashPoints.length === 0 ||
        !samePoint(dashPoints[dashPoints.length - 1] as Point2, from)
      ) {
        dashPoints.push(from);
      }
      if (!samePoint(dashPoints[dashPoints.length - 1] as Point2, to)) {
        dashPoints.push(to);
      }
    }
    if (dashPoints.length > 1) {
      result.push(dashPoints);
    }
  }
  return result;
}

function interpolate(start: Point2, end: Point2, amount: number): Point2 {
  return [start[0] + (end[0] - start[0]) * amount, start[1] + (end[1] - start[1]) * amount];
}

function samePoint(left: Point2, right: Point2): boolean {
  return Math.hypot(left[0] - right[0], left[1] - right[1]) <= 1e-12;
}
