/**
 * Pinch detection from hand joints. This is only the fallback: Meta documents that
 * a regular pinch is exposed as a button on the hand's emulated gamepad (and normally
 * as select events), so those signals are preferred whenever a source provides them.
 */

export interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Joint positions needed to judge a pinch. Wrist and index metacarpal give hand size. */
export interface PinchJoints {
  readonly thumbTip: Point3;
  readonly indexTip: Point3;
  readonly wrist?: Point3 | undefined;
  readonly indexMetacarpal?: Point3 | undefined;
}

/** Typical wrist-to-index-knuckle distance of an adult hand, in metres. */
export const REFERENCE_HAND_SIZE = 0.08;
/** Fingertip distance, at reference hand size, that starts a pinch. Tunable after device testing. */
export const PINCH_START_DISTANCE = 0.022;
/** Fingertip distance, at reference hand size, that ends a pinch. Larger than the start distance. */
export const PINCH_END_DISTANCE = 0.04;

/** Euclidean distance between two points. */
export function distance3(a: Point3, b: Point3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Midpoint between two points. */
export function midpoint3(a: Point3, b: Point3): Point3 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

/** Scale pinch thresholds to the hand; falls back to 1 when the size joints are missing. */
export function handScale(joints: PinchJoints): number {
  if (!joints.wrist || !joints.indexMetacarpal) return 1;
  const size = distance3(joints.wrist, joints.indexMetacarpal);
  if (!Number.isFinite(size) || size <= 0) return 1;
  return Math.min(1.35, Math.max(0.75, size / REFERENCE_HAND_SIZE));
}

/** Hysteresis pinch detector for one hand. */
export class PinchDetector {
  private pinching = false;
  private lastDistance: number | null = null;

  /** Whether the hand is currently pinching. */
  get active(): boolean {
    return this.pinching;
  }

  /** Last fingertip distance in metres, or null before the first reading. */
  get distance(): number | null {
    return this.lastDistance;
  }

  /** Feed one frame of joints. Returns `down` or `up` only when the state changes. */
  update(joints: PinchJoints): "down" | "up" | null {
    const gap = distance3(joints.thumbTip, joints.indexTip);
    this.lastDistance = gap;
    const scale = handScale(joints);
    if (!this.pinching && gap <= PINCH_START_DISTANCE * scale) {
      this.pinching = true;
      return "down";
    }
    if (this.pinching && gap >= PINCH_END_DISTANCE * scale) {
      this.pinching = false;
      return "up";
    }
    return null;
  }

  /** Clear state when tracking is lost, without reporting an edge. */
  reset(): void {
    this.pinching = false;
    this.lastDistance = null;
  }
}
