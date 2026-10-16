import type * as THREE from "three";
import type { GlassSurfaceState } from "./glass-material.js";

export type SpatialPointerEventType = "enter" | "leave" | "move" | "down" | "up" | "click" | "drag";
export type SpatialPointerSource = "controller" | "hand" | "mouse" | "touch" | "pen" | "xr";

export interface SpatialPointerEvent {
  readonly type: SpatialPointerEventType;
  readonly targetId: string;
  readonly sourceId: string;
  readonly source: SpatialPointerSource;
  /** A clamped [0, 1] position along a range-control target, when applicable. */
  readonly value?: number;
  readonly cancelled?: boolean;
  readonly point?: Readonly<{ x: number; y: number; z: number }>;
  readonly ray?: THREE.Ray;
  readonly button?: number;
  readonly shiftKey?: boolean;
  readonly clientX?: number;
  readonly clientY?: number;
  readonly gestureMode?: "rotate" | "pan";
  /** Change in separation, in metres, for a paired hand/controller zoom gesture. */
  readonly zoomDelta?: number;
}

export interface SpatialPointerTarget {
  readonly id: string;
  readonly object3d: THREE.Object3D;
  readonly disabled: boolean;
  readonly onPointerEvent?: (event: SpatialPointerEvent) => void;
  readonly getPointerValue?: (ray: THREE.Ray) => number | null;
  setState(state: GlassSurfaceState): void;
}
