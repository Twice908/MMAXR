/** A point in CSS pixels relative to the renderer canvas. */
export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

/** One unoccupied visual slot on a projected drop-zone outline. */
export interface ProjectedDropSlot {
  readonly id: string;
  readonly point: ScreenPoint;
}

/** A projected outline and its currently unoccupied visual slots. */
export interface ProjectedDropZone {
  readonly target: string;
  readonly outline: readonly ScreenPoint[];
  readonly slots: readonly ProjectedDropSlot[];
  readonly priority?: number;
}

/** The selected target and its nearest free visual slot, if one is available. */
export interface ProjectedSnapSelection {
  readonly target: string;
  readonly slotId: string | null;
  readonly distancePx: number;
}

/**
 * Select the nearest outline within a CSS-pixel tolerance, then its nearest
 * free slot. Geometry may still select a full shell so chemistry can reject it.
 */
export function selectProjectedSnapTarget(
  pointer: ScreenPoint,
  zones: readonly ProjectedDropZone[],
  tolerancePx: number,
): ProjectedSnapSelection | null {
  if (!isPoint(pointer) || !Number.isFinite(tolerancePx) || tolerancePx < 0) {
    return null;
  }

  const candidates = zones.flatMap((zone) => {
    if (!zone.target || zone.outline.length === 0) {
      return [];
    }
    const distancePx = distanceToPolyline(pointer, zone.outline);
    return distancePx <= tolerancePx ? [{ zone, distancePx }] : [];
  });
  candidates.sort((left, right) =>
    left.distancePx - right.distancePx ||
    (right.zone.priority ?? 0) - (left.zone.priority ?? 0) ||
    left.zone.target.localeCompare(right.zone.target),
  );

  const nearest = candidates[0];
  if (!nearest) {
    return null;
  }
  const nearestSlot = nearest.zone.slots
    .filter((slot) => slot.id.length > 0 && isPoint(slot.point))
    .map((slot) => ({ slot, distancePx: distanceBetween(pointer, slot.point) }))
    .sort((left, right) =>
      left.distancePx - right.distancePx || left.slot.id.localeCompare(right.slot.id),
    )[0];

  return {
    target: nearest.zone.target,
    slotId: nearestSlot?.slot.id ?? null,
    distancePx: nearest.distancePx,
  };
}

/** Return a generous minimum target band, with additional room on phone screens. */
export function screenDropTolerancePx(
  pointerType: string,
  viewportWidth: number,
): number {
  const pointerMinimum = pointerType === "touch" ? 44 : pointerType === "pen" ? 32 : 24;
  const phoneMinimum = viewportWidth <= 620 ? 56 : 0;
  return Math.max(pointerMinimum, phoneMinimum);
}

/** Convert a CSS-pixel distance to world units at the current camera depth. */
export function screenPixelsToWorldUnits(
  pixels: number,
  cameraDistance: number,
  verticalFovDegrees: number,
  viewportHeight: number,
): number {
  if (
    !Number.isFinite(pixels) || pixels < 0 ||
    !Number.isFinite(cameraDistance) || cameraDistance <= 0 ||
    !Number.isFinite(verticalFovDegrees) || verticalFovDegrees <= 0 || verticalFovDegrees >= 180 ||
    !Number.isFinite(viewportHeight) || viewportHeight <= 0
  ) {
    return 0;
  }
  return 2 * cameraDistance * Math.tan((verticalFovDegrees * Math.PI) / 360) * pixels / viewportHeight;
}

function distanceToPolyline(point: ScreenPoint, line: readonly ScreenPoint[]): number {
  if (!line.every(isPoint)) {
    return Number.POSITIVE_INFINITY;
  }
  if (line.length === 1) {
    return distanceBetween(point, line[0]!);
  }

  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < line.length; index += 1) {
    const start = line[index]!;
    const end = line[(index + 1) % line.length]!;
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    const lengthSquared = deltaX * deltaX + deltaY * deltaY;
    const ratio = lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) / lengthSquared));
    nearest = Math.min(nearest, distanceBetween(point, {
      x: start.x + ratio * deltaX,
      y: start.y + ratio * deltaY,
    }));
  }
  return nearest;
}

function distanceBetween(left: ScreenPoint, right: ScreenPoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function isPoint(point: ScreenPoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}