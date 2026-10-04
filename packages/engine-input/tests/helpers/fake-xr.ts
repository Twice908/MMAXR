import * as THREE from "three";
import type { Handedness } from "../../src/types.js";
import { XR_HAND_JOINTS, type XrHandJointName } from "../../src/xr-hand.js";

export interface FakeReferenceSpace {
  readonly isFakeReferenceSpace: true;
}

export interface FakeJointSpace {
  readonly jointName: XrHandJointName;
}

export interface FakeHand {
  get(jointName: string): FakeJointSpace | undefined;
}

export interface FakeXrInputSource {
  readonly handedness: Handedness;
  readonly hand: FakeHand | null;
}

export interface FakeXrSession {
  inputSources: FakeXrInputSource[];
}

export interface FakeVector3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface FakeJointPose {
  readonly transform: { readonly position: FakeVector3Like };
  readonly radius: number;
}

export interface FakeXrFrame {
  getJointPose(
    jointSpace: FakeJointSpace,
    referenceSpace?: FakeReferenceSpace,
  ): FakeJointPose | null;
}

export interface FakeRenderer {
  readonly xr: {
    getSession(): FakeXrSession | null;
    getReferenceSpace(): FakeReferenceSpace | null;
    getController(index: number): THREE.Group;
    getControllerGrip(index: number): THREE.Group;
    getCamera(): THREE.Group;
  };
}

export type FakeControllerEventType =
  | "connected"
  | "disconnected"
  | "selectstart"
  | "selectend"
  | "squeezestart"
  | "squeezeend";

export interface FakeControllerEventData {
  readonly handedness: Handedness;
}

export interface FakeControllerEvent {
  readonly type: FakeControllerEventType;
  readonly data?: FakeControllerEventData;
}

export function makeFakeRenderer(
  session: FakeXrSession | null = null,
  referenceSpace: FakeReferenceSpace = { isFakeReferenceSpace: true },
): FakeRenderer {
  const controllers = [new THREE.Group(), new THREE.Group()];
  const grips = [new THREE.Group(), new THREE.Group()];
  const camera = new THREE.Group();

  return {
    xr: {
      getSession: () => session,
      getReferenceSpace: () => referenceSpace,
      getController: (index: number) => controllers[index]!,
      getControllerGrip: (index: number) => grips[index]!,
      getCamera: () => camera,
    },
  };
}

export function asWebGLRenderer(renderer: FakeRenderer): THREE.WebGLRenderer {
  return renderer as unknown as THREE.WebGLRenderer;
}

export function asXrFrame(frame: FakeXrFrame): XRFrame {
  return frame as unknown as XRFrame;
}

export function dispatchControllerEvent(
  controller: THREE.Group,
  type: FakeControllerEventType,
  data?: FakeControllerEventData,
): void {
  const event: FakeControllerEvent = data ? { type, data } : { type };
  const dispatcher = controller as unknown as {
    dispatchEvent(event: FakeControllerEvent): void;
  };
  dispatcher.dispatchEvent(event);
}

export function makeXrSource(
  handedness: Handedness,
  hand: FakeHand | null = null,
): FakeXrInputSource {
  return {
    handedness,
    hand,
  };
}

export function makeJointPose(
  x: number,
  y: number,
  z: number,
  radius = 0.008,
): FakeJointPose {
  return {
    transform: {
      position: { x, y, z },
    },
    radius,
  };
}

export function makeHandJointMap(): Map<XrHandJointName, FakeJointSpace> {
  return new Map(
    XR_HAND_JOINTS.map((joint) => [joint, { jointName: joint }] as const),
  );
}

export function makeNamedHandJointMap(): Map<XrHandJointName, FakeJointSpace> {
  return makeHandJointMap();
}

export function makeFrameFromJointPositions(
  positions: Readonly<Record<string, readonly [number, number, number]>>,
): FakeXrFrame {
  return {
    getJointPose(jointSpace) {
      const position = positions[jointSpace.jointName];
      if (!position) return null;
      return makeJointPose(position[0], position[1], position[2]);
    },
  };
}