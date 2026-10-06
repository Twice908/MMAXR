import type { Point2 } from "./arc.js";

/** Flat vertex coordinates and triangle indices for independent line segments. */
export interface RibbonGeometry {
  readonly positions: readonly number[];
  readonly indices: readonly number[];
}

/** Build a centered two-triangle ribbon for each non-zero path segment. */
export function ribbonVertices(points: readonly Point2[], width: number): RibbonGeometry {
  if (!Number.isFinite(width) || width < 0) {
    throw new RangeError("Ribbon width must be finite and non-negative.");
  }
  const positions: number[] = [];
  const indices: number[] = [];
  for (let index = 0; index + 1 < points.length; index += 1) {
    const [x1, y1] = points[index] as Point2;
    const [x2, y2] = points[index + 1] as Point2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy);
    if (length === 0) {
      continue;
    }
    const offsetX = (-dy / length) * (width / 2);
    const offsetY = (dx / length) * (width / 2);
    const vertex = positions.length / 2;
    positions.push(
      x1 + offsetX, y1 + offsetY,
      x1 - offsetX, y1 - offsetY,
      x2 + offsetX, y2 + offsetY,
      x2 - offsetX, y2 - offsetY,
    );
    indices.push(vertex, vertex + 1, vertex + 2, vertex + 2, vertex + 1, vertex + 3);
  }
  return { positions, indices };
}
