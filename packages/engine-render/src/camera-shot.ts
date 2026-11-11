import type { Position3 } from "./atom-view.js";

/**
 * A screen-mode framing: the content point to centre, how far away to view it from,
 * and the turn (yaw) and tilt (pitch) of the content, in radians. Shots are view-only;
 * moving between them never changes learning state.
 */
export interface CameraShot {
  readonly focus: Position3;
  readonly distance: number;
  readonly yaw: number;
  readonly pitch: number;
}

/** Ease in and out, so camera moves start and stop gently. */
export function easeInOut(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped < 0.5 ? 4 * clamped ** 3 : 1 - (-2 * clamped + 2) ** 3 / 2;
}

/**
 * The shot part-way (`t` from 0 to 1, eased) between two shots. Yaw turns the short
 * way round; distance changes by ratio so zooming feels even.
 */
export function interpolateShot(from: CameraShot, to: CameraShot, t: number): CameraShot {
  const k = easeInOut(t);
  const turn = Math.atan2(Math.sin(to.yaw - from.yaw), Math.cos(to.yaw - from.yaw));
  return {
    focus: {
      x: from.focus.x + (to.focus.x - from.focus.x) * k,
      y: from.focus.y + (to.focus.y - from.focus.y) * k,
      z: from.focus.z + (to.focus.z - from.focus.z) * k,
    },
    distance: from.distance * (to.distance / from.distance) ** k,
    yaw: from.yaw + turn * k,
    pitch: from.pitch + (to.pitch - from.pitch) * k,
  };
}

/** A sensible move length for a shot change: longer for bigger moves, 0.6 to 2.2 seconds. */
export function shotDurationMs(from: CameraShot, to: CameraShot): number {
  const travel = Math.hypot(to.focus.x - from.focus.x, to.focus.y - from.focus.y, to.focus.z - from.focus.z);
  const zoom = Math.abs(Math.log(to.distance / from.distance));
  const turn = Math.abs(Math.atan2(Math.sin(to.yaw - from.yaw), Math.cos(to.yaw - from.yaw))) + Math.abs(to.pitch - from.pitch);
  return Math.round(Math.min(2200, Math.max(600, 600 + travel * 120 + zoom * 700 + turn * 400)));
}
