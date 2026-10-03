import type { EngineAction, JsonValue } from "@mma/engine-core";
import * as THREE from "three";

export type InputSourceKind = "touch" | "mouse" | "xr-controller" | "xr-hand";

export type Handedness = "left" | "right" | "none";

export type GestureType =
  | "hover"
  | "select"
  | "grab"
  | "move"
  | "release"
  | "rotate"
  | "scale"
  | "confirm"
  | "back";

export interface InputAction extends EngineAction {
  readonly type: GestureType | string;
  readonly payload: JsonValue;
}

export interface PickResult {
  readonly target: string;
  readonly object?: THREE.Object3D;
  readonly point?: THREE.Vector3;
  readonly distance?: number;
}

export interface RayPick {
  readonly origin: THREE.Vector3;
  readonly direction: THREE.Vector3;
  readonly source: InputSourceKind;
  readonly handedness?: Handedness;
  readonly pointerId?: number;
}

export type PickFunction = (ray: RayPick) => PickResult | null;

export interface InputActionDispatcher {
  (action: InputAction): void;
}

export interface InputEventMap {
  action: InputAction;
  gesture: GestureEvent;
  sourceAdded: { source: InputSourceKind; id: string };
  sourceRemoved: { source: InputSourceKind; id: string };
}

export interface GestureEvent {
  readonly type: GestureType;
  readonly source: InputSourceKind;
  readonly id: string;
  readonly handedness: Handedness;
  readonly position?: { x: number; y: number; z: number };
  readonly delta?: { x: number; y: number; z: number };
  readonly scale?: number;
  readonly rotation?: { x: number; y: number; z: number; w: number };
  readonly target?: string | null;
}

export interface Disposable {
  dispose(): void;
}

export interface InputAdapter extends Disposable {
  update?(deltaSeconds?: number | XRFrame): void;
}
