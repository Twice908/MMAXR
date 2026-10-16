import * as THREE from "three";
import { ActionDispatcher } from "./action-dispatcher.js";
import { InputEventBus } from "./event-bus.js";
import type { InputAction, InputAdapter, InputEventMap, PickFunction } from "./types.js";

export interface XrSessionInputOptions {
  readonly dispatch: (action: InputAction) => void;
  readonly pick: PickFunction;
  readonly handlePanelRay: (
    ray: THREE.Ray,
    phase: "move" | "down" | "up" | "cancel",
    sourceId: string,
    source: "controller" | "hand",
    gestureMode?: "rotate" | "pan",
    zoomDelta?: number,
  ) => boolean;
  readonly events?: InputEventBus;
}

interface SmoothedRay {
  readonly origin: THREE.Vector3;
  readonly direction: THREE.Vector3;
}

/** Adapt live XR session sources without relying on renderer controller slots. */
export class XrSessionInputAdapter implements InputAdapter {
  private readonly events: InputEventBus;
  private readonly dispatch: ActionDispatcher;
  private readonly sourceIds = new Map<XRInputSource, string>();
  private readonly smoothRays = new Map<string, SmoothedRay>();
  private readonly panelPressed = new Set<string>();
  private readonly pinching = new Set<string>();
  private readonly gripping = new Set<string>();
  private readonly pinchCenters = new Map<string, THREE.Vector3>();
  private readonly gripCenters = new Map<string, THREE.Vector3>();
  private session: XRSession | null = null;
  private referenceSpace: XRReferenceSpace | null = null;
  private animationFrame: number | null = null;
  private nextSourceId = 0;
  private pairedGestureSeparation: number | null = null;
  private pairedGestureType: "hands" | "controllers" | null = null;
  private disposed = false;

  constructor(private readonly options: XrSessionInputOptions) {
    this.events = options.events ?? new InputEventBus();
    this.dispatch = new ActionDispatcher(options.dispatch, this.events);
  }

  on<K extends keyof InputEventMap>(type: K, listener: (event: InputEventMap[K]) => void): () => void {
    return this.events.on(type, listener);
  }

  /** Attach to an active session, or detach when passed null. */
  async setSession(session: XRSession | null): Promise<void> {
    this.detachSession();
    if (this.disposed || !session) return;
    this.session = session;
    session.addEventListener("inputsourceschange", this.onInputSourcesChange);
    session.addEventListener("selectstart", this.onSelectStart);
    session.addEventListener("select", this.onSelect);
    session.addEventListener("selectend", this.onSelectEnd);
    session.addEventListener("end", this.onSessionEnd, { once: true });
    for (const source of session.inputSources) this.addSource(source);
    try {
      this.referenceSpace = await session.requestReferenceSpace("local");
    } catch (error) {
      this.detachSession();
      throw error;
    }
    if (this.session === session && !this.disposed) this.requestNextFrame();
  }

  update(frameOrDelta?: number | XRFrame): void {
    if (this.disposed || typeof frameOrDelta === "number" || !frameOrDelta || !this.session || !this.referenceSpace) {
      return;
    }
    const frame = frameOrDelta;
    this.ensureCurrentSources();

    const frameSources: { source: XRInputSource; id: string; ray: THREE.Ray | null }[] = [];
    for (const source of this.session.inputSources) {
      const id = this.sourceIds.get(source);
      if (!id) continue;
      const ray = this.readRay(source, frame, id);
      if (source.hand) this.updateHandPinch(source, frame, id, ray);
      else if (source.targetRayMode === "tracked-pointer") {
        this.updateControllerGrip(source, frame, id, ray);
      }
      frameSources.push({ source, id, ray });
    }
    const pairedZoomDelta = this.readPairedGestureZoomDelta();
    let pairedZoomDelivered = false;
    for (const { source, id, ray } of frameSources) {
      const isHand = source.hand !== null;
      const gestureMode = !isHand && this.gripping.has(id) ? "pan" : "rotate";
      const zoomDelta = pairedZoomDelta !== null && !pairedZoomDelivered &&
        this.panelPressed.has(id)
        ? pairedZoomDelta
        : undefined;
      if (zoomDelta !== undefined) pairedZoomDelivered = true;
      if (ray && !this.options.handlePanelRay(
        ray,
        "move",
        id,
        isHand ? "hand" : "controller",
        gestureMode,
        zoomDelta,
      )) {
        const target = this.options.pick({
          origin: ray.origin.clone(),
          direction: ray.direction.clone(),
          source: source.hand ? "xr-hand" : "xr-controller",
          handedness: source.handedness === "left" || source.handedness === "right"
            ? source.handedness
            : "none",
        });
        if (target) {
          this.dispatch.emit({
            type: "hover",
            payload: { source: source.hand ? "xr-hand" : "xr-controller", target: target.target },
          });
        }
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.detachSession();
  }

  private readonly onInputSourcesChange = (event: Event): void => {
    const change = event as XRInputSourcesChangeEvent;
    for (const source of change.removed) this.removeSource(source);
    for (const source of change.added) this.addSource(source);
    this.ensureCurrentSources();
  };

  private readonly onSelectStart = (event: Event): void => {
    const { inputSource, frame } = event as XRInputSourceEvent;
    if (inputSource.targetRayMode === "transient-pointer" || inputSource.hand) return;
    this.beginSelect(inputSource, frame);
  };

  private readonly onSelect = (event: Event): void => {
    const { inputSource, frame } = event as XRInputSourceEvent;
    if (inputSource.hand) return;
    const id = this.ensureSource(inputSource);
    const ray = this.readRay(inputSource, frame, id);
    if (!ray) return;
    if (inputSource.targetRayMode === "transient-pointer") {
      const source = inputSource.hand ? "hand" : "controller";
      const panelDown = this.options.handlePanelRay(ray, "down", id, source);
      const panelUp = this.options.handlePanelRay(ray, "up", id, source);
      if (!panelDown && !panelUp) this.selectAtom(inputSource, ray);
      this.removeSource(inputSource);
    } else if (!this.panelPressed.has(id)) {
      this.selectAtom(inputSource, ray);
    }
  };

  private readonly onSelectEnd = (event: Event): void => {
    const { inputSource, frame } = event as XRInputSourceEvent;
    if (inputSource.targetRayMode === "transient-pointer" || inputSource.hand) return;
    const id = this.ensureSource(inputSource);
    const ray = this.readRay(inputSource, frame, id);
    if (ray) {
      this.options.handlePanelRay(ray, "up", id, "controller", "rotate");
    } else {
      this.options.handlePanelRay(new THREE.Ray(), "cancel", id, "controller", "rotate");
    }
    this.panelPressed.delete(id);
  };

  private readonly onSessionEnd = (): void => {
    this.detachSession();
  };

  private beginSelect(source: XRInputSource, frame: XRFrame): void {
    const id = this.ensureSource(source);
    const ray = this.readRay(source, frame, id);
    if (ray && this.options.handlePanelRay(ray, "down", id, source.hand ? "hand" : "controller")) this.panelPressed.add(id);
  }

  private selectAtom(source: XRInputSource, ray: THREE.Ray): void {
    const target = this.options.pick({
      origin: ray.origin.clone(),
      direction: ray.direction.clone(),
      source: source.hand ? "xr-hand" : "xr-controller",
      handedness: source.handedness === "left" || source.handedness === "right"
        ? source.handedness
        : "none",
    });
    if (target) {
      this.dispatch.emit({
        type: "select",
        payload: { source: source.hand ? "xr-hand" : "xr-controller", target: target.target },
      });
    }
  }

  private readRay(source: XRInputSource, frame: XRFrame, id: string): THREE.Ray | null {
    if (!this.referenceSpace) return null;
    const pose = frame.getPose(source.targetRaySpace, this.referenceSpace);
    if (!pose) return null;
    const transform = pose.transform;
    const origin = new THREE.Vector3(
      transform.position.x,
      transform.position.y,
      transform.position.z,
    );
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion(
      transform.orientation.x,
      transform.orientation.y,
      transform.orientation.z,
      transform.orientation.w,
    )).normalize();
    let smoothed = this.smoothRays.get(id);
    if (!smoothed) {
      smoothed = { origin, direction };
      this.smoothRays.set(id, smoothed);
    } else {
      smoothed.origin.lerp(origin, 0.35);
      smoothed.direction.lerp(direction, 0.35).normalize();
    }
    return new THREE.Ray(smoothed.origin, smoothed.direction);
  }

  private updateHandPinch(
    source: XRInputSource,
    frame: XRFrame,
    id: string,
    ray: THREE.Ray | null,
  ): void {
    if (!source.hand || !this.referenceSpace) return;
    const thumbSpace = source.hand.get("thumb-tip");
    const indexSpace = source.hand.get("index-finger-tip");
    const getJointPose = frame.getJointPose;
    if (!thumbSpace || !indexSpace || !getJointPose) return;
    const thumb = getJointPose.call(frame, thumbSpace, this.referenceSpace);
    const index = getJointPose.call(frame, indexSpace, this.referenceSpace);
    if (!thumb || !index) return;
    const a = thumb.transform.position;
    const b = index.transform.position;
    const distance = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    this.pinchCenters.set(id, new THREE.Vector3(
      (a.x + b.x) / 2,
      (a.y + b.y) / 2,
      (a.z + b.z) / 2,
    ));
    if (distance < 0.025 && !this.pinching.has(id)) {
      this.pinching.add(id);
      if (ray && this.options.handlePanelRay(ray, "down", id, "hand")) this.panelPressed.add(id);
    } else if (distance > 0.04 && this.pinching.has(id)) {
      this.pinching.delete(id);
      this.pinchCenters.delete(id);
      if (ray) this.options.handlePanelRay(ray, "up", id, "hand", "rotate");
      else this.options.handlePanelRay(new THREE.Ray(), "cancel", id, "hand", "rotate");
      if (!this.panelPressed.has(id) && ray) this.selectAtom(source, ray);
      this.panelPressed.delete(id);
    }
  }

  private updateControllerGrip(
    source: XRInputSource,
    frame: XRFrame,
    id: string,
    ray: THREE.Ray | null,
  ): void {
    if (!this.referenceSpace || !source.gripSpace) return;
    const pose = frame.getPose(source.gripSpace, this.referenceSpace);
    if (!pose) return;
    const point = pose.transform.position;
    this.gripCenters.set(id, new THREE.Vector3(point.x, point.y, point.z));
    const isGripping = source.gamepad?.buttons[1]?.pressed ?? false;
    if (isGripping && !this.gripping.has(id)) {
      this.gripping.add(id);
      if (ray && this.options.handlePanelRay(ray, "down", id, "controller", "pan")) {
        this.panelPressed.add(id);
      }
    } else if (!isGripping && this.gripping.has(id)) {
      this.gripping.delete(id);
      if (ray) this.options.handlePanelRay(ray, "up", id, "controller", "pan");
      else this.options.handlePanelRay(new THREE.Ray(), "cancel", id, "controller", "pan");
      this.panelPressed.delete(id);
      this.gripCenters.delete(id);
    }
  }

  private readPairedGestureZoomDelta(): number | null {
    const hands = [...this.pinchCenters]
      .filter(([id]) => this.pinching.has(id))
      .map(([, point]) => point);
    const controllers = [...this.gripCenters]
      .filter(([id]) => this.gripping.has(id))
      .map(([, point]) => point);
    const kind = hands.length >= 2
      ? "hands"
      : controllers.length >= 2
        ? "controllers"
        : null;
    if (!kind) {
      this.pairedGestureSeparation = null;
      this.pairedGestureType = null;
      return null;
    }
    const centers = kind === "hands" ? hands : controllers;
    const separation = centers[0]!.distanceTo(centers[1]!);
    const previous = this.pairedGestureSeparation;
    this.pairedGestureSeparation = separation;
    if (kind !== this.pairedGestureType) {
      this.pairedGestureType = kind;
      return 0;
    }
    return previous === null ? 0 : separation - previous;
  }

  private ensureCurrentSources(): void {
    if (!this.session) return;
    const current = new Set(this.session.inputSources);
    for (const source of this.sourceIds.keys()) {
      if (!current.has(source)) this.removeSource(source);
    }
    for (const source of current) this.addSource(source);
  }

  private ensureSource(source: XRInputSource): string {
    return this.sourceIds.get(source) ?? this.addSource(source);
  }

  private addSource(source: XRInputSource): string {
    const existing = this.sourceIds.get(source);
    if (existing) return existing;
    const id = `xr-source-${++this.nextSourceId}`;
    this.sourceIds.set(source, id);
    this.smoothRays.delete(id);
    this.events.emit("sourceAdded", {
      source: source.hand ? "xr-hand" : "xr-controller",
      id,
    });
    return id;
  }

  private removeSource(source: XRInputSource): void {
    const id = this.sourceIds.get(source);
    if (!id) return;
    this.options.handlePanelRay(new THREE.Ray(), "cancel", id, source.hand ? "hand" : "controller");
    this.sourceIds.delete(source);
    this.smoothRays.delete(id);
    this.panelPressed.delete(id);
    this.pinching.delete(id);
    this.gripping.delete(id);
    this.pinchCenters.delete(id);
    this.gripCenters.delete(id);
    this.pairedGestureSeparation = null;
    this.pairedGestureType = null;
    this.events.emit("sourceRemoved", {
      source: source.hand ? "xr-hand" : "xr-controller",
      id,
    });
  }

  private requestNextFrame(): void {
    if (!this.session || this.disposed) return;
    this.animationFrame = this.session.requestAnimationFrame((_time, frame) => {
      if (this.session !== null) this.update(frame);
      this.requestNextFrame();
    });
  }

  private detachSession(): void {
    const previous = this.session;
    if (!previous) return;
    if (this.animationFrame !== null) previous.cancelAnimationFrame(this.animationFrame);
    previous.removeEventListener("inputsourceschange", this.onInputSourcesChange);
    previous.removeEventListener("selectstart", this.onSelectStart);
    previous.removeEventListener("select", this.onSelect);
    previous.removeEventListener("selectend", this.onSelectEnd);
    previous.removeEventListener("end", this.onSessionEnd);
    for (const source of this.sourceIds.keys()) this.removeSource(source);
    this.session = null;
    this.referenceSpace = null;
    this.animationFrame = null;
    this.pairedGestureSeparation = null;
    this.pairedGestureType = null;
  }
}
