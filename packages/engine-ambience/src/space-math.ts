/** A box on the screen in CSS pixels, as `getBoundingClientRect` reports it. */
export interface ScreenRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Screen size in CSS pixels. */
export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

/** A disc in world units on the z = 0 plane, where celestial bodies live. */
export interface WorldDisc {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

/** Height of the visible z = 0 plane for a camera `distance` away with vertical field of view `fovDeg`. */
export function visibleHeightAt(fovDeg: number, distance: number): number {
  return 2 * Math.tan((fovDeg * Math.PI) / 360) * distance;
}

/** World units per CSS pixel on the z = 0 plane. */
export function unitsPerPixel(viewport: ViewportSize, fovDeg: number, distance: number): number {
  return viewport.height > 0 ? visibleHeightAt(fovDeg, distance) / viewport.height : 0;
}

/**
 * Place a body so it sits exactly behind a DOM element: the element's circle becomes the body's
 * silhouette. This lets CSS lay out the scene responsively while WebGL draws it.
 *
 * The match is made in viewing angles, not flat screen distance: the sphere is sized and placed so
 * its near and far edges (measured from the screen centre) line up with the element's. That keeps
 * a giant planet half off-screen, or a small one in a corner, exactly where CSS put it, and a
 * sphere can never grow around the camera.
 */
export function rectToWorld(rect: ScreenRect, viewport: ViewportSize, fovDeg: number, distance: number): WorldDisc {
  const scale = unitsPerPixel(viewport, fovDeg, distance);
  // Element centre and radius in "tangent space": world units on z = 0 divided by camera distance.
  const cx = ((rect.left + rect.width / 2 - viewport.width / 2) * scale) / distance;
  const cy = (-(rect.top + rect.height / 2 - viewport.height / 2) * scale) / distance;
  const k = ((rect.width / 2) * scale) / distance;
  const offset = Math.hypot(cx, cy);
  const near = Math.atan(offset - k);
  const far = Math.atan(offset + k);
  const centreAngle = (near + far) / 2;
  const angularRadius = (far - near) / 2;
  const reach = distance * Math.tan(centreAngle);
  const ux = offset > 1e-9 ? cx / offset : 0;
  const uy = offset > 1e-9 ? cy / offset : 0;
  return {
    x: ux * reach,
    y: uy * reach,
    radius: (distance / Math.cos(centreAngle)) * Math.sin(angularRadius),
  };
}

/** Where a point on the z = 0 plane appears, as 0..1 texture coordinates (origin bottom-left). */
export function worldToUv(x: number, y: number, viewport: ViewportSize, fovDeg: number, distance: number): {
  readonly u: number;
  readonly v: number;
} {
  const height = visibleHeightAt(fovDeg, distance);
  const width = viewport.height > 0 ? (height * viewport.width) / viewport.height : height;
  return { u: x / width + 0.5, v: y / height + 0.5 };
}

/**
 * The radius a sphere centred on the z = 0 plane needs so it fills the whole screen, including
 * the corners, with a small `margin` to spare.
 */
export function coverRadius(viewport: ViewportSize, fovDeg: number, distance: number, margin = 1.15): number {
  const aspect = viewport.height > 0 ? viewport.width / viewport.height : 1;
  const halfTan = Math.tan((fovDeg * Math.PI) / 360);
  const cornerAngle = Math.atan(halfTan * Math.sqrt(1 + aspect * aspect));
  return Math.min(distance * 0.92, distance * Math.sin(cornerAngle) * margin);
}

/** Half-axes of an ellipse. */
export interface Ellipse {
  readonly a: number;
  readonly b: number;
}

/**
 * A gently tilted orbit, centred on a star, that passes through a planet offset by (`dx`, `dy`).
 * The horizontal half-axis is `widen` times the distance, so orbits look like rings seen at an angle.
 */
export function orbitThrough(dx: number, dy: number, widen = 1.2): Ellipse {
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return { a: 0, b: 0 };
  const flattest = 0.22;
  const a = Math.max(distance * widen, Math.abs(dx) * 1.0001);
  const ratio = dx / a;
  const b = Math.abs(dy) / Math.sqrt(Math.max(1e-6, 1 - ratio * ratio));
  if (b >= a * flattest) return { a, b };
  // Planet almost level with the star: keep a minimum tilt and widen until the orbit reaches it.
  const wide = Math.hypot(dx, dy / flattest);
  return { a: wide, b: wide * flattest };
}
