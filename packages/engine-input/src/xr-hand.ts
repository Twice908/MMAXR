import * as THREE from "three";
import type { InputAdapter, InputAction, PickFunction, Handedness, InputEventMap } from "./types.js";
import { ActionDispatcher } from "./action-dispatcher.js";
import { InputEventBus } from "./event-bus.js";
import { GestureRecognizer } from "./gestures.js";
import { safeNormalize } from "./utils.js";

export const XR_HAND_JOINTS = [
  "wrist",
  "thumb-metacarpal", "thumb-phalanx-proximal", "thumb-phalanx-distal", "thumb-tip",
  "index-finger-metacarpal", "index-finger-phalanx-proximal", "index-finger-phalanx-intermediate", "index-finger-phalanx-distal", "index-finger-tip",
  "middle-finger-metacarpal", "middle-finger-phalanx-proximal", "middle-finger-phalanx-intermediate", "middle-finger-phalanx-distal", "middle-finger-tip",
  "ring-finger-metacarpal", "ring-finger-phalanx-proximal", "ring-finger-phalanx-intermediate", "ring-finger-phalanx-distal", "ring-finger-tip",
  "pinky-finger-metacarpal", "pinky-finger-phalanx-proximal", "pinky-finger-phalanx-intermediate", "pinky-finger-phalanx-distal", "pinky-finger-tip",
] as const;

export type XrHandJointName = typeof XR_HAND_JOINTS[number];

export interface XrHandInputOptions {
  renderer: THREE.WebGLRenderer;
  dispatch: (action: InputAction) => void;
  pick?: PickFunction;
  events?: InputEventBus;
  pinchStartDistance?: number;
  pinchEndDistance?: number;
  grabCurlThreshold?: number;
  showJointDebug?: boolean;
}

interface TrackedHand {
  handedness: Handedness;
  sourceId: string;
  gesture: GestureRecognizer;
  joints: Map<string, THREE.Vector3>;
  jointRadii: Map<string, number>;
  debugGroup?: THREE.Group;
}

export class XrHandInputAdapter implements InputAdapter {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly events!: InputEventBus;
  private readonly dispatcher!: ActionDispatcher;
  private readonly pick: PickFunction | undefined;
  private readonly options: XrHandInputOptions;
  private readonly hands = new Map<Handedness, TrackedHand>();
  private readonly jointScratch = new THREE.Vector3();
  private readonly directionScratch = new THREE.Vector3();
  private readonly debugMaterial = new THREE.MeshBasicMaterial({ wireframe: true });
  private disposed = false;

  constructor(options: XrHandInputOptions) {
    this.renderer = options.renderer;
    this.events = options.events ?? new InputEventBus();
    this.dispatcher = new ActionDispatcher(options.dispatch, this.events);
    this.pick = options.pick;
    this.options = options;
  }

  on<K extends keyof InputEventMap>(
    type: K,
    listener: (event: InputEventMap[K]) => void,
  ): () => void {
    return this.events.on(type, listener);
  }

  update(frameOrDelta?: number | XRFrame): void {
    const frame = typeof frameOrDelta === "number" ? undefined : frameOrDelta;
    if (this.disposed || !frame) return;

    const session = this.renderer.xr.getSession();
    const referenceSpace = this.renderer.xr.getReferenceSpace();
    if (!session || !referenceSpace) return;

    const active = new Set<Handedness>();

    for (const source of session.inputSources) {
      if (!source.hand || (source.handedness !== "left" && source.handedness !== "right")) continue;

      const handedness = source.handedness;
      active.add(handedness);

      let tracked = this.hands.get(handedness);
      if (!tracked) {
        tracked = this.createHand(handedness);
        this.hands.set(handedness, tracked);
        this.events.emit("sourceAdded", {
          source: "xr-hand",
          id: tracked.sourceId,
        });
      }

      const ok = this.updateJoints(tracked, source.hand, frame, referenceSpace);
      if (!ok) continue;

      this.updateDebugModel(tracked);
      this.updateGesture(tracked);
    }

    for (const [handedness, tracked] of this.hands) {
      if (!active.has(handedness)) {
        tracked.gesture.removeHand(handedness);
        tracked.debugGroup?.removeFromParent();
        this.hands.delete(handedness);
        this.events.emit("sourceRemoved", {
          source: "xr-hand",
          id: tracked.sourceId,
        });
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const tracked of this.hands.values()) {
      tracked.gesture.reset();
      tracked.debugGroup?.removeFromParent();
    }
    this.hands.clear();
    this.debugMaterial.dispose();
  }

  private createHand(handedness: Handedness): TrackedHand {
    const gesture = new GestureRecognizer(
      "xr-hand",
      `hand-${handedness}`,
      this.dispatcher,
      this.events,
      {
        ...(this.options.pinchStartDistance !== undefined
          ? { pinchStartDistance: this.options.pinchStartDistance }
          : {}),
        ...(this.options.pinchEndDistance !== undefined
          ? { pinchEndDistance: this.options.pinchEndDistance }
          : {}),
        ...(this.options.grabCurlThreshold !== undefined
          ? { grabCurlThreshold: this.options.grabCurlThreshold }
          : {}),
      },
    );

    const tracked: TrackedHand = {
      handedness,
      sourceId: `hand-${handedness}`,
      gesture,
      joints: new Map(),
      jointRadii: new Map(),
    };

    if (this.options.showJointDebug) {
      tracked.debugGroup = new THREE.Group();
      this.createDebugJoints(tracked.debugGroup);
      this.renderer.xr.getCamera().add(tracked.debugGroup);
    }

    return tracked;
  }

  private updateJoints(
    tracked: TrackedHand,
    hand: XRHand,
    frame: XRFrame,
    referenceSpace: XRReferenceSpace,
  ): boolean {
    tracked.joints.clear();
    tracked.jointRadii.clear();

    let count = 0;
    for (const jointName of XR_HAND_JOINTS) {
      const jointSpace = hand.get(jointName);
      if (!jointSpace) continue;

      const pose = frame.getJointPose?.(jointSpace, referenceSpace);
      if (!pose) continue;

      const position = new THREE.Vector3(
        pose.transform.position.x,
        pose.transform.position.y,
        pose.transform.position.z,
      );
      tracked.joints.set(jointName, position);
      tracked.jointRadii.set(jointName, pose.radius ?? 0.008);
      count++;
    }

    return count >= 10;
  }

  private updateGesture(tracked: TrackedHand): void {
    const wrist = tracked.joints.get("wrist");
    const thumb = tracked.joints.get("thumb-tip");
    const index = tracked.joints.get("index-finger-tip");
    const indexProximal = tracked.joints.get("index-finger-phalanx-proximal");
    const middle = tracked.joints.get("middle-finger-tip");
    const ring = tracked.joints.get("ring-finger-tip");
    const pinky = tracked.joints.get("pinky-finger-tip");

    if (!wrist || !thumb || !index || !indexProximal || !middle || !ring || !pinky) return;

    const pinchDistance = thumb.distanceTo(index);

    const palmScale = Math.max(
      wrist.distanceTo(indexProximal),
      0.08,
    );

    const middleCurl = 1 - Math.min(1, wrist.distanceTo(middle) / (palmScale * 3.1));
    const ringCurl = 1 - Math.min(1, wrist.distanceTo(ring) / (palmScale * 2.8));
    const pinkyCurl = 1 - Math.min(1, wrist.distanceTo(pinky) / (palmScale * 2.5));
    const indexCurl = 1 - Math.min(1, wrist.distanceTo(index) / (palmScale * 3.5));
    const fingerCurl = (middleCurl + ringCurl + pinkyCurl + indexCurl) / 4;

    const indexDirection = safeNormalize(
      this.directionScratch.copy(index).sub(indexProximal),
    );

    const target = this.pickHandTarget(tracked, index, indexDirection);

    tracked.gesture.updateHand(
      {
        handedness: tracked.handedness,
        position: wrist,
        pinchDistance,
        fingerCurl,
        indexDirection,
        timestamp: performance.now(),
      },
      target,
    );
  }

  private pickHandTarget(
    tracked: TrackedHand,
    origin: THREE.Vector3,
    direction: THREE.Vector3,
  ): string | null {
    if (!this.pick) return null;

    const result = this.pick({
      origin: origin.clone(),
      direction: direction.clone(),
      source: "xr-hand",
      handedness: tracked.handedness,
    });

    return result?.target ?? null;
  }

  private createDebugJoints(group: THREE.Group): void {
    const geometry = new THREE.SphereGeometry(0.006, 8, 8);
    for (const joint of XR_HAND_JOINTS) {
      const mesh = new THREE.Mesh(geometry, this.debugMaterial);
      mesh.name = `xr-hand-joint:${joint}`;
      group.add(mesh);
    }
  }

  private updateDebugModel(tracked: TrackedHand): void {
    if (!tracked.debugGroup) return;

    XR_HAND_JOINTS.forEach((jointName, index) => {
      const mesh = tracked.debugGroup!.children[index];
      const position = tracked.joints.get(jointName);
      if (!position || !mesh) {
        if (mesh) mesh.visible = false;
        return;
      }
      mesh.visible = true;
      mesh.position.copy(position);
      const radius = tracked.jointRadii.get(jointName) ?? 0.006;
      mesh.scale.setScalar(radius / 0.006);
    });
  }
}
