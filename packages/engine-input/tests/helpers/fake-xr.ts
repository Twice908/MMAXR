import { vi } from "vitest";

/** Minimal stand-ins for WebXR objects, mutable so a test can change them between frames. */

export interface FakeButton {
  pressed: boolean;
  value: number;
}

export interface FakePose {
  position: { x: number; y: number; z: number };
  orientation: { x: number; y: number; z: number; w: number };
}

export interface FakeSource {
  readonly source: XRInputSource;
  /** Gamepad buttons; empty for sources created without a gamepad. */
  readonly buttons: FakeButton[];
  readonly axes: number[];
  /** Target ray pose; set to null to simulate tracking loss. */
  rayPose: FakePose | null;
  gripPose: FakePose | null;
  /** Joint positions for hands; a null entry means that joint is untracked. */
  readonly joints: Map<string, { x: number; y: number; z: number } | null>;
  /** Haptic pulses received, as [intensity, durationMs]. */
  readonly pulses: [number, number][];
}

export interface FakeSourceOptions {
  readonly handedness?: XRHandedness;
  readonly targetRayMode?: XRTargetRayMode;
  readonly gamepad?: boolean;
  readonly profiles?: readonly string[];
  readonly haptics?: boolean;
}

const identity = { x: 0, y: 0, z: 0, w: 1 };

export function makePose(x = 0, y = 0, z = 0): FakePose {
  return { position: { x, y, z }, orientation: { ...identity } };
}

function makeButtons(): FakeButton[] {
  return Array.from({ length: 7 }, () => ({ pressed: false, value: 0 }));
}

const HAND_JOINT_NAMES = [
  "wrist", "thumb-metacarpal", "thumb-phalanx-proximal", "thumb-phalanx-distal", "thumb-tip",
  "index-finger-metacarpal", "index-finger-phalanx-proximal", "index-finger-phalanx-intermediate",
  "index-finger-phalanx-distal", "index-finger-tip",
];

const spaceOwners = new WeakMap<object, { fake: FakeSource; joint: string | null; grip: boolean }>();

function makeSource(options: FakeSourceOptions, hand: boolean): FakeSource {
  const fake: FakeSource = {
    source: undefined as unknown as XRInputSource,
    buttons: options.gamepad === false ? [] : makeButtons(),
    axes: options.gamepad === false ? [] : [0, 0, 0, 0],
    rayPose: makePose(),
    gripPose: makePose(),
    joints: new Map(),
    pulses: [],
  };
  const raySpace = {} as XRSpace;
  const gripSpace = {} as XRSpace;
  const jointSpaces = new Map<string, XRJointSpace>();
  const handApi = hand
    ? {
      get(name: string) {
        let space = jointSpaces.get(name);
        if (!space) {
          space = {} as XRJointSpace;
          jointSpaces.set(name, space);
          spaceOwners.set(space, { fake, joint: name, grip: false });
        }
        return space;
      },
    }
    : null;
  const gamepad = options.gamepad === false
    ? null
    : {
      buttons: fake.buttons,
      axes: fake.axes,
      ...(options.haptics
        ? {
          hapticActuators: [{
            pulse: vi.fn((intensity: number, duration: number) => {
              fake.pulses.push([intensity, duration]);
              return Promise.resolve(true);
            }),
          }],
        }
        : {}),
    };
  Object.assign(fake, {
    source: {
      handedness: options.handedness ?? "right",
      targetRayMode: options.targetRayMode ?? "tracked-pointer",
      targetRaySpace: raySpace,
      gripSpace,
      hand: handApi,
      gamepad,
      profiles: options.profiles ?? [],
    } as unknown as XRInputSource,
  });
  spaceOwners.set(raySpace, { fake, joint: null, grip: false });
  spaceOwners.set(gripSpace, { fake, joint: null, grip: true });
  return fake;
}

/** A tracked controller with a trigger, squeeze, thumbstick, A/X and B/Y. */
export function makeController(options: FakeSourceOptions = {}): FakeSource {
  return makeSource(options, false);
}

/** A tracked hand with thumb and index joints; use {@link setPinchGap} to move the fingertips. */
export function makeHand(options: FakeSourceOptions = {}): FakeSource {
  const fake = makeSource({ gamepad: false, ...options }, true);
  setPinchGap(fake, 0.08);
  return fake;
}

/** Place thumb and index tips `gap` metres apart; wrist and index knuckle are 8 cm apart. */
export function setPinchGap(hand: FakeSource, gap: number): void {
  for (const name of HAND_JOINT_NAMES) hand.joints.set(name, { x: 0, y: 0, z: 0 });
  hand.joints.set("thumb-tip", { x: 0, y: 0, z: 0 });
  hand.joints.set("index-finger-tip", { x: gap, y: 0, z: 0 });
  hand.joints.set("wrist", { x: 0, y: -0.08, z: 0 });
  hand.joints.set("index-finger-metacarpal", { x: 0, y: 0, z: 0 });
}

export function press(source: FakeSource, index: number, pressed = true): void {
  const button = source.buttons[index];
  if (!button) throw new Error(`No button ${index}`);
  button.pressed = pressed;
  button.value = pressed ? 1 : 0;
}

/** Build an XRFrame that reads poses from the fake sources' current state. */
export function makeFrame(): XRFrame {
  return {
    getPose(space: XRSpace) {
      const owner = spaceOwners.get(space);
      if (!owner) return null;
      const pose = owner.grip ? owner.fake.gripPose : owner.fake.rayPose;
      return pose ? { transform: pose } : null;
    },
    getJointPose(space: XRJointSpace) {
      const owner = spaceOwners.get(space);
      const position = owner?.joint ? owner.fake.joints.get(owner.joint) : null;
      return position ? { transform: { position }, radius: 0.008 } : null;
    },
  } as unknown as XRFrame;
}

function arrayLike<T>(items: readonly T[]): ArrayLike<T> & Iterable<T> {
  return Object.assign({ ...items }, {
    length: items.length,
    [Symbol.iterator]: function* () {
      yield* items;
    },
  });
}

export interface FakeSession {
  readonly session: XRSession;
  sources: XRInputSource[];
  /** Replace the input source list and fire `inputsourceschange`. */
  change(added: readonly FakeSource[], removed: readonly FakeSource[]): void;
  /** Fire a select/squeeze event for a source, with a frame like the browser provides. */
  fire(type: "selectstart" | "select" | "selectend" | "squeezestart" | "squeezeend", source: FakeSource): void;
  listenerCount(): number;
}

/** Make a session holding `initial` sources. */
export function makeSession(initial: readonly FakeSource[] = []): FakeSession {
  const target = new EventTarget();
  let listeners = 0;
  const original = {
    add: target.addEventListener.bind(target),
    remove: target.removeEventListener.bind(target),
  };
  const fake: FakeSession = {
    session: undefined as unknown as XRSession,
    sources: initial.map((entry) => entry.source),
    change(added, removed) {
      const gone = new Set(removed.map((entry) => entry.source));
      fake.sources = [...fake.sources.filter((source) => !gone.has(source)), ...added.map((entry) => entry.source)];
      target.dispatchEvent(Object.assign(new Event("inputsourceschange"), {
        added: arrayLike(added.map((entry) => entry.source)),
        removed: arrayLike(removed.map((entry) => entry.source)),
      }));
    },
    fire(type, source) {
      target.dispatchEvent(Object.assign(new Event(type), {
        inputSource: source.source,
        frame: makeFrame(),
      }));
    },
    listenerCount: () => listeners,
  };
  const session = Object.assign(target, {
    addEventListener: (type: string, listener: EventListenerOrEventListenerObject, options?: AddEventListenerOptions | boolean) => {
      listeners += 1;
      original.add(type, listener, options);
    },
    removeEventListener: (type: string, listener: EventListenerOrEventListenerObject, options?: EventListenerOptions | boolean) => {
      listeners -= 1;
      original.remove(type, listener, options);
    },
  }) as unknown as XRSession;
  Object.defineProperty(session, "inputSources", { get: () => arrayLike(fake.sources) });
  Object.assign(fake, { session });
  return fake;
}
