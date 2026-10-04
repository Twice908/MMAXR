import * as THREE from "three";

export function makeFakeRenderer(session: any = null, referenceSpace: any = {}): any {
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

export function makeXrSource(
  handedness: "left" | "right" | "none",
  hand: Map<string, object> | null = null,
): any {
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
): any {
  return {
    transform: {
      position: { x, y, z },
    },
    radius,
  };
}

export function makeHandJointMap(): Map<string, object> {
  return new Map([
    ["wrist", {}],
    ["thumb-metacarpal", {}],
    ["thumb-phalanx-proximal", {}],
    ["thumb-phalanx-distal", {}],
    ["thumb-tip", {}],
    ["index-finger-metacarpal", {}],
    ["index-finger-phalanx-proximal", {}],
    ["index-finger-phalanx-intermediate", {}],
    ["index-finger-phalanx-distal", {}],
    ["index-finger-tip", {}],
    ["middle-finger-metacarpal", {}],
    ["middle-finger-phalanx-proximal", {}],
    ["middle-finger-phalanx-intermediate", {}],
    ["middle-finger-phalanx-distal", {}],
    ["middle-finger-tip", {}],
    ["ring-finger-metacarpal", {}],
    ["ring-finger-phalanx-proximal", {}],
    ["ring-finger-phalanx-intermediate", {}],
    ["ring-finger-phalanx-distal", {}],
    ["ring-finger-tip", {}],
    ["pinky-finger-metacarpal", {}],
    ["pinky-finger-phalanx-proximal", {}],
    ["pinky-finger-phalanx-intermediate", {}],
    ["pinky-finger-phalanx-distal", {}],
    ["pinky-finger-tip", {}],
  ]);
}

export function makeFrameFromJointPositions(
  positions: Record<string, [number, number, number]>,
): any {
  return {
    getJointPose: (space: object) => {
      const name = [...Object.entries(positions)].find(([key]) => key === (space as any).__name)?.[0];
      const position = name ? positions[name] : undefined;
      if (!position) return null;
      return makeJointPose(...position);
    },
  };
}

export function makeNamedHandJointMap(): Map<string, any> {
  const hand = makeHandJointMap();
  for (const [name, space] of hand) {
    (space as any).__name = name;
  }
  return hand;
}
