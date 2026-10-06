/** Three-dimensional scene origin and scale for flat two-dimensional coordinates. */
export interface PlaneMapperOptions {
  readonly scale: number;
  readonly origin: readonly [number, number, number];
}

/** Convert between a two-dimensional plane and XZ coordinates in a scene. */
export interface PlaneMapper {
  toScene(x: number, y: number): readonly [number, number, number];
  fromScene(sx: number, sy: number, sz: number): readonly [number, number];
}

/** Create an exact coordinate mapping with the plane's vertical axis inverted into Z. */
export function createPlaneMapper({ scale, origin }: PlaneMapperOptions): PlaneMapper {
  if (!Number.isFinite(scale) || scale === 0 || !origin.every(Number.isFinite)) {
    throw new RangeError("Plane mapping requires a finite non-zero scale and finite origin.");
  }
  const [ox, oy, oz] = origin;
  return {
    toScene: (x, y) => [ox + scale * x, oy, oz - scale * y],
    fromScene: (sx, _sy, sz) => [(sx - ox) / scale, (oz - sz) / scale],
  };
}
