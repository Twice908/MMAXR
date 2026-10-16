import * as THREE from "three";
import { spatialSurfaceGeometry, type NormalizedSpatialSurfaceRect } from "../spatial-layout.js";
import { MODEL_LIMITS, MODEL_STAGE } from "../xr-tokens.js";

export interface ModelStagePose {
  readonly position: Readonly<{ x: number; y: number; z: number }>;
  readonly rotation: Readonly<{ x: number; y: number; z: number; w: number }>;
  readonly zoom: number;
}

export interface ModelStageLayout {
  readonly safeRect: NormalizedSpatialSurfaceRect;
  readonly shellWidthMeters: number;
  readonly home: Readonly<{ x: number; y: number; z: number }>;
  readonly fitScale: number;
  readonly fitRadius: number;
}

export type ModelStageBindingLimit =
  | "pan-x"
  | "pan-y"
  | "zoom-min"
  | "zoom-max"
  | "nearest-surface-min"
  | "nearest-surface-max"
  | null;

function subtractRect(
  source: NormalizedSpatialSurfaceRect,
  exclusion: NormalizedSpatialSurfaceRect,
): NormalizedSpatialSurfaceRect[] {
  const left = Math.max(source.x, exclusion.x);
  const top = Math.max(source.y, exclusion.y);
  const right = Math.min(source.x + source.width, exclusion.x + exclusion.width);
  const bottom = Math.min(source.y + source.height, exclusion.y + exclusion.height);
  if (left >= right || top >= bottom) return [source];
  return [
    { x: source.x, y: source.y, width: source.width, height: top - source.y },
    { x: source.x, y: bottom, width: source.width, height: source.y + source.height - bottom },
    { x: source.x, y: top, width: left - source.x, height: bottom - top },
    { x: right, y: top, width: source.x + source.width - right, height: bottom - top },
  ].filter((rect) => rect.width > 0 && rect.height > 0);
}

function usableRect(
  area: NormalizedSpatialSurfaceRect,
  exclusions: readonly NormalizedSpatialSurfaceRect[],
): NormalizedSpatialSurfaceRect {
  let candidates = [area];
  for (const exclusion of exclusions) {
    candidates = candidates.flatMap((candidate) => subtractRect(candidate, exclusion));
  }
  const chosen = candidates.sort((a, b) =>
    Math.min(b.width, b.height) - Math.min(a.width, a.height) ||
    b.width * b.height - a.width * a.height,
  )[0];
  if (!chosen) throw new RangeError("Model area has no unobstructed region.");
  return chosen;
}

/** Fit the full model sphere into the largest clear reference-layout region. */
export function calculateModelStageLayout(
  modelArea: NormalizedSpatialSurfaceRect,
  exclusions: readonly NormalizedSpatialSurfaceRect[],
  shellWidthMeters: number,
  modelRadius: number,
): ModelStageLayout {
  if (!Number.isFinite(modelRadius) || modelRadius <= 0) {
    throw new RangeError("Model radius must be finite and positive.");
  }
  const safeRect = usableRect(modelArea, exclusions);
  const geometry = spatialSurfaceGeometry(safeRect, shellWidthMeters);
  const fitRadius = Math.min(geometry.widthMeters, geometry.heightMeters) / 2 -
    MODEL_STAGE.fitMarginMeters;
  if (fitRadius <= 0) throw new RangeError("Model area is too small for the configured fit margin.");
  return {
    safeRect,
    shellWidthMeters,
    home: {
      x: geometry.xMeters,
      y: geometry.yMeters,
      z: MODEL_STAGE.frontOffsetMeters,
    },
    fitScale: fitRadius / modelRadius,
    fitRadius,
  };
}

/** Ease stage translation into the approved inclusive boundary. */
export function easeModelStageValue(
  value: number,
  min: number,
  max: number,
  edgeFraction = MODEL_STAGE.softEdgeFraction,
): number {
  if (![value, min, max, edgeFraction].every(Number.isFinite) ||
    min >= max || edgeFraction <= 0 || edgeFraction >= 0.5) {
    throw new RangeError("Model stage bounds and easing fraction are invalid.");
  }
  const range = max - min;
  const edge = range * edgeFraction;
  const ease = (progress: number): number => progress * progress * (2 - progress);
  if (value <= min + edge) {
    return min + edge * ease(THREE.MathUtils.clamp((value - min) / edge, 0, 1));
  }
  if (value >= max - edge) {
    return max - edge * ease(THREE.MathUtils.clamp((max - value) / edge, 0, 1));
  }
  return value;
}

/** Measure the nearest surface of a uniformly zoomed model from the viewer. */
export function nearestModelSurfaceDistance(
  centerDistance: number,
  baseRadius: number,
  groupScale: number,
  zoom: number,
): number {
  if (![centerDistance, baseRadius, groupScale, zoom].every(Number.isFinite) ||
    centerDistance < 0 || baseRadius < 0 || groupScale <= 0 || zoom <= 0) {
    throw new RangeError("Model distance inputs must be finite and non-negative.");
  }
  return centerDistance - baseRadius * groupScale * zoom;
}

/** Compute zoom limits after applying the nearest-surface distance bounds. */
export function modelStageZoomBounds(
  centerDistance: number,
  baseRadius: number,
  groupScale: number,
): Readonly<{ min: number; max: number; minBinding: ModelStageBindingLimit; maxBinding: ModelStageBindingLimit }> {
  if (![centerDistance, baseRadius, groupScale].every(Number.isFinite) ||
    centerDistance <= 0 || baseRadius <= 0 || groupScale <= 0) {
    throw new RangeError("Model zoom bounds require positive finite dimensions.");
  }
  const radiusAtZoomOne = baseRadius * groupScale;
  const distanceMinZoom =
    (centerDistance - MODEL_LIMITS.viewerDistanceMeters.max) / radiusAtZoomOne;
  const distanceMaxZoom =
    (centerDistance - MODEL_LIMITS.viewerDistanceMeters.min) / radiusAtZoomOne;
  const min = Math.max(MODEL_LIMITS.zoom.min, distanceMinZoom);
  const max = Math.min(MODEL_LIMITS.zoom.max, distanceMaxZoom);
  return {
    min,
    max,
    minBinding: distanceMinZoom > MODEL_LIMITS.zoom.min
      ? "nearest-surface-max"
      : "zoom-min",
    maxBinding: distanceMaxZoom < MODEL_LIMITS.zoom.max
      ? "nearest-surface-min"
      : "zoom-max",
  };
}

/** Apply a stage delta with the shared soft-edge easing and report the active limit. */
export function moveModelStageAxis(
  value: number,
  delta: number,
  axis: "x" | "y",
): Readonly<{ value: number; bindingLimit: ModelStageBindingLimit }> {
  if (![value, delta].every(Number.isFinite)) {
    throw new RangeError("Model stage movement must be finite.");
  }
  const limit = MODEL_LIMITS.panMeters[axis];
  const min = -limit;
  const max = limit;
  const requested = value + delta;
  const next = easeModelStageValue(requested, min, max);
  return {
    value: next,
    bindingLimit: requested < min
      ? `pan-${axis}`
      : requested > max
        ? `pan-${axis}`
        : null,
  };
}

/** Apply a drag pan in group-local X/Y coordinates without changing depth. */
export function panModelStage(
  pose: ModelStagePose,
  deltaX: number,
  deltaY: number,
): Readonly<{ pose: ModelStagePose; bindingLimit: ModelStageBindingLimit }> {
  const x = moveModelStageAxis(pose.position.x, deltaX, "x");
  const y = moveModelStageAxis(pose.position.y, deltaY, "y");
  return {
    pose: {
      ...pose,
      position: { x: x.value, y: y.value, z: pose.position.z },
    },
    bindingLimit: x.bindingLimit ?? y.bindingLimit,
  };
}

/** Apply a zoom delta while preserving both zoom and viewer-distance limits. */
export function zoomModelStage(
  pose: ModelStagePose,
  delta: number,
  centerDistance: number,
  fitRadius: number,
  groupScale: number,
): Readonly<{ pose: ModelStagePose; bindingLimit: ModelStageBindingLimit }> {
  if (!Number.isFinite(delta)) throw new RangeError("Model zoom delta must be finite.");
  const bounds = modelStageZoomBounds(centerDistance, fitRadius, groupScale);
  if (bounds.min > bounds.max) {
    throw new RangeError("Model stage cannot satisfy the zoom and viewer-distance limits.");
  }
  const requested = pose.zoom + delta;
  const zoom = easeModelStageValue(requested, bounds.min, bounds.max);
  return {
    pose: { ...pose, zoom },
    bindingLimit: requested < bounds.min
      ? bounds.minBinding
      : requested > bounds.max
        ? bounds.maxBinding
        : null,
  };
}

/** Rotate the model freely about all three local axes. */
export function rotateModelStage(
  rotation: THREE.Quaternion,
  deltaX: number,
  deltaY: number,
  radiansPerUnit = 1,
): THREE.Quaternion {
  if (![deltaX, deltaY, radiansPerUnit].every(Number.isFinite) || radiansPerUnit <= 0) {
    throw new RangeError("Model rotation deltas must be finite.");
  }
  const delta = new THREE.Quaternion().setFromEuler(new THREE.Euler(
    deltaY * radiansPerUnit,
    deltaX * radiansPerUnit,
    (deltaX - deltaY) * radiansPerUnit / 2,
    "XYZ",
  ));
  return rotation.clone().multiply(delta).normalize();
}

/** Restore the model stage's measured home pose and default zoom. */
export function resetModelStagePose(home: ModelStagePose["position"]): ModelStagePose {
  return {
    position: { ...home },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    zoom: MODEL_LIMITS.zoom.default,
  };
}

/** Check whether a zoomed spherical model remains within the measured safe rectangle. */
export function modelFitsStageArea(
  layout: ModelStageLayout,
  groupScale: number,
  zoom: number,
  position = layout.home,
): boolean {
  const geometry = spatialSurfaceGeometry(layout.safeRect, layout.shellWidthMeters);
  const centerX = position.x * groupScale;
  const centerY = position.y * groupScale;
  const radius = layout.fitRadius * zoom * groupScale;
  const halfWidth = geometry.widthMeters * groupScale / 2;
  const halfHeight = geometry.heightMeters * groupScale / 2;
  const epsilon = Number.EPSILON * layout.shellWidthMeters * groupScale * 8;
  return radius <= halfWidth - MODEL_STAGE.fitMarginMeters * groupScale + epsilon &&
    radius <= halfHeight - MODEL_STAGE.fitMarginMeters * groupScale + epsilon &&
    centerX - radius >= geometry.xMeters * groupScale - halfWidth - epsilon &&
    centerX + radius <= geometry.xMeters * groupScale + halfWidth + epsilon &&
    centerY - radius >= geometry.yMeters * groupScale - halfHeight - epsilon &&
    centerY + radius <= geometry.yMeters * groupScale + halfHeight + epsilon;
}
