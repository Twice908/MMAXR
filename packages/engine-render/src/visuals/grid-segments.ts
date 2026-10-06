/** A line segment in the two-dimensional mapper plane. */
export interface GridSegment {
  readonly from: readonly [number, number];
  readonly to: readonly [number, number];
  readonly major: boolean;
}

/** Generate a centred square grid without depending on a rendering library. */
export function gridSegments(size: number, step: number, majorEvery: number): readonly GridSegment[] {
  if (!Number.isFinite(size) || size <= 0 || !Number.isFinite(step) || step <= 0
    || !Number.isInteger(majorEvery) || majorEvery <= 0) {
    throw new RangeError("Grid size and step must be positive, with a positive integer major interval.");
  }
  const halfCount = Math.floor(size / (2 * step));
  const segments: GridSegment[] = [];
  for (let index = -halfCount; index <= halfCount; index += 1) {
    const coordinate = index * step;
    const major = index % majorEvery === 0;
    segments.push({
      from: [coordinate, -size / 2],
      to: [coordinate, size / 2],
      major,
    });
  }
  for (let index = -halfCount; index <= halfCount; index += 1) {
    const coordinate = index * step;
    const major = index % majorEvery === 0;
    segments.push({
      from: [-size / 2, coordinate],
      to: [size / 2, coordinate],
      major,
    });
  }
  return segments;
}
