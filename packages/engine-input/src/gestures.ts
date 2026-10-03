import type { InputEventBus } from "./event-bus.js";
import type { ActionDispatcher } from "./action-dispatcher.js";
import type { GestureEvent, Handedness, InputSourceKind } from "./types.js";
import { clamp, vectorPayload } from "./utils.js";
import * as THREE from "three";

export interface GestureConfig {
  pinchStartDistance?: number;
  pinchEndDistance?: number;
  grabCurlThreshold?: number;
  gestureSmoothing?: number;
  movementDeadzone?: number;
}

interface HandSnapshot {
  handedness: Handedness;
  position: THREE.Vector3;
  pinchDistance: number;
  fingerCurl: number;
  indexDirection?: THREE.Vector3;
  timestamp: number;
}

interface HandGestureState {
  pinch: boolean;
  grab: boolean;
  position: THREE.Vector3;
  target: string | null;
}

export interface TwoHandState {
  active: boolean;
  distance: number;
  angle: number;
  center: THREE.Vector3;
}

export class GestureRecognizer {
  private readonly config: Required<GestureConfig>;
  private readonly hands = new Map<Handedness, HandGestureState>();
  private readonly previousHands = new Map<Handedness, HandSnapshot>();
  private twoHand: TwoHandState | null = null;

  constructor(
    private readonly source: InputSourceKind,
    private readonly id: string,
    private readonly dispatcher: ActionDispatcher,
    private readonly events: InputEventBus,
    config: GestureConfig = {},
  ) {
    this.config = {
      pinchStartDistance: config.pinchStartDistance ?? 0.028,
      pinchEndDistance: config.pinchEndDistance ?? 0.045,
      grabCurlThreshold: config.grabCurlThreshold ?? 0.68,
      gestureSmoothing: clamp(config.gestureSmoothing ?? 0.45, 0, 1),
      movementDeadzone: config.movementDeadzone ?? 0.002,
    };
  }

  updateHand(snapshot: HandSnapshot, target: string | null = null): void {
    const handedness = snapshot.handedness;
    if (handedness === "none") return;

    const previous = this.previousHands.get(handedness);
    const state = this.hands.get(handedness) ?? {
      pinch: false,
      grab: false,
      position: snapshot.position.clone(),
      target: null,
    };

    state.position.lerp(snapshot.position, this.config.gestureSmoothing);
    state.target = target;

    const wasPinching = state.pinch;
    const wasGrabbing = state.grab;

    state.pinch = wasPinching
      ? snapshot.pinchDistance <= this.config.pinchEndDistance
      : snapshot.pinchDistance <= this.config.pinchStartDistance;

    state.grab = snapshot.fingerCurl >= this.config.grabCurlThreshold;

    this.hands.set(handedness, state);
    this.previousHands.set(handedness, {
      ...snapshot,
      position: state.position.clone(),
    });

    if (!wasPinching && state.pinch) {
      this.emitGesture("select", handedness, state.position, target);
      this.emitGesture("grab", handedness, state.position, target);
    } else if (wasPinching && !state.pinch) {
      this.emitGesture("release", handedness, state.position, target);
    } else if (state.pinch) {
      const delta = previous
        ? state.position.clone().sub(previous.position)
        : new THREE.Vector3();
      if (delta.length() >= this.config.movementDeadzone) {
        this.emitGesture("move", handedness, state.position, target, delta);
      }
    }

    if (!wasGrabbing && state.grab && !state.pinch) {
      this.emitGesture("grab", handedness, state.position, target);
    } else if (wasGrabbing && !state.grab && !state.pinch) {
      this.emitGesture("release", handedness, state.position, target);
    } else if (state.grab && !state.pinch && previous) {
      const delta = state.position.clone().sub(previous.position);
      if (delta.length() >= this.config.movementDeadzone) {
        this.emitGesture("move", handedness, state.position, target, delta);
      }
    }

    this.updateTwoHandGesture();
  }

  removeHand(handedness: Handedness): void {
    if (handedness === "none") return;
    const state = this.hands.get(handedness);
    if (state?.pinch || state?.grab) {
      this.emitGesture("release", handedness, state.position, state.target);
    }
    this.hands.delete(handedness);
    this.previousHands.delete(handedness);
    if (this.hands.size < 2) this.twoHand = null;
  }

  reset(): void {
    this.hands.clear();
    this.previousHands.clear();
    this.twoHand = null;
  }

  private updateTwoHandGesture(): void {
    const left = this.hands.get("left");
    const right = this.hands.get("right");
    if (!left || !right || (!left.pinch && !right.pinch && !left.grab && !right.grab)) {
      this.twoHand = null;
      return;
    }

    const vector = right.position.clone().sub(left.position);
    const distance = vector.length();
    if (distance < 0.02) return;

    const center = left.position.clone().add(right.position).multiplyScalar(0.5);
    const angle = Math.atan2(vector.y, vector.x);

    if (!this.twoHand) {
      this.twoHand = { active: true, distance, angle, center };
      return;
    }

    const scale = distance / Math.max(this.twoHand.distance, 0.0001);
    if (Math.abs(scale - 1) > 0.008) {
      this.dispatcher.emit({
        type: "scale",
        payload: {
          source: this.source,
          hands: "left+right",
          scale,
          center: vectorPayload(center),
        },
      });
      this.events.emit("gesture", {
        type: "scale",
        source: this.source,
        id: this.id,
        handedness: "none",
        position: vectorPayload(center),
        scale,
      });
    }

    const deltaAngle = angle - this.twoHand.angle;
    if (Math.abs(deltaAngle) > 0.012) {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), deltaAngle);
      this.dispatcher.emit({
        type: "rotate",
        payload: {
          source: this.source,
          hands: "left+right",
          rotation: {
            x: q.x,
            y: q.y,
            z: q.z,
            w: q.w,
          },
          center: vectorPayload(center),
        },
      });
      this.events.emit("gesture", {
        type: "rotate",
        source: this.source,
        id: this.id,
        handedness: "none",
        position: vectorPayload(center),
        rotation: { x: q.x, y: q.y, z: q.z, w: q.w },
      });
    }

    this.twoHand = { active: true, distance, angle, center };
  }

  private emitGesture(
    type: "select" | "grab" | "move" | "release",
    handedness: Handedness,
    position: THREE.Vector3,
    target: string | null,
    delta?: THREE.Vector3,
  ): void {
    const event: GestureEvent = {
      type,
      source: this.source,
      id: this.id,
      handedness,
      position: vectorPayload(position),
      target,
      ...(delta ? { delta: vectorPayload(delta) } : {}),
    };

    this.events.emit("gesture", event);

    const payload: Record<string, unknown> = {
      source: this.source,
      id: this.id,
      handedness,
      position: vectorPayload(position),
    };
    if (target) payload.target = target;
    if (delta) payload.delta = vectorPayload(delta);

    this.dispatcher.emit({
      type,
      payload: payload as never,
    });
  }
}
