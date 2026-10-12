import * as THREE from "three";
import { spatialTokens } from "../spatial-tokens.js";

const SKY_RADIUS_METERS = 40;
const FLOOR_SIZE_METERS = 24;
const FALLBACK_VIEWER_HEIGHT_METERS = 1.6;
const GRID_SEGMENTS = 32;
const GRID_CELL_SEGMENTS = 4;
const ATOM_RING_RADIUS_METERS = 0.23;

export interface VrEnvironment {
  readonly root: THREE.Group;
  readonly atomRing: THREE.Mesh;
  readonly triangleCount: number;
  readonly disposed: boolean;
  setViewerPosition(position: Readonly<{ x: number; y: number; z: number }>): void;
  setFallbackFloorFromViewer(viewerHeight: number): void;
  dispose(): void;
}

/** Create the still, procedural environment used only by opaque VR sessions. */
export function createVrEnvironment(): VrEnvironment {
  const root = new THREE.Group();
  root.name = "vr-environment";
  root.add(new THREE.HemisphereLight(spatialTokens.surfaceStrong, spatialTokens.inkMuted, 0.45));
  root.add(new THREE.AmbientLight(spatialTokens.surfaceStrong, 0.25));

  const skyGeometry = new THREE.SphereGeometry(SKY_RADIUS_METERS, 24, 12);
  const skyPosition = skyGeometry.getAttribute("position");
  const skyColors = new Float32Array(skyPosition.count * 3);
  const skyTop = new THREE.Color(spatialTokens.accentLilac).lerp(
    new THREE.Color(spatialTokens.surfaceStrong),
    0.78,
  );
  const skyHorizon = new THREE.Color(spatialTokens.surfaceStrong);
  for (let index = 0; index < skyPosition.count; index += 1) {
    const blend = THREE.MathUtils.smoothstep(skyPosition.getY(index) / SKY_RADIUS_METERS, -0.2, 0.65);
    const color = skyHorizon.clone().lerp(skyTop, blend);
    skyColors.set([color.r, color.g, color.b], index * 3);
  }
  skyGeometry.setAttribute("color", new THREE.BufferAttribute(skyColors, 3));
  const skyMaterial = new THREE.MeshBasicMaterial({
    side: THREE.BackSide,
    vertexColors: true,
    depthWrite: false,
    toneMapped: false,
  });
  const sky = new THREE.Mesh(skyGeometry, skyMaterial);
  sky.name = "vr-gradient-sky";
  sky.renderOrder = -1;
  root.add(sky);

  const floorGeometry = new THREE.PlaneGeometry(
    FLOOR_SIZE_METERS,
    FLOOR_SIZE_METERS,
    GRID_SEGMENTS,
    GRID_SEGMENTS,
  );
  const floorPosition = floorGeometry.getAttribute("position");
  const floorColors = new Float32Array(floorPosition.count * 3);
  const floorBase = new THREE.Color(spatialTokens.inkMuted).lerp(
    new THREE.Color(spatialTokens.surface),
    0.76,
  );
  const gridColor = floorBase.clone().lerp(new THREE.Color(spatialTokens.accentGreen), 0.1);
  for (let index = 0; index < floorPosition.count; index += 1) {
    const x = Math.round((floorPosition.getX(index) / FLOOR_SIZE_METERS + 0.5) * GRID_SEGMENTS);
    const y = Math.round((floorPosition.getY(index) / FLOOR_SIZE_METERS + 0.5) * GRID_SEGMENTS);
    const onGrid = x % GRID_CELL_SEGMENTS === 0 || y % GRID_CELL_SEGMENTS === 0;
    const color = onGrid ? gridColor : floorBase;
    floorColors.set([color.r, color.g, color.b], index * 3);
  }
  floorGeometry.setAttribute("color", new THREE.BufferAttribute(floorColors, 3));
  const floorMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.name = "vr-dim-grid-floor";
  floor.rotation.x = -Math.PI / 2;
  root.add(floor);

  const atomRingGeometry = new THREE.TorusGeometry(ATOM_RING_RADIUS_METERS, 0.004, 6, 48);
  const atomRingMaterial = new THREE.MeshBasicMaterial({
    color: spatialTokens.accentGreen,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
    toneMapped: false,
  });
  const atomRing = new THREE.Mesh(atomRingGeometry, atomRingMaterial);
  atomRing.name = "vr-atom-floor-ring";
  atomRing.position.y = -0.22;

  const triangleCount = [skyGeometry, floorGeometry, atomRingGeometry].reduce((total, geometry) => {
    const index = geometry.index;
    if (!index) {
      throw new Error("The VR environment requires indexed low-poly geometry.");
    }
    return total + index.count / 3;
  }, 0);
  let disposed = false;

  return {
    root,
    atomRing,
    triangleCount,
    get disposed() {
      return disposed;
    },
    setViewerPosition(position) {
      sky.position.set(position.x, position.y, position.z);
    },
    setFallbackFloorFromViewer(viewerHeight) {
      floor.position.y = viewerHeight - FALLBACK_VIEWER_HEIGHT_METERS;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      atomRing.removeFromParent();
      skyGeometry.dispose();
      skyMaterial.dispose();
      floorGeometry.dispose();
      floorMaterial.dispose();
      atomRingGeometry.dispose();
      atomRingMaterial.dispose();
    },
  };
}

/** Return whether a session qualifies for the opaque VR environment. */
export function shouldCreateVrEnvironment(
  mode: "immersive-ar" | "immersive-vr",
  environmentBlendMode: string | undefined,
): boolean {
  return mode === "immersive-vr" && environmentBlendMode === "opaque";
}

/** Create the environment only when session facts identify opaque immersive VR. */
export function createVrEnvironmentForSession(
  mode: "immersive-ar" | "immersive-vr",
  environmentBlendMode: string | undefined,
): VrEnvironment | null {
  return shouldCreateVrEnvironment(mode, environmentBlendMode)
    ? createVrEnvironment()
    : null;
}
