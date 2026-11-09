import * as THREE from "three";
import { ActionDispatcher } from "./action-dispatcher.js";
import { InputEventBus } from "./event-bus.js";
import type { Handedness, InputEventMap, PickFunction } from "./types.js";
import type { InputAction } from "./types.js";
import {
  EdgeChannel,
  XR_STANDARD_BUTTON,
  readButton,
  readThumbstick,
  type Edge,
} from "./xr-buttons.js";
import {
  PinchDetector,
  distance3,
  midpoint3,
  type Point3,
} from "./xr-pinch.js";

/** Whether a source is a tracked controller or an articulated hand. */
export type XrPointerKind = "controller" | "hand";

type PanelPhase = "move" | "down" | "up" | "cancel";
type PressKind = "select" | "squeeze";
type SelectOwner = "system" | "joint";

/** Frames a source may lose its pose during a press before the press is cancelled. */
const MAX_MISSED_FRAMES = 12;
/** Minimum gap between hover haptic ticks, in milliseconds. */
const HOVER_HAPTIC_INTERVAL_MS = 120;
/** Frame rate that the fallback `rotate` action speed was tuned for. */
const REFERENCE_FRAME_RATE = 72;

/** Per-frame facts about one pointing source, for ray/reticle visuals. */
export interface XrPointerFrameInfo {
  readonly id: string;
  readonly inputSource: XRInputSource;
  readonly kind: XrPointerKind;
  readonly handedness: Handedness;
  /** True when the target ray had a pose this frame. */
  readonly tracked: boolean;
  /** Distance along the ray to the nearest panel or control hit, if any. */
  readonly hitDistance: number | undefined;
  /** True while a select or squeeze press is active. */
  readonly pressed: boolean;
}

/** PII-free snapshot of one source, shown in the development diagnostics report. */
export interface XrInputDiagnostics {
  readonly id: string;
  readonly kind: XrPointerKind;
  readonly handedness: Handedness;
  readonly targetRayMode: string;
  readonly profiles: readonly string[];
  readonly hasGamepad: boolean;
  readonly rayTracked: boolean;
  readonly select: boolean;
  readonly squeeze: boolean;
  readonly press: PressKind | null;
  readonly capturedByPanel: boolean;
  readonly pinchDistanceMm: number | null;
  /** True once this source has reported a pinch/trigger through events or its gamepad. */
  readonly systemSelectSeen: boolean;
  readonly selectEvents: number;
  readonly squeezeEvents: number;
  /** Indices of gamepad buttons currently pressed. */
  readonly pressedButtons: readonly number[];
}

/** Dependencies and callbacks for {@link XrInputRig}. */
export interface XrInputRigOptions {
  readonly dispatch: (action: InputAction) => void;
  /** Pick a world object along a ray; used for atom hover/select when no panel is hit. */
  readonly pick: PickFunction;
  /**
   * Route a ray to spatial panels and controls. Returns true when a panel or control
   * consumed it. `gestureMode` is `pan` while a squeeze is held, otherwise `rotate`.
   */
  readonly handlePanelRay: (
    ray: THREE.Ray,
    phase: PanelPhase,
    sourceId: string,
    source: XrPointerKind,
    gestureMode?: "rotate" | "pan",
    zoomDelta?: number,
  ) => boolean;
  /**
   * Handle a thumbstick reading (deadzone applied, positive y is down). `deltaSeconds`
   * is the frame time, so callers can stay frame-rate independent. Return true when consumed.
   */
  readonly handleThumbstick?: (
    axes: { x: number; y: number },
    sourceId: string,
    handedness: Handedness,
    deltaSeconds: number,
  ) => boolean;
  /** The reference space the scene is rendered in; rays must be read in the same space. */
  readonly getReferenceSpace: () => XRReferenceSpace | null;
  /** Command sent with the `confirm` action when A/X is pressed away from a panel. */
  readonly primaryCommand?: string;
  /** Last panel/control hit distance for a source id, used to size the visual ray. */
  readonly getHitDistance?: (sourceId: string) => number | undefined;
  /** Called once per frame per pointing source after input has been routed. */
  readonly onPointerFrame?: (info: XrPointerFrameInfo) => void;
  readonly events?: InputEventBus;
}

interface PressState {
  readonly kind: PressKind;
  readonly captured: boolean;
}

interface HapticActuatorLike {
  pulse?: (value: number, durationMs: number) => unknown;
  playEffect?: (
    type: string,
    params: { duration: number; strongMagnitude: number; weakMagnitude: number },
  ) => unknown;
}

interface HapticGamepad {
  readonly hapticActuators?: readonly HapticActuatorLike[];
  readonly vibrationActuator?: HapticActuatorLike;
}

/** Mutable per-source bookkeeping. */
class SourceState {
  lastRay: THREE.Ray | null = null;
  missedFrames = 0;
  press: PressState | null = null;
  selectActive = false;
  selectOwner: SelectOwner | null = null;
  squeezeActive = false;
  systemSelectSeen = false;
  overPanel = false;
  lastHoverPulseMs = Number.NEGATIVE_INFINITY;
  center: Point3 | null = null;
  pinchDistance: number | null = null;
  selectEvents = 0;
  squeezeEvents = 0;
  readonly selectPoll = new EdgeChannel();
  readonly squeezePoll = new EdgeChannel();
  readonly primaryPoll = new EdgeChannel();
  readonly secondaryPoll = new EdgeChannel();
  readonly pinch = new PinchDetector();

  constructor(
    readonly id: string,
    readonly source: XRInputSource,
    readonly kind: XrPointerKind,
    readonly handedness: Handedness,
  ) {}
}

function handednessOf(source: XRInputSource): Handedness {
  return source.handedness === "left" || source.handedness === "right" ? source.handedness : "none";
}

/**
 * Turns live WebXR input sources (Meta Quest controllers and hands, plus phone AR taps)
 * into panel ray events and the engine's action vocabulary.
 *
 * Signals are merged per source: `selectstart`/`selectend` events and gamepad polling
 * both report edges into one state machine, and joint-distance pinch is used only for a
 * hand that never reports a pinch any other way. The rig does not own the XR session
 * loop; the renderer calls {@link XrInputRig.update} once per frame.
 */
export class XrInputRig {
  private readonly events: InputEventBus;
  private readonly dispatch: ActionDispatcher;
  private readonly states = new Map<XRInputSource, SourceState>();
  private session: XRSession | null = null;
  private nextSourceId = 0;
  private lastTimeMs: number | null = null;
  private frameCount = 0;
  private pairedSeparation: number | null = null;
  private pairedKind: XrPointerKind | null = null;
  private disposed = false;

  constructor(private readonly options: XrInputRigOptions) {
    this.events = options.events ?? new InputEventBus();
    this.dispatch = new ActionDispatcher(options.dispatch, this.events);
  }

  /** Subscribe to source and action events. Returns an unsubscribe function. */
  on<K extends keyof InputEventMap>(type: K, listener: (event: InputEventMap[K]) => void): () => void {
    return this.events.on(type, listener);
  }

  /** Attach to a live session, or detach when passed null. Synchronous: no reference space is requested. */
  setSession(session: XRSession | null): void {
    this.detachSession();
    if (this.disposed || !session) return;
    this.session = session;
    session.addEventListener("inputsourceschange", this.onInputSourcesChange);
    session.addEventListener("selectstart", this.onSelectStart);
    session.addEventListener("select", this.onSelect);
    session.addEventListener("selectend", this.onSelectEnd);
    session.addEventListener("squeezestart", this.onSqueezeStart);
    session.addEventListener("squeezeend", this.onSqueezeEnd);
    session.addEventListener("end", this.onSessionEnd, { once: true });
    for (const source of session.inputSources) this.addSource(source);
  }

  /**
   * Read every input source for this frame and route it. Call from the renderer's XR
   * animation loop so rays share the frame and reference space used for rendering.
   */
  update(frame: XRFrame, timeMs = 0): void {
    const session = this.session;
    const referenceSpace = this.options.getReferenceSpace();
    if (this.disposed || !session || !referenceSpace) return;
    this.syncSources(session);
    const deltaSeconds = this.lastTimeMs === null
      ? 0
      : Math.min(0.1, Math.max(0, (timeMs - this.lastTimeMs) / 1000));
    this.lastTimeMs = timeMs;
    this.frameCount += 1;

    const active: SourceState[] = [];
    for (const source of session.inputSources) {
      const state = this.states.get(source);
      if (!state || source.targetRayMode === "transient-pointer") continue;
      this.readFrame(state, frame, referenceSpace);
      active.push(state);
    }

    const zoomDelta = this.readPairedZoomDelta(active);
    let zoomDelivered = false;
    for (const state of active) {
      const wantsZoom = zoomDelta !== null && !zoomDelivered && state.press?.captured === true;
      if (wantsZoom) zoomDelivered = true;
      this.routeMove(state, wantsZoom ? zoomDelta : undefined, timeMs);
      this.routeThumbstick(state, deltaSeconds);
      this.options.onPointerFrame?.({
        id: state.id,
        inputSource: state.source,
        kind: state.kind,
        handedness: state.handedness,
        tracked: state.missedFrames === 0,
        hitDistance: this.options.getHitDistance?.(state.id),
        pressed: state.press !== null,
      });
    }
  }

  /** Describe each current source for the development diagnostics report. */
  getDiagnostics(): readonly XrInputDiagnostics[] {
    const result: XrInputDiagnostics[] = [];
    for (const state of this.states.values()) {
      const buttons = state.source.gamepad?.buttons;
      const pressedButtons: number[] = [];
      if (buttons) {
        for (let index = 0; index < buttons.length; index += 1) {
          if (buttons[index]?.pressed) pressedButtons.push(index);
        }
      }
      result.push({
        id: state.id,
        kind: state.kind,
        handedness: state.handedness,
        targetRayMode: state.source.targetRayMode,
        profiles: Array.from(state.source.profiles ?? []),
        hasGamepad: state.source.gamepad != null,
        rayTracked: state.missedFrames === 0 && state.lastRay !== null,
        select: state.selectActive,
        squeeze: state.squeezeActive,
        press: state.press?.kind ?? null,
        capturedByPanel: state.press?.captured ?? false,
        pinchDistanceMm: state.pinchDistance === null ? null : Math.round(state.pinchDistance * 1000),
        systemSelectSeen: state.systemSelectSeen,
        selectEvents: state.selectEvents,
        squeezeEvents: state.squeezeEvents,
        pressedButtons,
      });
    }
    return result;
  }

  /** Number of XR frames this rig has processed in the current session. */
  getFrameCount(): number {
    return this.frameCount;
  }

  /** Detach from the session and release every source. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.detachSession();
  }

  // --- session events ------------------------------------------------------

  private readonly onInputSourcesChange = (event: Event): void => {
    const change = event as XRInputSourcesChangeEvent;
    for (const source of change.removed) this.removeSource(source);
    for (const source of change.added) this.addSource(source);
    if (this.session) this.syncSources(this.session);
  };

  private readonly onSelectStart = (event: Event): void => {
    const { inputSource, frame } = event as XRInputSourceEvent;
    if (inputSource.targetRayMode === "transient-pointer") return;
    const state = this.ensureState(inputSource);
    state.selectEvents += 1;
    this.applySelect(state, "down", "system", this.eventRay(state, frame));
  };

  private readonly onSelect = (event: Event): void => {
    const { inputSource, frame } = event as XRInputSourceEvent;
    if (inputSource.targetRayMode !== "transient-pointer") return;
    // A phone-AR tap: the source exists only for the duration of one gesture.
    const state = this.ensureState(inputSource);
    const ray = this.eventRay(state, frame);
    if (ray) {
      const panelDown = this.options.handlePanelRay(ray, "down", state.id, state.kind, "rotate");
      const panelUp = this.options.handlePanelRay(ray, "up", state.id, state.kind, "rotate");
      if (!panelDown && !panelUp) this.selectAtom(state, ray);
    }
    this.removeSource(inputSource);
  };

  private readonly onSelectEnd = (event: Event): void => {
    const { inputSource, frame } = event as XRInputSourceEvent;
    if (inputSource.targetRayMode === "transient-pointer") return;
    const state = this.ensureState(inputSource);
    this.applySelect(state, "up", "system", this.eventRay(state, frame));
  };

  private readonly onSqueezeStart = (event: Event): void => {
    const { inputSource, frame } = event as XRInputSourceEvent;
    if (inputSource.targetRayMode === "transient-pointer") return;
    const state = this.ensureState(inputSource);
    state.squeezeEvents += 1;
    this.applySqueeze(state, "down", this.eventRay(state, frame));
  };

  private readonly onSqueezeEnd = (event: Event): void => {
    const { inputSource, frame } = event as XRInputSourceEvent;
    if (inputSource.targetRayMode === "transient-pointer") return;
    const state = this.ensureState(inputSource);
    this.applySqueeze(state, "up", this.eventRay(state, frame));
  };

  private readonly onSessionEnd = (): void => {
    this.detachSession();
  };

  // --- per-frame reading ---------------------------------------------------

  private readFrame(state: SourceState, frame: XRFrame, referenceSpace: XRReferenceSpace): void {
    const ray = this.readRay(state.source, frame, referenceSpace);
    if (ray) {
      state.lastRay = ray;
      state.missedFrames = 0;
    } else {
      state.missedFrames += 1;
    }
    state.center = null;
    if (state.kind === "hand") this.readHand(state, frame, referenceSpace, ray);
    else this.readControllerCenter(state, frame, referenceSpace);
    this.pollGamepad(state, ray ?? state.lastRay);
    if (state.press && state.missedFrames >= MAX_MISSED_FRAMES) this.cancelPress(state);
  }

  private readRay(source: XRInputSource, frame: XRFrame, referenceSpace: XRReferenceSpace): THREE.Ray | null {
    const pose = frame.getPose(source.targetRaySpace, referenceSpace);
    if (!pose) return null;
    const { position, orientation } = pose.transform;
    const origin = new THREE.Vector3(position.x, position.y, position.z);
    const direction = new THREE.Vector3(0, 0, -1)
      .applyQuaternion(new THREE.Quaternion(orientation.x, orientation.y, orientation.z, orientation.w))
      .normalize();
    return new THREE.Ray(origin, direction);
  }

  /** Ray for a session event: the event frame when present, else the last good ray. */
  private eventRay(state: SourceState, frame: XRFrame | undefined): THREE.Ray | null {
    const referenceSpace = this.options.getReferenceSpace();
    if (frame && referenceSpace) {
      const ray = this.readRay(state.source, frame, referenceSpace);
      if (ray) {
        state.lastRay = ray;
        state.missedFrames = 0;
        return ray;
      }
    }
    return state.lastRay;
  }

  private readControllerCenter(state: SourceState, frame: XRFrame, referenceSpace: XRReferenceSpace): void {
    const gripSpace = state.source.gripSpace;
    if (!gripSpace) return;
    const pose = frame.getPose(gripSpace, referenceSpace);
    if (pose) {
      const { x, y, z } = pose.transform.position;
      state.center = { x, y, z };
    }
  }

  private readHand(
    state: SourceState,
    frame: XRFrame,
    referenceSpace: XRReferenceSpace,
    ray: THREE.Ray | null,
  ): void {
    const hand = state.source.hand;
    const getJointPose = frame.getJointPose?.bind(frame);
    if (!hand || !getJointPose) return;
    const joint = (name: XRHandJoint): Point3 | undefined => {
      const space = hand.get(name);
      const pose = space ? getJointPose(space, referenceSpace) : null;
      if (!pose) return undefined;
      const { x, y, z } = pose.transform.position;
      return { x, y, z };
    };
    const thumbTip = joint("thumb-tip");
    const indexTip = joint("index-finger-tip");
    if (!thumbTip || !indexTip) return;
    state.center = midpoint3(thumbTip, indexTip);
    state.pinchDistance = distance3(thumbTip, indexTip);
    if (state.systemSelectSeen) return;
    const edge = state.pinch.update({
      thumbTip,
      indexTip,
      wrist: joint("wrist"),
      indexMetacarpal: joint("index-finger-metacarpal"),
    });
    this.applySelect(state, edge, "joint", ray ?? state.lastRay);
  }

  private pollGamepad(state: SourceState, ray: THREE.Ray | null): void {
    const gamepad = state.source.gamepad;
    if (!gamepad) return;
    const select = state.selectPoll.poll(
      readButton(gamepad, XR_STANDARD_BUTTON.trigger, state.selectPoll.isDown),
    );
    this.applySelect(state, select, "system", ray);
    // A hand's emulated gamepad carries the pinch only; other buttons belong to controllers.
    if (state.kind !== "controller") return;
    const squeeze = state.squeezePoll.poll(
      readButton(gamepad, XR_STANDARD_BUTTON.squeeze, state.squeezePoll.isDown),
    );
    this.applySqueeze(state, squeeze, ray);
    const primary = state.primaryPoll.poll(
      readButton(gamepad, XR_STANDARD_BUTTON.primary, state.primaryPoll.isDown),
    );
    if (primary === "down") this.onPrimary(state, ray);
    const secondary = state.secondaryPoll.poll(
      readButton(gamepad, XR_STANDARD_BUTTON.secondary, state.secondaryPoll.isDown),
    );
    if (secondary === "down") this.dispatch.emit({ type: "back", payload: { source: "xr-controller" } });
  }

  // --- press state machine -------------------------------------------------

  private applySelect(state: SourceState, edge: Edge, owner: SelectOwner, ray: THREE.Ray | null): void {
    if (!edge) return;
    if (edge === "down") {
      if (owner === "system") state.systemSelectSeen = true;
      if (state.selectActive) {
        // The system pinch arrived while a joint-detected pinch was already held.
        if (owner === "system" && state.selectOwner === "joint") state.selectOwner = "system";
        return;
      }
      state.selectActive = true;
      state.selectOwner = owner;
      this.beginPress(state, "select", ray);
    } else {
      if (!state.selectActive || state.selectOwner !== owner) return;
      state.selectActive = false;
      state.selectOwner = null;
      this.endPress(state, "select", ray);
    }
  }

  private applySqueeze(state: SourceState, edge: Edge, ray: THREE.Ray | null): void {
    if (!edge) return;
    if (edge === "down") {
      if (state.squeezeActive) return;
      state.squeezeActive = true;
      this.beginPress(state, "squeeze", ray);
    } else {
      if (!state.squeezeActive) return;
      state.squeezeActive = false;
      this.endPress(state, "squeeze", ray);
    }
  }

  private beginPress(state: SourceState, kind: PressKind, ray: THREE.Ray | null): void {
    if (state.press) return; // One press per source; a second button is ignored until the first ends.
    const mode = kind === "squeeze" ? "pan" : "rotate";
    const captured = ray ? this.options.handlePanelRay(ray, "down", state.id, state.kind, mode) : false;
    state.press = { kind, captured };
    if (captured) this.pulse(state, 0.25, 20);
  }

  private endPress(state: SourceState, kind: PressKind, ray: THREE.Ray | null): void {
    const press = state.press;
    if (!press || press.kind !== kind) return;
    state.press = null;
    const mode = kind === "squeeze" ? "pan" : "rotate";
    if (ray) this.options.handlePanelRay(ray, "up", state.id, state.kind, mode);
    else this.options.handlePanelRay(new THREE.Ray(), "cancel", state.id, state.kind, mode);
    if (press.captured) {
      this.pulse(state, 0.5, 30);
      return;
    }
    if (kind === "select" && ray) this.selectAtom(state, ray);
  }

  private cancelPress(state: SourceState): void {
    const press = state.press;
    state.press = null;
    state.selectActive = false;
    state.selectOwner = null;
    state.squeezeActive = false;
    state.pinch.reset();
    if (press) {
      const mode = press.kind === "squeeze" ? "pan" : "rotate";
      this.options.handlePanelRay(new THREE.Ray(), "cancel", state.id, state.kind, mode);
    }
  }

  private onPrimary(state: SourceState, ray: THREE.Ray | null): void {
    // A/X clicks whatever a panel ray is on; otherwise it confirms the lesson step.
    if (ray && this.options.handlePanelRay(ray, "down", state.id, state.kind, "rotate")) {
      this.options.handlePanelRay(ray, "up", state.id, state.kind, "rotate");
      this.pulse(state, 0.5, 30);
      return;
    }
    this.dispatch.emit({
      type: "confirm",
      payload: {
        source: "xr-controller",
        ...(this.options.primaryCommand ? { command: this.options.primaryCommand } : {}),
      },
    });
  }

  private selectAtom(state: SourceState, ray: THREE.Ray): void {
    const source = state.kind === "hand" ? "xr-hand" : "xr-controller";
    const target = this.options.pick({
      origin: ray.origin.clone(),
      direction: ray.direction.clone(),
      source,
      handedness: state.handedness,
    });
    if (target) this.dispatch.emit({ type: "select", payload: { source, target: target.target } });
  }

  // --- per-frame routing ---------------------------------------------------

  private routeMove(state: SourceState, zoomDelta: number | undefined, timeMs: number): void {
    const ray = state.missedFrames === 0 ? state.lastRay : null;
    if (!ray) return;
    const mode = state.press?.kind === "squeeze" ? "pan" : "rotate";
    const consumed = this.options.handlePanelRay(ray, "move", state.id, state.kind, mode, zoomDelta);
    if (consumed) {
      if (!state.overPanel && !state.press && timeMs - state.lastHoverPulseMs >= HOVER_HAPTIC_INTERVAL_MS) {
        state.lastHoverPulseMs = timeMs;
        this.pulse(state, 0.1, 10);
      }
      state.overPanel = true;
      return;
    }
    state.overPanel = false;
    if (state.press) return;
    const source = state.kind === "hand" ? "xr-hand" : "xr-controller";
    const target = this.options.pick({
      origin: ray.origin.clone(),
      direction: ray.direction.clone(),
      source,
      handedness: state.handedness,
    });
    if (target) this.dispatch.emit({ type: "hover", payload: { source, target: target.target } });
  }

  private routeThumbstick(state: SourceState, deltaSeconds: number): void {
    if (state.kind !== "controller" || state.press) return;
    const axes = readThumbstick(state.source.gamepad);
    if (axes.x === 0 && axes.y === 0) return;
    const consumed = this.options.handleThumbstick?.(axes, state.id, state.handedness, deltaSeconds) ?? false;
    if (consumed) return;
    const scale = deltaSeconds * REFERENCE_FRAME_RATE;
    this.dispatch.emit({
      type: "rotate",
      payload: { deltaX: axes.x * 10 * scale, deltaY: -axes.y * 10 * scale, source: "xr-controller" },
    });
  }

  private readPairedZoomDelta(active: readonly SourceState[]): number | null {
    const pressing = active.filter((state) => state.press?.captured === true);
    const centreOf = (state: SourceState): Point3 | null => state.center ?? state.lastRay?.origin ?? null;
    const group = (["hand", "controller"] as const)
      .map((kind) => pressing.filter((state) => state.kind === kind && centreOf(state) !== null))
      .find((candidates) => candidates.length >= 2);
    if (!group) {
      this.pairedSeparation = null;
      this.pairedKind = null;
      return null;
    }
    const first = group[0]!;
    const second = group[1]!;
    const separation = distance3(centreOf(first)!, centreOf(second)!);
    const previous = this.pairedSeparation;
    const previousKind = this.pairedKind;
    this.pairedSeparation = separation;
    this.pairedKind = first.kind;
    return previousKind !== first.kind || previous === null ? 0 : separation - previous;
  }

  private pulse(state: SourceState, intensity: number, durationMs: number): void {
    if (state.kind !== "controller") return;
    const gamepad = state.source.gamepad as unknown as HapticGamepad | null;
    const actuator = gamepad?.hapticActuators?.[0] ?? gamepad?.vibrationActuator;
    if (!actuator) return;
    try {
      if (typeof actuator.pulse === "function") {
        void Promise.resolve(actuator.pulse(intensity, durationMs)).catch(() => undefined);
      } else if (typeof actuator.playEffect === "function") {
        void Promise.resolve(actuator.playEffect("dual-rumble", {
          duration: durationMs,
          strongMagnitude: intensity,
          weakMagnitude: intensity,
        })).catch(() => undefined);
      }
    } catch {
      // Haptics are optional; a failing actuator must never affect input.
    }
  }

  // --- source bookkeeping --------------------------------------------------

  private syncSources(session: XRSession): void {
    const current = new Set<XRInputSource>(session.inputSources);
    for (const source of Array.from(this.states.keys())) {
      if (!current.has(source)) this.removeSource(source);
    }
    for (const source of current) this.addSource(source);
  }

  private ensureState(source: XRInputSource): SourceState {
    return this.states.get(source) ?? this.addSource(source);
  }

  private addSource(source: XRInputSource): SourceState {
    const existing = this.states.get(source);
    if (existing) return existing;
    const kind: XrPointerKind = source.hand ? "hand" : "controller";
    const handedness = handednessOf(source);
    const suffix = handedness === "none" ? "" : `-${handedness}`;
    const state = new SourceState(`xr-source${suffix}-${++this.nextSourceId}`, source, kind, handedness);
    this.states.set(source, state);
    this.events.emit("sourceAdded", {
      source: kind === "hand" ? "xr-hand" : "xr-controller",
      id: state.id,
    });
    return state;
  }

  private removeSource(source: XRInputSource): void {
    const state = this.states.get(source);
    if (!state) return;
    this.options.handlePanelRay(new THREE.Ray(), "cancel", state.id, state.kind);
    this.states.delete(source);
    this.pairedSeparation = null;
    this.pairedKind = null;
    this.events.emit("sourceRemoved", {
      source: state.kind === "hand" ? "xr-hand" : "xr-controller",
      id: state.id,
    });
  }

  private detachSession(): void {
    const previous = this.session;
    if (!previous) return;
    previous.removeEventListener("inputsourceschange", this.onInputSourcesChange);
    previous.removeEventListener("selectstart", this.onSelectStart);
    previous.removeEventListener("select", this.onSelect);
    previous.removeEventListener("selectend", this.onSelectEnd);
    previous.removeEventListener("squeezestart", this.onSqueezeStart);
    previous.removeEventListener("squeezeend", this.onSqueezeEnd);
    previous.removeEventListener("end", this.onSessionEnd);
    for (const source of Array.from(this.states.keys())) this.removeSource(source);
    this.session = null;
    this.lastTimeMs = null;
    this.frameCount = 0;
    this.pairedSeparation = null;
    this.pairedKind = null;
  }
}

/** Format source diagnostics as plain text lines for the development report. */
export function formatXrInputDiagnostics(sources: readonly XrInputDiagnostics[]): string[] {
  if (sources.length === 0) return ["Input sources: none"];
  return sources.flatMap((source) => {
    const name = `${source.kind}${source.handedness === "none" ? "" : `/${source.handedness}`}`;
    const pinch = source.pinchDistanceMm === null ? "" : `, pinch gap ${source.pinchDistanceMm} mm`;
    return [
      `Input ${source.id} (${name}): ray ${source.targetRayMode}, ${source.rayTracked ? "tracked" : "NO POSE"}${pinch}`,
      `  select ${source.select ? "ON" : "off"}, squeeze ${source.squeeze ? "ON" : "off"}, press ${source.press ?? "none"}${source.capturedByPanel ? " (panel)" : ""}`,
      `  gamepad ${source.hasGamepad ? `buttons [${source.pressedButtons.join(",")}]` : "none"}, events select ${source.selectEvents} / squeeze ${source.squeezeEvents}, system select ${source.systemSelectSeen ? "seen" : "not seen"}`,
      `  profiles: ${source.profiles.length > 0 ? source.profiles.join(", ") : "none"}`,
    ];
  });
}
