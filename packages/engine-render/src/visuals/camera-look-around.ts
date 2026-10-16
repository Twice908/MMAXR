import * as THREE from "three";
import { calculateSpatialLayoutLookAngles } from "./spatial-placement.js";
import type { NormalizedSpatialSurfaceRect } from "../spatial-layout.js";

export interface CameraLookAngles {
  readonly yawRadians: number;
  readonly pitchRadians: number;
}

export interface CameraLookLimits {
  readonly yawRadians: number;
  readonly pitchRadians: number;
  readonly edges: Readonly<{
    leftDegrees: number;
    rightDegrees: number;
    upDegrees: number;
    downDegrees: number;
  }>;
}

export interface DeviceOrientationSample {
  readonly alpha: number;
  readonly beta: number;
  readonly gamma: number;
  readonly screenAngleDegrees: number;
}

/** Convert a browser device-orientation sample to a world-relative quaternion. */
export function deviceOrientationQuaternion(sample: DeviceOrientationSample): THREE.Quaternion {
  if (![sample.alpha, sample.beta, sample.gamma, sample.screenAngleDegrees].every(Number.isFinite)) {
    throw new RangeError("Device orientation values must be finite.");
  }
  const euler = new THREE.Euler(
    THREE.MathUtils.degToRad(sample.beta),
    THREE.MathUtils.degToRad(sample.alpha),
    -THREE.MathUtils.degToRad(sample.gamma),
    "YXZ",
  );
  const orientation = new THREE.Quaternion().setFromEuler(euler);
  return orientation.multiply(new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 0, 1),
    -THREE.MathUtils.degToRad(sample.screenAngleDegrees),
  ));
}

/** Measure the required camera rotation from the centered model to each shell edge. */
export function calculateCameraLookLimits(
  layout: Readonly<{ shell: NormalizedSpatialSurfaceRect }>,
  modelPanelRect: NormalizedSpatialSurfaceRect,
  shellWidthMeters: number,
  distanceMeters: number,
  scale: number,
  verticalFovDegrees: number,
  aspect: number,
  marginDegrees: number,
): CameraLookLimits {
  if (![verticalFovDegrees, aspect, marginDegrees].every(Number.isFinite) ||
    verticalFovDegrees <= 0 || verticalFovDegrees >= 180 || aspect <= 0 || marginDegrees < 0) {
    throw new RangeError("Camera look framing requires a valid FOV, aspect, and non-negative margin.");
  }
  const projectionY = 1 / Math.tan(THREE.MathUtils.degToRad(verticalFovDegrees) / 2);
  const framing = calculateSpatialLayoutLookAngles(
    { shell: layout.shell, modelPanel: modelPanelRect },
    shellWidthMeters,
    distanceMeters,
    scale,
    projectionY / aspect,
    projectionY,
  );
  const edges = {
    leftDegrees: framing.leftDegrees,
    rightDegrees: framing.rightDegrees,
    upDegrees: framing.upDegrees,
    downDegrees: framing.downDegrees,
  };
  return {
    yawRadians: THREE.MathUtils.degToRad(Math.max(edges.leftDegrees, edges.rightDegrees) + marginDegrees),
    pitchRadians: THREE.MathUtils.degToRad(Math.max(edges.upDegrees, edges.downDegrees) + marginDegrees),
    edges,
  };
}

/** Apply an eased hard limit to a camera look angle. */
export function softClampCameraAngle(angleRadians: number, limitRadians: number): number {
  if (!Number.isFinite(angleRadians) || !Number.isFinite(limitRadians) || limitRadians <= 0) {
    throw new RangeError("Camera look angles and limits must be finite and positive.");
  }
  const magnitude = Math.abs(angleRadians);
  const sign = Math.sign(angleRadians);
  if (magnitude <= limitRadians * 0.8) return angleRadians;
  const excess = magnitude - limitRadians * 0.8;
  const eased = limitRadians * 0.8 + limitRadians * 0.2 *
    Math.tanh(excess / (limitRadians * 0.2));
  return sign * eased;
}

/** Map an orientation relative to its initial pose into yaw and pitch. */
export function relativeDeviceLookAngles(
  initial: THREE.Quaternion,
  current: THREE.Quaternion,
): CameraLookAngles {
  const relative = initial.clone().invert().multiply(current).normalize();
  const euler = new THREE.Euler().setFromQuaternion(relative, "YXZ");
  return { yawRadians: euler.y, pitchRadians: euler.x };
}

/** Convert a one-finger drag delta to a camera look change. */
export function cameraDragLookDelta(
  deltaX: number,
  deltaY: number,
  radiansPerPixel: number,
): CameraLookAngles {
  if (![deltaX, deltaY, radiansPerPixel].every(Number.isFinite) || radiansPerPixel <= 0) {
    throw new RangeError("Camera drag deltas and sensitivity must be finite and positive.");
  }
  return {
    yawRadians: -deltaX * radiansPerPixel,
    pitchRadians: -deltaY * radiansPerPixel,
  };
}
