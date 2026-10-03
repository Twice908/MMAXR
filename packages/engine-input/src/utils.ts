import * as THREE from "three";

export const EPSILON = 1e-6;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function distance2D(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function distance3D(a: THREE.Vector3, b: THREE.Vector3): number {
  return a.distanceTo(b);
}

export function vectorPayload(v: THREE.Vector3): { x: number; y: number; z: number } {
  return { x: v.x, y: v.y, z: v.z };
}

export function quaternionPayload(q: THREE.Quaternion): { x: number; y: number; z: number; w: number } {
  return { x: q.x, y: q.y, z: q.z, w: q.w };
}

export function angleAroundAxis(
  previous: THREE.Vector3,
  current: THREE.Vector3,
  axis: THREE.Vector3,
): number {
  const a = previous.clone().projectOnPlane(axis).normalize();
  const b = current.clone().projectOnPlane(axis).normalize();
  if (a.lengthSq() < EPSILON || b.lengthSq() < EPSILON) return 0;
  const cross = a.clone().cross(b);
  return Math.atan2(cross.dot(axis), a.dot(b));
}

export function safeNormalize(v: THREE.Vector3, fallback = new THREE.Vector3(0, 0, -1)): THREE.Vector3 {
  if (v.lengthSq() < EPSILON) return fallback.clone();
  return v.normalize();
}
