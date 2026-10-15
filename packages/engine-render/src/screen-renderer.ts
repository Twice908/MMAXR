import * as THREE from "three";
import type { InputAction } from "@mma/engine-input";
import { horizonTokens } from "./horizon-tokens.js";
import {
  spatialLayout,
  spatialSurfaceGeometry,
  type NormalizedSpatialSurfaceRect,
} from "./spatial-layout.js";
import { PANEL_LIMITS, xrTokens } from "./xr-tokens.js";
import {
  createGlassSurface,
  disposeGlassSurface,
  type GlassSurface,
} from "./visuals/glass-material.js";
import { createGlassPanel, type GlassPanel } from "./visuals/glass-panel.js";
import type { GlassPanelItem } from "./visuals/panel-layout.js";
import {
  calculateSpatialDockLayout,
  SPATIAL_DOCK_HINT,
  calculateSpatialDockPlacement,
  selectSpatialPresentationProfile,
  shouldEnableSpatialPanelPointerEvents,
  toggleSpatialDockSelection,
  type SpatialPresentationProfile,
  type SpatialPanelKey,
} from "./visuals/spatial-placement.js";
import { createSpatialPanelHost } from "./visuals/spatial-panel-host.js";
import { selectSnapTarget } from "./snap-target.js";
import { screenZoomConfig } from "./zoom-controls.js";
import {
  createVrEnvironmentForSession,
  type VrEnvironment,
} from "./visuals/vr-environment.js";
export { screenZoomConfig } from "./zoom-controls.js";
import {
  screenDropTolerancePx,
  screenPixelsToWorldUnits,
  selectProjectedSnapTarget,
  type ProjectedDropZone,
  type ScreenPoint,
} from "./screen-snap.js";

/** A world-space position used by the declarative screen scene. */
export interface Position3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Show the surface reticle only while a phone placement can be selected. */
export function shouldShowArReticle(
  phoneHitTestActive: boolean,
  repositioningActive: boolean,
  hasHitTestPose: boolean,
): boolean {
  return phoneHitTestActive && repositioningActive && hasHitTestPose;
}

/** Repeated sphere instances rendered with one draw call per group. */
export interface SphereBatch {
  readonly id: string;
  readonly color: number;
  readonly radius: number;
  readonly interactionTarget: string | null;
  readonly positions: readonly Position3[];
}

/** A concentric circular shell surface. */
export interface SceneRing {
  readonly shell: number;
  readonly radius: number;
  readonly slots: readonly {
    readonly id: string;
    readonly position: Position3;
    readonly occupied: boolean;
  }[];
}

/** Declarative, subject-neutral geometry consumed by the Three.js adapter. */
export interface ScreenSceneFrame {
  readonly nucleusRadius: number;
  readonly spheres: readonly SphereBatch[];
  readonly rings: readonly SceneRing[];
}

/** Quality profile selected from browser device hints. */
export type QualityTier = "low" | "mid" | "high";

/** Configuration for a screen-mode Three.js renderer. */
export interface ScreenRendererOptions {
  readonly host: HTMLElement;
  readonly diagnostics?: boolean;
}

export interface SpatialPanelItems {
  readonly mission: readonly GlassPanelItem[];
  readonly particles: readonly GlassPanelItem[];
  readonly elementInfo: readonly GlassPanelItem[];
  readonly narration: readonly GlassPanelItem[];
  readonly arControls?: readonly GlassPanelItem[];
  readonly xrDiagnostics?: readonly GlassPanelItem[];
  readonly settings: readonly GlassPanelItem[];
  readonly settingsToggles: Readonly<Record<string, boolean>>;
}

export interface SpatialPanelSession {
  update(items: SpatialPanelItems): void;
  setExpanded(expanded: boolean): void;
  setActivePanelListener(listener: ((key: SpatialPanelKey | null) => void) | null): void;
  /** Re-place the dock from the viewer's current heading and gaze. */
  reposition(): void;
  /** Suspend browser pointer interception while an immersive session owns input. */
  setPointerEventsEnabled(enabled: boolean): void;
  handleRay(ray: THREE.Ray, phase: "move" | "down" | "up" | "cancel", sourceId?: string): boolean;
  setHintListener(listener: ((hints: readonly SpatialPanelEdgeHint[]) => void) | null): void;
  focusPanel(key: SpatialPanelEdgeHint["key"]): void;
  dispose(): void;
}

export interface SpatialSurfaceLayout {
  readonly shell: NormalizedSpatialSurfaceRect;
  readonly panels: readonly Readonly<{
    id: string;
    variant: "panel" | "card";
    rect: NormalizedSpatialSurfaceRect;
  }>[];
}

export interface SpatialAtomCaption {
  update(items: readonly GlassPanelItem[]): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

export interface SpatialPanelEdgeHint {
  readonly key: SpatialPanelKey;
  readonly visible: boolean;
  readonly x: number;
  readonly y: number;
  readonly angle: number;
}

export function canCreateSpatialPanels(arActive: boolean, cameraViewActive: boolean): boolean {
  return arActive || cameraViewActive;
}

export function shouldShowSpatialSettingsFallback(
  arActive: boolean,
  cameraViewActive: boolean,
): boolean {
  return arActive || cameraViewActive;
}

const SCREEN_BACKGROUND_MODE_EVENT = "mma:screen-background-mode";

function readSpatialDockSafeRect(
  viewport: HTMLElement,
  viewportHeight: number,
): Readonly<{ top: number; bottom: number }> {
  const bounds = viewport.getBoundingClientRect();
  return {
    top: Math.max(0, Math.round(viewportHeight * 0.1)),
    bottom: Math.min(bounds.height || viewportHeight, Math.round(viewportHeight * 0.86)),
  };
}

/** Toggle the screen renderer's scene background transparency without exposing Three.js. */
export function setScreenRendererTransparentBackground(
  host: HTMLElement,
  transparent: boolean,
): void {
  host.dispatchEvent(new CustomEvent(SCREEN_BACKGROUND_MODE_EVENT, {
    detail: transparent,
  }));
}

export interface ArRenderDiagnostics {
  readonly sceneBackground: string;
  readonly clearColor: string;
  readonly clearAlpha: number;
  readonly environmentBlendMode: string;
  readonly grantedFeatures: readonly string[];
  readonly canvasDisplay: string;
  readonly renderLoopRunning: boolean;
  readonly atomVisible: boolean;
  readonly atomInCameraView: boolean;
  readonly sessionAttached: boolean;
  readonly atomPosition: Position3;
  readonly atomScaleFactor: number;
  readonly atomYaw: number;
  readonly atomPitch: number;
  readonly cameraPosition: Position3;
}

const AR_ATOM_DIAMETER_METERS = 0.27;
const RING_TUBE_RADIUS = 0.035;

export interface ArViewerPose {
  readonly position: Readonly<{ x: number; y: number; z: number }>;
  readonly orientation: Readonly<{ x: number; y: number; z: number; w: number }>;
}

export interface ArPlacementTransform {
  readonly position: Position3;
  readonly orientation: ArViewerPose["orientation"];
  readonly distanceMeters: number;
}

/** Viewer pose and stereo-view count read from one XR frame. */
export interface XrViewerPoseFrame {
  readonly pose: ArViewerPose;
  readonly viewCount: number;
}

/** XR frame facts plus its fixed viewer-relative atom placement. */
export interface ArFramePlacement extends XrViewerPoseFrame {
  readonly placement: ArPlacementTransform;
}

interface ViewerPoseLike {
  readonly transform: {
    readonly position: Readonly<{ x: number; y: number; z: number }>;
    readonly orientation: Readonly<{ x: number; y: number; z: number; w: number }>;
  };
  readonly views: readonly unknown[];
}

/** Serializable, PII-free renderer facts shown by the opt-in XR report. */
export interface XrSceneDiagnostics {
  readonly sessionMode: "immersive-ar" | "immersive-vr" | null;
  readonly referenceSpaceType: "local" | "local-floor" | null;
  readonly referenceSpaceReady: boolean;
  readonly firstFramePoseWasNull: boolean | null;
  readonly firstNonNullViewerPose: ArViewerPose | null;
  readonly latestFramePose: ArViewerPose | null;
  readonly atomWorldPosition: Position3;
  readonly atomWorldScale: Position3;
  readonly atomVisibilityChain: readonly Readonly<{ name: string; visible: boolean }>[];
  readonly xrCameraToAtomDistanceMeters: number | null;
  readonly panelGroupWorldPosition: Position3 | null;
  readonly atomViewerSpace: Readonly<{
    distanceMeters: number;
    direction: Position3;
  }> | null;
  readonly atomInsideViewFrustum: boolean | null;
  readonly rendererPresenting: boolean;
  readonly framebufferSize: Readonly<{ width: number; height: number }> | null;
  readonly framesRendered: number;
  readonly viewCount: number | null;
  readonly environmentPresent: boolean;
  readonly sceneIssues: readonly string[];
}

/** Read the viewer pose from the same reference space used by the XR renderer. */
export function readXrViewerPose<TReferenceSpace>(
  frame: { getViewerPose(referenceSpace: TReferenceSpace): ViewerPoseLike | null | undefined },
  referenceSpace: TReferenceSpace,
): XrViewerPoseFrame | null {
  const viewerPose = frame.getViewerPose(referenceSpace);
  if (!viewerPose) return null;
  return {
    pose: {
      position: {
        x: viewerPose.transform.position.x,
        y: viewerPose.transform.position.y,
        z: viewerPose.transform.position.z,
      },
      orientation: {
        x: viewerPose.transform.orientation.x,
        y: viewerPose.transform.orientation.y,
        z: viewerPose.transform.orientation.z,
        w: viewerPose.transform.orientation.w,
      },
    },
    viewCount: viewerPose.views.length,
  };
}

/** Calculate a fixed, viewer-facing start position for the AR presentation. */
export function calculateArViewerPlacement(pose: ArViewerPose): ArPlacementTransform {
  const orientation = new THREE.Quaternion(
    pose.orientation.x,
    pose.orientation.y,
    pose.orientation.z,
    pose.orientation.w,
  ).normalize();
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(orientation);
  const down = new THREE.Vector3(0, -1, 0).applyQuaternion(orientation);
  const position = new THREE.Vector3(pose.position.x, pose.position.y, pose.position.z)
    .addScaledVector(forward, spatialLayout.arPlacement.viewerForwardMeters)
    .addScaledVector(down, spatialLayout.arPlacement.viewerDownMeters);
  return {
    position: { x: position.x, y: position.y, z: position.z },
    orientation: { x: orientation.x, y: orientation.y, z: orientation.z, w: orientation.w },
    distanceMeters: spatialLayout.arPlacement.viewerForwardMeters,
  };
}

/** Resolve placement only when the XR frame has a pose in its rendering reference space. */
export function resolveArFramePlacement<TReferenceSpace>(
  frame: { getViewerPose(referenceSpace: TReferenceSpace): ViewerPoseLike | null | undefined },
  referenceSpace: TReferenceSpace,
): ArFramePlacement | null {
  const viewerFrame = readXrViewerPose(frame, referenceSpace);
  return viewerFrame
    ? { ...viewerFrame, placement: calculateArViewerPlacement(viewerFrame.pose) }
    : null;
}

/** Bound repositioning to a comfortable viewer distance. */
export function clampArPlacementDistance(distance: number): number {
  return THREE.MathUtils.clamp(
    distance,
    spatialLayout.arPlacement.minimumDistanceMeters,
    spatialLayout.arPlacement.maximumDistanceMeters,
  );
}

/** Decide whether this session has the requested hit-test capability. */
export function hasArHitTest(enabledFeatures: Iterable<string> | undefined): boolean {
  return Array.from(enabledFeatures ?? []).includes("hit-test");
}

/** Use surface placement only for touch-first sessions without tracked controllers. */
export function shouldUsePhoneHitTest(
  hitTestGranted: boolean,
  hasTrackedController: boolean,
  coarsePointer: boolean,
): boolean {
  return hitTestGranted && !hasTrackedController && coarsePointer;
}

/** Prefer WebXR session facts, retaining device hints only for older implementations. */
export function isHandheldArSession(
  session: Readonly<{
    interactionMode?: "screen-space" | "world-space";
    environmentBlendMode?: "opaque" | "additive" | "alpha-blend";
  }>,
  hasTrackedController: boolean,
  coarsePointer: boolean,
): boolean {
  if (session.interactionMode) {
    return session.interactionMode === "screen-space";
  }
  if (session.environmentBlendMode === "opaque") {
    return false;
  }
  return !hasTrackedController && coarsePointer;
}

/** Move the atom placement along the original viewer-facing plane. */
export function moveArPlacement(
  distance: number,
  side: number,
  deltaX: number,
  deltaY: number,
): Readonly<{ distance: number; side: number }> {
  return {
    distance: clampArPlacementDistance(
      distance - deltaY * spatialLayout.arPlacement.moveMetersPerSecond,
    ),
    side: THREE.MathUtils.clamp(
      side + deltaX * spatialLayout.arPlacement.moveMetersPerSecond,
      -spatialLayout.arPlacement.maximumDistanceMeters,
      spatialLayout.arPlacement.maximumDistanceMeters,
    ),
  };
}

/** Restore a saved viewer placement without retaining mutable vector objects. */
export function resetArPlacement(
  placement: ArPlacementTransform,
): ArPlacementTransform {
  return {
    ...placement,
    position: { ...placement.position },
    orientation: { ...placement.orientation },
  };
}

/** Shared handheld AR gesture tuning and view limits. */
export const arTouchGestureConfig = Object.freeze({
  pinchSensitivity: 0.008,
  pinchDeadZonePx: 1,
  dragThresholdPx: 4,
  rotationSensitivity: 0.006,
  minScaleFactor: 0.5,
  maxScaleFactor: 2,
  maxPitchRadians: Math.PI / 3,
});

/** Serializable view-only transform for the atom in a handheld AR session. */
export interface ArViewTransform {
  readonly scaleFactor: number;
  readonly yaw: number;
  readonly pitch: number;
}

/** A normalized rotate or scale gesture applied to the AR view transform. */
export type ArViewGesture =
  | { readonly type: "rotate"; readonly deltaX: number; readonly deltaY: number }
  | { readonly type: "scale"; readonly delta: number };

const DEFAULT_AR_VIEW_TRANSFORM: ArViewTransform = Object.freeze({
  scaleFactor: 1,
  yaw: 0,
  pitch: 0,
});

/** Apply a handheld AR gesture using the shared sensitivity and view bounds. */
export function applyArViewGesture(
  transform: ArViewTransform,
  gesture: ArViewGesture,
): ArViewTransform {
  if (gesture.type === "scale") {
    return {
      ...transform,
      scaleFactor: THREE.MathUtils.clamp(
        transform.scaleFactor - gesture.delta,
        arTouchGestureConfig.minScaleFactor,
        arTouchGestureConfig.maxScaleFactor,
      ),
    };
  }
  return {
    ...transform,
    yaw: transform.yaw - gesture.deltaX * arTouchGestureConfig.rotationSensitivity,
    pitch: THREE.MathUtils.clamp(
      transform.pitch + gesture.deltaY * arTouchGestureConfig.rotationSensitivity,
      -arTouchGestureConfig.maxPitchRadians,
      arTouchGestureConfig.maxPitchRadians,
    ),
  };
}

/** Default viewer-relative AR offset in the local reference space. */
export const arWorldAnchorPosition: Position3 = Object.freeze({
  x: 0,
  y: -spatialLayout.arPlacement.viewerDownMeters,
  z: -spatialLayout.arPlacement.viewerForwardMeters,
});

/** Calculate the scale that fits a scene frame into a 27 cm AR diameter. */
export function arContentScale(frame: ScreenSceneFrame): number {
  const ringExtent = frame.rings.reduce(
    (extent, ring) => Math.max(extent, ring.radius + RING_TUBE_RADIUS),
    frame.nucleusRadius,
  );
  const sphereExtent = frame.spheres.reduce((extent, batch) =>
    batch.positions.reduce(
      (batchExtent, position) => Math.max(
        batchExtent,
        Math.hypot(position.x, position.y, position.z) + batch.radius,
      ),
      extent,
    ), ringExtent);
  return AR_ATOM_DIAMETER_METERS / Math.max(0.01, sphereExtent * 2);
}

const QUALITY_PIXEL_RATIO: Record<QualityTier, number> = {
  low: 1,
  mid: 1.5,
  high: 2,
};

/** Select a conservative pixel-ratio profile from browser hardware hints. */
export function selectQualityTier(
  deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4,
  cores = navigator.hardwareConcurrency ?? 4,
): QualityTier {
  if (deviceMemory <= 3 || cores <= 4) {
    return "low";
  }
  return deviceMemory >= 8 && cores >= 8 ? "high" : "mid";
}

/**
 * Own a screen-mode Three.js scene, bounded camera, diagnostics overlay, and
 * view-only geometry. It does not own or mutate learning state.
 */
export class ScreenSceneRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly qualityTier: QualityTier;

  private readonly host: HTMLElement;
  private readonly scene = new THREE.Scene();
  private readonly arPlacementRoot = new THREE.Group();
  private readonly atomRoot = new THREE.Group();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly screenBackground = new THREE.Color(0xf4f4ee);
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly nucleonGeometry = new THREE.SphereGeometry(1, 16, 12);
  private readonly materials = new Map<number, THREE.MeshStandardMaterial>();
  private readonly sphereMeshes: THREE.InstancedMesh[] = [];
  private readonly ringMeshes = new Map<number, THREE.Mesh>();
  private readonly slotMarkers: {
    readonly shell: number;
    readonly id: string;
    readonly position: THREE.Vector3;
    readonly occupied: boolean;
    readonly element: HTMLSpanElement;
  }[] = [];
  private readonly interactiveMeshes: THREE.Object3D[] = [];
  private readonly nucleusPickMesh: THREE.Mesh;
  private readonly atomDropOutline: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private readonly dragGhost: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private readonly dragGhostOutline: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>;
  private readonly slotLayer: HTMLDivElement;
  private readonly resizeObserver: ResizeObserver;
  private readonly reducedMotion: MediaQueryList;
  private readonly diagnosticsElement: HTMLElement | null;
  private animationFrame = 0;
  private resizeFrame = 0;
  private lastFrameTime = 0;
  private yaw = 0;
  private pitch = 0;
  private distance: number = screenZoomConfig.defaultDistance;
  private arViewTransform: ArViewTransform = DEFAULT_AR_VIEW_TRANSFORM;
  private nucleusRadius = 0.2;
  private atomBoundingRadius = 0.2;
  private dragParticle: string | null = null;
  private arActive = false;
  private cameraViewActive = false;
  private currentFrame: ScreenSceneFrame | null = null;
  private activeXRSession: XRSession | null = null;
  private activeXRMode: "immersive-ar" | "immersive-vr" | null = null;
  private activeXRReferenceSpaceType: "local" | "local-floor" | null = null;
  private spatialPresentationProfile: SpatialPresentationProfile = "handheld";
  private firstFramePoseWasNull: boolean | null = null;
  private firstNonNullViewerPose: ArViewerPose | null = null;
  private latestFramePose: ArViewerPose | null = null;
  private latestViewCount: number | null = null;
  private framesRendered = 0;
  private spatialPanelGroup: THREE.Group | null = null;
  private pendingSpatialDockReposition: ((pose: ArViewerPose) => void) | null = null;
  private atomCaptionPanel: GlassPanel | null = null;
  private atomCaptionAnchor: THREE.Group | null = null;
  private hitTestSource: XRHitTestSource | null = null;
  private hitTestReferenceSpace: XRReferenceSpace | null = null;
  private lastHitTestPose: XRPose | null = null;
  private readonly arReticle: THREE.Mesh;
  private initialArPlacement: ArPlacementTransform | null = null;
  private arPlacementDistance = spatialLayout.arPlacement.viewerForwardMeters;
  private arPlacementSide = 0;
  private arViewerOrientation = new THREE.Quaternion();
  private arViewerOrigin = new THREE.Vector3();
  private phoneHitTestActive = false;
  private phonePlacementRepositioning = false;
  private phoneAtomPlaced = false;
  private vrEnvironment: VrEnvironment | null = null;
  private vrFloorUsesViewerFallback = false;
  private xrRenderLoopRunning = false;
  private arDiagnosticsListener: ((diagnostics: ArRenderDiagnostics) => void) | null = null;
  private spatialHintUpdater: (() => void) | null = null;
  private disposed = false;

  /** Create a WebGL canvas inside a host element and configure quality limits. */
  constructor(options: ScreenRendererOptions) {
    this.host = options.host;
    this.qualityTier = selectQualityTier();
    this.canvas = document.createElement("canvas");
    this.canvas.className = "atom-canvas";
    this.canvas.setAttribute("aria-label", "Interactive 3D atom model");
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: this.qualityTier !== "low",
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, QUALITY_PIXEL_RATIO[this.qualityTier]),
    );
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 1);
    this.host.append(this.canvas);
    this.host.addEventListener(SCREEN_BACKGROUND_MODE_EVENT, this.onBackgroundModeChange);
    this.slotLayer = document.createElement("div");
    this.slotLayer.className = "drop-slot-layer";
    this.slotLayer.setAttribute("aria-hidden", "true");
    this.host.append(this.slotLayer);
    this.scene.background = this.screenBackground;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x5c6870, 2));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
    keyLight.position.set(4, 5, 9);
    this.scene.add(keyLight);
    this.scene.add(this.arPlacementRoot);
    this.arPlacementRoot.add(this.atomRoot);
    this.arReticle = new THREE.Mesh(
      new THREE.RingGeometry(
        spatialLayout.arPlacement.reticleRadiusMeters * 0.78,
        spatialLayout.arPlacement.reticleRadiusMeters,
        32,
      ),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
    );
    this.arReticle.visible = false;
    this.scene.add(this.arReticle);
    this.camera.position.set(0, 0, this.distance);

    const pickMaterial = new THREE.MeshBasicMaterial({
      color: 0xf0b323,
      transparent: true,
      opacity: 0,
      wireframe: true,
      depthWrite: false,
    });
    this.nucleusPickMesh = new THREE.Mesh(new THREE.SphereGeometry(1), pickMaterial);
    this.nucleusPickMesh.userData.interactionTarget = "nucleus";
    this.atomRoot.add(this.nucleusPickMesh);
    this.interactiveMeshes.push(this.nucleusPickMesh);
    this.atomDropOutline = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 16),
      new THREE.MeshBasicMaterial({
        color: 0xf0b323,
        transparent: true,
        opacity: 0.88,
        wireframe: true,
        depthWrite: false,
      }),
    );
    this.atomDropOutline.visible = false;
    this.atomDropOutline.renderOrder = 3;
    this.atomRoot.add(this.atomDropOutline);
    this.dragGhost = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 16, 12),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
      }),
    );
    this.dragGhost.visible = false;
    this.dragGhost.renderOrder = 4;
    this.scene.add(this.dragGhost);
    this.dragGhostOutline = new THREE.LineSegments(
      new THREE.EdgesGeometry(this.dragGhost.geometry),
      new THREE.LineBasicMaterial({ color: 0x20222a, transparent: true, opacity: 0.9 }),
    );
    this.dragGhost.add(this.dragGhostOutline);

    this.diagnosticsElement = options.diagnostics ? document.createElement("output") : null;
    if (this.diagnosticsElement) {
      this.diagnosticsElement.className = "render-diagnostics";
      this.diagnosticsElement.setAttribute("aria-live", "off");
      this.host.append(this.diagnosticsElement);
    }

    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.reducedMotion.addEventListener("change", this.onReducedMotionChange);
    this.resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = requestAnimationFrame(this.resize);
    });
    this.resizeObserver.observe(this.host);
    this.resize();
    this.render();
    this.startDiagnosticsLoop();
  }

  /** Replace view geometry from a serialized state-derived scene frame. */
  update(frame: ScreenSceneFrame): void {
    this.currentFrame = frame;
    this.clearSphereMeshes();
    this.clearRingMeshes();
    this.nucleusRadius = Math.max(frame.nucleusRadius, 0.2);
    this.atomBoundingRadius = Math.max(
      frame.nucleusRadius,
      ...frame.rings.map((ring) => ring.radius + RING_TUBE_RADIUS),
      ...frame.spheres.flatMap((batch) =>
        batch.positions.map((position) => Math.hypot(position.x, position.y, position.z) + batch.radius)),
    );
    this.atomDropOutline.scale.setScalar(this.atomBoundingRadius);

    for (const batch of frame.spheres) {
      if (batch.positions.length === 0) {
        continue;
      }
      const mesh = new THREE.InstancedMesh(
        this.nucleonGeometry,
        this.materialFor(batch.color),
        batch.positions.length,
      );
      mesh.name = batch.id;
      mesh.userData.interactionTarget = batch.interactionTarget;
      const transform = new THREE.Object3D();
      batch.positions.forEach((position, index) => {
        transform.position.set(position.x, position.y, position.z);
        transform.scale.setScalar(batch.radius);
        transform.updateMatrix();
        mesh.setMatrixAt(index, transform.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      this.atomRoot.add(mesh);
      this.sphereMeshes.push(mesh);
      if (batch.interactionTarget) {
        this.interactiveMeshes.push(mesh);
      }
    }

    this.nucleusPickMesh.scale.setScalar(this.nucleusRadius);
    for (const ring of frame.rings) {
      const geometry = new THREE.TorusGeometry(ring.radius, 0.035, 6, 96);
      const material = new THREE.MeshBasicMaterial({
        color: ring.shell % 2 === 0 ? 0x178b87 : 0x5b6e9b,
        transparent: true,
        opacity: 0.72,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData.interactionTarget = `shell:${ring.shell}`;
      this.atomRoot.add(mesh);
      this.ringMeshes.set(ring.shell, mesh);
      this.interactiveMeshes.push(mesh);
      for (const slot of ring.slots) {
        const element = document.createElement("span");
        element.className = "drop-slot-marker";
        element.dataset.slotId = slot.id;
        this.slotLayer.append(element);
        this.slotMarkers.push({
          shell: ring.shell,
          id: slot.id,
          position: new THREE.Vector3(slot.position.x, slot.position.y, slot.position.z),
          occupied: slot.occupied,
          element,
        });
      }
    }
    if (this.arActive) {
      this.atomRoot.scale.setScalar(
        arContentScale(frame) * this.arViewTransform.scaleFactor,
      );
    }
    this.positionSlotMarkers();
    this.updateAtomCaptionPlacement();
    this.render();
  }

  /** Create a small kit Card attached below the atom for handheld AR. */
  createAtomCaption(items: readonly GlassPanelItem[]): SpatialAtomCaption {
    if (!this.arActive) {
      throw new Error("An atom caption requires an active AR presentation.");
    }
    this.atomCaptionPanel?.dispose();
    this.atomCaptionAnchor?.removeFromParent();
    const widthDp = 520;
    const heightDp = 192;
    const panel = createGlassPanel({
      id: "ar-atom-caption",
      component: "card",
      widthM: widthDp * horizonTokens.metresPerDp,
      heightM: heightDp * horizonTokens.metresPerDp,
      pixelWidth: widthDp,
      contentPaddingPx: 8,
      surface: "uniform",
      items,
    });
    const anchor = new THREE.Group();
    anchor.name = "ar-atom-caption-anchor";
    anchor.add(panel.object3d);
    this.atomRoot.add(anchor);
    this.atomCaptionPanel = panel;
    this.atomCaptionAnchor = anchor;
    this.updateAtomCaptionPlacement();
    this.render();
    let disposed = false;
    return {
      update: (nextItems) => {
        if (disposed) return;
        panel.update(nextItems);
        this.render();
      },
      setVisible: (visible) => {
        if (disposed) return;
        panel.object3d.visible = visible;
        this.render();
      },
      dispose: () => {
        if (disposed) return;
        disposed = true;
        panel.dispose();
        anchor.removeFromParent();
        if (this.atomCaptionPanel === panel) this.atomCaptionPanel = null;
        if (this.atomCaptionAnchor === anchor) this.atomCaptionAnchor = null;
        this.render();
      },
    };
  }

  /** Present the atom at tabletop scale through the active WebXR session. */
  async enterARSession(
    session: EventTarget,
    mode: "immersive-ar" | "immersive-vr" = "immersive-ar",
  ): Promise<void> {
    if (this.disposed) {
      throw new Error("Cannot start AR with a disposed renderer.");
    }
    if (this.arActive) {
      return;
    }

    this.arActive = true;
    cancelAnimationFrame(this.animationFrame);
    this.renderer.xr.enabled = true;
    const enabledFeatures = new Set(Array.from((session as XRSession).enabledFeatures ?? []));
    this.activeXRMode = mode;
    this.spatialPresentationProfile = selectSpatialPresentationProfile(
      mode,
      (session as XRSession & { interactionMode?: string }).interactionMode,
    );
    this.activeXRReferenceSpaceType =
      mode === "immersive-vr" && enabledFeatures.has("local-floor") ? "local-floor" : "local";
    this.renderer.xr.setReferenceSpaceType(this.activeXRReferenceSpaceType);
    this.firstFramePoseWasNull = null;
    this.firstNonNullViewerPose = null;
    this.latestFramePose = null;
    this.latestViewCount = null;
    this.framesRendered = 0;
    this.scene.background = mode === "immersive-vr" ? this.screenBackground : null;
    this.arPlacementDistance = spatialLayout.arPlacement.viewerForwardMeters;
    this.arPlacementSide = 0;
    this.initialArPlacement = null;
    this.phoneHitTestActive = false;
    this.phonePlacementRepositioning = false;
    this.phoneAtomPlaced = false;
    this.arViewTransform = DEFAULT_AR_VIEW_TRANSFORM;
    this.arPlacementRoot.position.set(0, 0, 0);
    this.arPlacementRoot.quaternion.identity();
    this.atomRoot.position.set(0, 0, 0);
    this.atomRoot.rotation.set(0, 0, 0);
    this.atomRoot.scale.setScalar(
      (this.currentFrame ? arContentScale(this.currentFrame) : 0.675) *
        this.arViewTransform.scaleFactor,
    );

    try {
      this.activeXRSession = session as XRSession;
      await this.renderer.xr.setSession(this.activeXRSession);
      this.xrRenderLoopRunning = true;
      this.renderer.setAnimationLoop((time, frame) => {
        if (frame) {
          const referenceSpace = this.renderer.xr.getReferenceSpace();
          const viewerFrame = referenceSpace ? resolveArFramePlacement(frame, referenceSpace) : null;
          if (this.firstFramePoseWasNull === null) {
            this.firstFramePoseWasNull = viewerFrame === null;
          }
          this.latestFramePose = viewerFrame?.pose ?? null;
          this.latestViewCount = viewerFrame?.viewCount ?? null;
          if (viewerFrame && !this.firstNonNullViewerPose) {
            this.firstNonNullViewerPose = viewerFrame.pose;
          }
          this.updateArPlacementFromFrame(frame, viewerFrame);
          if (viewerFrame && this.pendingSpatialDockReposition) {
            const reposition = this.pendingSpatialDockReposition;
            this.pendingSpatialDockReposition = null;
            reposition(viewerFrame.pose);
          }
          this.framesRendered += 1;
        }
        const frameTime = this.lastFrameTime === 0 ? 0 : time - this.lastFrameTime;
        this.lastFrameTime = time;
        this.render(frameTime);
      });
      this.vrEnvironment = createVrEnvironmentForSession(
        mode,
        this.activeXRSession.environmentBlendMode,
      );
      if (this.vrEnvironment) {
        this.scene.add(this.vrEnvironment.root);
        this.arPlacementRoot.add(this.vrEnvironment.atomRing);
        this.vrFloorUsesViewerFallback = !enabledFeatures.has("local-floor");
      }
      if (mode === "immersive-ar") {
        let hitTestFailureLogged = false;
        let hitTestTimeout: ReturnType<typeof globalThis.setTimeout> | undefined;
        const hitTestDeadline = new Promise<never>((_, reject) => {
          hitTestTimeout = globalThis.setTimeout(() => {
            this.phoneHitTestActive = false;
            reject(new Error("Phone hit-test setup timed out after 3000 ms."));
          }, 3000);
        });
        void Promise.race([
          this.enablePhoneHitTest(this.activeXRSession),
          hitTestDeadline,
        ])
          .catch((error: unknown) => {
            if (!hitTestFailureLogged) {
              hitTestFailureLogged = true;
              console.warn("Phone hit-test setup failed; XR rendering will continue.", error);
            }
          })
          .finally(() => {
            if (hitTestTimeout !== undefined) {
              globalThis.clearTimeout(hitTestTimeout);
            }
          });
      }
    } catch (error) {
      await this.exitARSession();
      throw error;
    }
  }

  /** Stop the WebXR render loop and restore the screen presentation. */
  async exitARSession(): Promise<void> {
    if (!this.arActive) {
      return;
    }

    let cleanupError: unknown;
    const attempt = (action: () => void): void => {
      try {
        action();
      } catch (error) {
        cleanupError ??= error;
      }
    };
    attempt(() => this.renderer.setAnimationLoop(null));
    this.pendingSpatialDockReposition = null;
    this.xrRenderLoopRunning = false;
    attempt(() => this.activeXRSession?.removeEventListener("select", this.onPhoneSurfaceSelect));
    attempt(() => this.disposeVrEnvironment());
    attempt(() => this.hitTestSource?.cancel());
    this.hitTestSource = null;
    this.hitTestReferenceSpace = null;
    this.lastHitTestPose = null;
    this.phoneHitTestActive = false;
    this.phonePlacementRepositioning = false;
    this.phoneAtomPlaced = false;
    this.arReticle.visible = false;
    let session: XRSession | null = null;
    try {
      session = this.renderer.xr.getSession();
    } catch (error) {
      cleanupError ??= error;
    }
    if (session) {
      try {
        await this.renderer.xr.setSession(null);
      } catch (error) {
        cleanupError ??= error;
      }
    }
    attempt(() => { this.renderer.xr.enabled = false; });
    this.activeXRSession = null;
    this.activeXRMode = null;
    this.activeXRReferenceSpaceType = null;
    this.spatialPresentationProfile = "handheld";
    this.firstFramePoseWasNull = null;
    this.firstNonNullViewerPose = null;
    this.latestFramePose = null;
    this.latestViewCount = null;
    this.framesRendered = 0;
    this.vrFloorUsesViewerFallback = false;
    this.arActive = false;
    attempt(() => {
      this.arPlacementRoot.position.set(0, 0, 0);
      this.arPlacementRoot.quaternion.identity();
      this.atomRoot.position.set(0, 0, 0);
      this.atomRoot.rotation.set(0, 0, 0);
      this.atomRoot.scale.setScalar(1);
      this.arViewTransform = DEFAULT_AR_VIEW_TRANSFORM;
      this.scene.background = this.screenBackground;
    });
    attempt(() => this.render());
    attempt(() => this.startDiagnosticsLoop());
    if (cleanupError) throw cleanupError;
  }

  /** Subscribe to live AR renderer facts for a development-only overlay. */
  setArDiagnosticsListener(
    listener: ((diagnostics: ArRenderDiagnostics) => void) | null,
  ): void {
    this.arDiagnosticsListener = listener;
    this.publishArDiagnostics();
    this.spatialHintUpdater?.();
  }

  /** Return copyable, PII-free scene and XR facts for an active or recent session. */
  getXrSceneDiagnostics(): XrSceneDiagnostics {
    this.scene.updateMatrixWorld(true);
    const atomWorld = this.atomRoot.getWorldPosition(new THREE.Vector3());
    const atomWorldScale = this.atomRoot.getWorldScale(new THREE.Vector3());
    const atomVisibilityChain: { name: string; visible: boolean }[] = [];
    let ancestor: THREE.Object3D | null = this.atomRoot;
    while (ancestor) {
      atomVisibilityChain.push({
        name: ancestor.name || ancestor.type,
        visible: ancestor.visible,
      });
      if (ancestor === this.scene) break;
      ancestor = ancestor.parent;
    }
    let xrCameraToAtomDistanceMeters: number | null = null;
    if (this.renderer.xr.isPresenting) {
      const xrCamera = this.renderer.xr.getCamera();
      xrCamera.updateMatrixWorld(true);
      xrCameraToAtomDistanceMeters = xrCamera
        .getWorldPosition(new THREE.Vector3())
        .distanceTo(atomWorld);
    }
    const panelWorld = this.spatialPanelGroup?.getWorldPosition(new THREE.Vector3()) ?? null;
    const viewerPose = this.latestFramePose;
    let atomViewerSpace: XrSceneDiagnostics["atomViewerSpace"] = null;
    let atomInsideViewFrustum: boolean | null = null;
    if (viewerPose) {
      const viewerPosition = new THREE.Vector3(
        viewerPose.position.x,
        viewerPose.position.y,
        viewerPose.position.z,
      );
      const viewerOrientation = new THREE.Quaternion(
        viewerPose.orientation.x,
        viewerPose.orientation.y,
        viewerPose.orientation.z,
        viewerPose.orientation.w,
      ).normalize();
      const viewerSpacePosition = atomWorld.clone()
        .sub(viewerPosition)
        .applyQuaternion(viewerOrientation.invert());
      const distanceMeters = viewerSpacePosition.length();
      const direction = distanceMeters > 0
        ? viewerSpacePosition.clone().multiplyScalar(1 / distanceMeters)
        : new THREE.Vector3();
      atomViewerSpace = {
        distanceMeters,
        direction: { x: direction.x, y: direction.y, z: direction.z },
      };

      const xrCamera = this.renderer.xr.getCamera();
      xrCamera.updateMatrixWorld(true);
      const cameras = xrCamera instanceof THREE.ArrayCamera ? xrCamera.cameras : [xrCamera];
      atomInsideViewFrustum = cameras.some((camera) => {
        const viewProjection = new THREE.Matrix4().multiplyMatrices(
          camera.projectionMatrix,
          camera.matrixWorldInverse,
        );
        return new THREE.Frustum().setFromProjectionMatrix(viewProjection).containsPoint(atomWorld);
      });
    }

    const sceneIssues: string[] = [];
    this.scene.traverse((object) => {
      const name = object.name || object.type;
      const issues: string[] = [];
      if (!object.visible) issues.push("visible=false");
      if (object.scale.x === 0 || object.scale.y === 0 || object.scale.z === 0) {
        issues.push("zero scale");
      }
      const transformValues = [
        object.position.x, object.position.y, object.position.z,
        object.quaternion.x, object.quaternion.y, object.quaternion.z, object.quaternion.w,
        object.scale.x, object.scale.y, object.scale.z,
      ];
      if (transformValues.some((value) => !Number.isFinite(value))) {
        issues.push("NaN/non-finite transform");
      }
      if (issues.length > 0) sceneIssues.push(`${name}: ${issues.join(", ")}`);
    });
    const baseLayer = this.activeXRSession?.renderState.baseLayer;
    return {
      sessionMode: this.activeXRMode,
      referenceSpaceType: this.activeXRReferenceSpaceType,
      referenceSpaceReady: this.renderer.xr.getReferenceSpace() !== null,
      firstFramePoseWasNull: this.firstFramePoseWasNull,
      firstNonNullViewerPose: this.firstNonNullViewerPose,
      latestFramePose: this.latestFramePose,
      atomWorldPosition: { x: atomWorld.x, y: atomWorld.y, z: atomWorld.z },
      atomWorldScale: { x: atomWorldScale.x, y: atomWorldScale.y, z: atomWorldScale.z },
      atomVisibilityChain,
      xrCameraToAtomDistanceMeters,
      panelGroupWorldPosition: panelWorld
        ? { x: panelWorld.x, y: panelWorld.y, z: panelWorld.z }
        : null,
      atomViewerSpace,
      atomInsideViewFrustum,
      rendererPresenting: this.renderer.xr.isPresenting,
      framebufferSize: baseLayer
        ? { width: baseLayer.framebufferWidth, height: baseLayer.framebufferHeight }
        : null,
      framesRendered: this.framesRendered,
      viewCount: this.latestViewCount,
      environmentPresent: this.vrEnvironment?.root.parent === this.scene,
      sceneIssues,
    };
  }

  /** Find the closest interactive scene surface under viewport coordinates. */
  pickTarget(
    clientX: number,
    clientY: number,
    source?: string,
    pointerType = "mouse",
  ): string | null {
    const bounds = this.canvas.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) {
      return null;
    }
    if (source?.startsWith("tray:")) {
      const pointer = { x: clientX - bounds.left, y: clientY - bounds.top };
      const tolerance = screenDropTolerancePx(pointerType, bounds.width);
      if (source === "tray:electron") {
        const zones = this.projectedRingZones(bounds);
        const selection = selectProjectedSnapTarget(pointer, zones, tolerance);
        this.updateDropHighlight(selection?.target ?? null, selection?.slotId ?? null);
        return selection?.target ?? null;
      }
      if (source === "tray:proton" || source === "tray:neutron") {
        const target = this.isNearNucleus(pointer, tolerance, bounds.height)
          ? "nucleus"
          : this.pickTarget(clientX, clientY);
        this.updateDropHighlight(target, null);
        return target;
      }
    }

    this.pointer.set(
      ((clientX - bounds.left) / bounds.width) * 2 - 1,
      -((clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.interactiveMeshes, false);
    return selectSnapTarget(hits.flatMap((hit) => {
      const target = hit.object.userData.interactionTarget;
      return typeof target === "string"
        ? [{ target, distance: hit.distance, priority: target === "nucleus" ? 1 : 0 }]
        : [];
    }));
  }

  /** Pick an interactive atom surface from a world-space XR ray. */
  pickRay(
    origin: Readonly<{ x: number; y: number; z: number }>,
    direction: Readonly<{ x: number; y: number; z: number }>,
  ): { readonly target: string } | null {
    this.raycaster.ray.set(
      new THREE.Vector3(origin.x, origin.y, origin.z),
      new THREE.Vector3(direction.x, direction.y, direction.z),
    );
    const hit = this.raycaster.intersectObjects(this.interactiveMeshes, false)
      .find((intersection) => typeof intersection.object.userData.interactionTarget === "string");
    const target = hit?.object.userData.interactionTarget;
    return typeof target === "string" ? { target } : null;
  }

  /** Show the drag ghost and electron slot markers for a particle gesture. */
  beginDrag(particle: string, color?: string): void {
    this.dragParticle = particle;
    this.slotLayer.classList.toggle("is-visible", particle === "electron");
    this.positionSlotMarkers();
    if (this.arActive) {
      if (color) this.dragGhost.material.color.set(color);
      this.dragGhost.visible = true;
    }
  }

  /** Clear transient drop-zone highlights after a drag ends or is cancelled. */
  endDrag(): void {
    this.dragParticle = null;
    this.dragGhost.visible = false;
    this.atomDropOutline.visible = false;
    this.slotLayer.classList.remove("is-visible");
    this.updateDropHighlight(null, null);
  }

  /** Update the in-scene drag preview and return whether the ray hits the atom bounds. */
  updateSpatialDragRay(
    origin: Readonly<{ x: number; y: number; z: number }>,
    direction: Readonly<{ x: number; y: number; z: number }>,
  ): "nucleus" | null {
    if (!this.arActive || !this.dragParticle) return null;
    const rayDirection = new THREE.Vector3(direction.x, direction.y, direction.z).normalize();
    const rayOrigin = new THREE.Vector3(origin.x, origin.y, origin.z);
    const ray = new THREE.Ray(rayOrigin, rayDirection);
    this.dragGhost.position.copy(rayOrigin).addScaledVector(rayDirection, 0.45);
    this.scene.updateMatrixWorld(true);
    const center = this.atomRoot.getWorldPosition(new THREE.Vector3());
    const worldScale = this.atomRoot.getWorldScale(new THREE.Vector3());
    const scale = Math.max(worldScale.x, worldScale.y, worldScale.z);
    const radius = this.atomBoundingRadius * scale;
    const target = ray.intersectsSphere(new THREE.Sphere(center, radius)) ? "nucleus" : null;
    this.atomDropOutline.visible = target !== null;
    this.render();
    return target;
  }

  /** Rotate the view without changing atom state. */
  rotate(deltaX: number, deltaY: number): void {
    this.yaw -= deltaX * 0.006;
    this.pitch = THREE.MathUtils.clamp(this.pitch + deltaY * 0.006, -1.15, 1.15);
    this.updateCamera();
  }

  /** Zoom the view within fixed comfortable camera-distance limits. */
  scale(delta: number): void {
    this.setDistance(this.distance * Math.exp(delta));
  }

  /** Read the current screen-mode camera distance. */
  getDistance(): number {
    return this.distance;
  }

  /** Set the screen-mode camera distance within its configured limits. */
  setDistance(distance: number): void {
    this.distance = THREE.MathUtils.clamp(
      distance,
      screenZoomConfig.minDistance,
      screenZoomConfig.maxDistance,
    );
    this.updateCamera();
  }

  /** Restore the initial camera position without changing atom state. */
  resetView(): void {
    this.yaw = 0;
    this.pitch = 0;
    this.distance = screenZoomConfig.defaultDistance;
    this.updateCamera();
  }

  /** Rotate the atom view in AR without changing its fixed world anchor. */
  rotateArView(deltaX: number, deltaY: number): void {
    this.arViewTransform = applyArViewGesture(this.arViewTransform, {
      type: "rotate",
      deltaX,
      deltaY,
    });
    this.atomRoot.rotation.set(
      this.arViewTransform.pitch,
      this.arViewTransform.yaw,
      0,
    );
    this.render();
  }

  /** Scale the atom view in AR, bounded relative to its default size. */
  scaleArView(delta: number): void {
    this.arViewTransform = applyArViewGesture(this.arViewTransform, {
      type: "scale",
      delta,
    });
    this.updateArAtomScale();
    this.render();
  }

  /** Reposition the atom in the viewer-facing plane, bounded by layout limits. */
  moveArView(deltaX: number, deltaY: number): void {
    const moved = moveArPlacement(
      this.arPlacementDistance,
      this.arPlacementSide,
      deltaX,
      deltaY,
    );
    this.arPlacementDistance = moved.distance;
    this.arPlacementSide = moved.side;
    this.updateArPlacementPosition();
    this.render();
  }

  /** Restore the initial AR placement, scale, and rotation. */
  resetArView(): void {
    this.arViewTransform = DEFAULT_AR_VIEW_TRANSFORM;
    this.atomRoot.rotation.set(0, 0, 0);
    if (this.initialArPlacement) {
      const initialPlacement = resetArPlacement(this.initialArPlacement);
      this.arPlacementRoot.position.set(
        initialPlacement.position.x,
        initialPlacement.position.y,
        initialPlacement.position.z,
      );
      this.arPlacementRoot.quaternion.set(
        initialPlacement.orientation.x,
        initialPlacement.orientation.y,
        initialPlacement.orientation.z,
        initialPlacement.orientation.w,
      );
      this.arPlacementDistance = initialPlacement.distanceMeters;
      this.arPlacementSide = 0;
    }
    this.updateArAtomScale();
    this.render();
  }

  /** Create world-fixed glass panels for an active AR or screen-camera presentation. */
  createSpatialPanelSession(
    items: SpatialPanelItems,
    onPanelAction: (inputId: string) => void,
    arPointerTarget?: HTMLElement,
    onSpatialInput?: (action: InputAction) => void,
    emptySurfaceLayout?: SpatialSurfaceLayout,
  ): SpatialPanelSession {
    if (!canCreateSpatialPanels(this.arActive, this.cameraViewActive)) {
      throw new Error("Spatial panels require an active AR or camera-view presentation.");
    }
    if (this.arActive && emptySurfaceLayout) {
      return this.createEmptySpatialSurfaceSession(emptySurfaceLayout);
    }
    const viewerCamera: THREE.Camera = this.arActive
      ? this.renderer.xr.getCamera()
      : this.camera;
    const viewport = arPointerTarget ?? this.canvas;
    const viewportWidth = viewport.clientWidth || window.innerWidth;
    const viewportHeight = viewport.clientHeight || window.innerHeight;
    const projectionCamera = viewerCamera instanceof THREE.ArrayCamera
      ? viewerCamera.cameras[0] ?? viewerCamera
      : viewerCamera;
    const includeSettings = (items.arControls?.length ?? 0) > 0;
    const dockLayout = calculateSpatialDockLayout(
      viewportWidth,
      viewportHeight,
      projectionCamera.projectionMatrix.elements[5]!,
      this.spatialPresentationProfile,
      includeSettings,
    );
    const profile = spatialLayout.dockProfiles[
      this.spatialPresentationProfile === "headset" ? "headset" : "handheld"
    ];
    const safeRect = readSpatialDockSafeRect(viewport, viewportHeight);
    const rowHeightPx = horizonTokens.minimumHitTargetDp;
    const desiredRowY = viewportHeight / 2 +
      Math.tan(profile.downAngleRadians) * profile.distanceMeters * dockLayout.pixelsPerMeter;
    const rowCenterY = THREE.MathUtils.clamp(
      desiredRowY,
      safeRect.top + rowHeightPx / 2,
      safeRect.bottom - rowHeightPx / 2,
    );
    const detailHeightMeters = dockLayout.detailHeightMeters;
    const group = new THREE.Group();
    group.name = "spatial-glass-panels";
    const panelParent = this.scene;
    panelParent.add(group);
    this.spatialPanelGroup = group;
    const repositionDock = (viewerPose?: ArViewerPose): void => {
      if (!viewerPose) viewerCamera.updateMatrixWorld(true);
      const viewerPosition = viewerPose?.position ??
        viewerCamera.getWorldPosition(new THREE.Vector3());
      const viewerOrientation = viewerPose?.orientation ??
        viewerCamera.getWorldQuaternion(new THREE.Quaternion());
      const placement = calculateSpatialDockPlacement(
        viewerPosition,
        viewerOrientation,
        profile.distanceMeters,
        (viewportHeight / 2 - rowCenterY) / dockLayout.pixelsPerMeter,
      );
      panelParent.updateMatrixWorld(true);
      const parentWorldQuaternion = panelParent.getWorldQuaternion(new THREE.Quaternion());
      group.position.set(placement.position.x, placement.position.y, placement.position.z)
        .applyMatrix4(panelParent.matrixWorld.clone().invert());
      group.quaternion.copy(parentWorldQuaternion.invert().multiply(
        new THREE.Quaternion(
          placement.orientation.x,
          placement.orientation.y,
          placement.orientation.z,
          placement.orientation.w,
        ),
      ));
    };
    const pendingReposition = (pose: ArViewerPose): void => repositionDock(pose);
    if (this.arActive && !this.latestFramePose) {
      this.pendingSpatialDockReposition = pendingReposition;
    } else {
      repositionDock();
    }
    const keys: readonly SpatialPanelKey[] = [
      "mission",
      "particles",
      "elementInfo",
      "narration",
      ...(includeSettings ? ["settings" as const] : []),
    ];
    const currentItems = (source: SpatialPanelItems, key: SpatialPanelKey): readonly GlassPanelItem[] => {
      if (key === "settings") {
        return [
          ...source.settings,
          ...(source.arControls ?? []),
          ...(source.xrDiagnostics ?? []),
        ];
      }
      return source[key];
    };
    const labels: Readonly<Record<SpatialPanelKey, string>> = {
      mission: "Mission",
      particles: "Particles",
      elementInfo: "Element",
      narration: "Narration",
      settings: "Settings",
    };
    const initialItems = items;
    const mounts: {
      panel: ReturnType<typeof createGlassPanel>;
      selectionId?: string;
      collapsible?: boolean;
    }[] = [];
    let activeKey: SpatialPanelKey | null = "mission";
    const rowPanels = new Map<SpatialPanelKey, ReturnType<typeof createGlassPanel>>();
    let detailPanel: ReturnType<typeof createGlassPanel> | null = null;
    const detailId = "spatial-dock-detail";
    let host: ReturnType<typeof createSpatialPanelHost> | null = null;
    try {
      const rowWidthPx = dockLayout.rowWidthPx;
      const tabs = keys.map((key) => {
        const label = key === "elementInfo" ? "Element" : key === "narration" ? "Sound" : labels[key];
        return {
          key,
          panel: createGlassPanel({
            id: `spatial-dock-${key}`,
            component: "button",
            widthM: dockLayout.tabWidthPx / dockLayout.pixelsPerMeter,
            heightM: dockLayout.tabHeightMeters,
            pixelWidth: Math.round(dockLayout.tabWidthPx),
            contentPaddingPx: 0,
            surface: "uniform",
            items: [{
              kind: "button" as const,
              text: label,
              inputId: `dock:tab:${key}`,
              regionId: `dock:tab:${key}`,
              variant: "secondary" as const,
              textAlign: "center" as const,
              fontSizePx: horizonTokens.typeScale.body1.sizeDp,
              targetSizeDp: this.spatialPresentationProfile === "headset"
                ? horizonTokens.primaryHandHitTargetDp
                : horizonTokens.minimumHitTargetDp,
            }],
          }),
        };
      });
      for (const [index, { key, panel }] of tabs.entries()) {
        panel.object3d.position.set(
          (-rowWidthPx / 2 + (index + 0.5) * dockLayout.tabWidthPx) /
            dockLayout.pixelsPerMeter,
          0,
          0,
        );
        rowPanels.set(key, panel);
        mounts.push({ panel });
      }
      const detailPanelWidthM = dockLayout.detailWidthMeters;
      detailPanel = createGlassPanel({
        id: detailId,
        component: "card",
        surfaceComponent: "panel",
        widthM: detailPanelWidthM,
        heightM: detailHeightMeters,
        pixelWidth: Math.round(detailPanelWidthM * dockLayout.pixelsPerMeter),
        contentPaddingPx: 6,
        surface: "uniform",
        items: [],
      });
      const detailCenterY = dockLayout.tabHeightMeters / 2 + detailHeightMeters / 2;
      detailPanel.object3d.position.set(0, detailCenterY, 0);
      detailPanel.object3d.visible = true;
      mounts.push({
        panel: detailPanel,
      });
      let detailPage = 0;
      let hasTabTapped = false;
      let activePanelListener: ((key: SpatialPanelKey | null) => void) | null = null;
      const updateTabs = (): void => {
        for (const key of keys) {
          const panel = rowPanels.get(key);
          if (!panel) continue;
          const label = key === "elementInfo" ? "Element" : key === "narration" ? "Sound" : labels[key];
          const selected = activeKey === key;
          panel.update([{
            kind: "button",
            text: label,
            inputId: `dock:tab:${key}`,
            regionId: `dock:tab:${key}`,
            variant: selected ? "primary" : "secondary",
            selected,
            textAlign: "center",
            fontSizePx: horizonTokens.typeScale.body1.sizeDp,
            targetSizeDp: this.spatialPresentationProfile === "headset"
              ? horizonTokens.primaryHandHitTargetDp
              : horizonTokens.minimumHitTargetDp,
          }]);
        }
      };
      const decorateDetailItems = (
        key: SpatialPanelKey,
        source: SpatialPanelItems,
      ): readonly GlassPanelItem[] => {
        const content = currentItems(source, key).map((item) => {
          if (item.kind !== "button") return item;
          const variant = item.inputId === "exit-ar"
            ? "destructive" as const
            : key === "mission" && item.inputId === "lesson:check"
              ? "primary" as const
              : "secondary" as const;
          if (key !== "mission") {
            return {
              ...item,
              variant,
              ...(key === "particles" ? {
                targetSizeDp: this.spatialPresentationProfile === "headset"
                  ? horizonTokens.primaryHandHitTargetDp
                  : horizonTokens.minimumHitTargetDp,
              } : {}),
            };
          }
          const actionButton = ["lesson:check", "lesson:hint", "lesson:free-play", "atom/reset"]
            .includes(item.inputId);
          return {
            ...item,
            variant,
            ...(item.inputId === "lesson:check" && this.spatialPresentationProfile === "headset"
              ? { targetSizeDp: horizonTokens.primaryHandHitTargetDp }
              : {}),
            ...(actionButton ? { layoutGroup: "mission-actions" as const } : {}),
          };
        });
        return !hasTabTapped && key === "mission"
          ? [{ kind: "text", text: SPATIAL_DOCK_HINT, component: "tooltip" } as GlassPanelItem, ...content]
          : content;
      };
      const updateDetail = (): void => {
        if (!detailPanel) return;
        detailPanel.object3d.visible = activeKey !== null;
        if (activeKey) {
          detailPage = 0;
          const current = decorateDetailItems(activeKey, currentData);
          detailPanel.update({
            items: current,
            ...(activeKey === "settings" ? { toggles: currentData.settingsToggles } : {}),
          });
          detailPanel.setPage(0);
        } else {
          detailPage = 0;
        }
        activePanelListener?.(activeKey);
        this.render();
      };
      const panelHost = createSpatialPanelHost({
        group,
        camera: projectionCamera,
        pointerTarget: arPointerTarget ?? this.canvas,
        panels: mounts,
        enablePointerEvents: shouldEnableSpatialPanelPointerEvents(
          !this.arActive,
          this.arActive,
          this.spatialPresentationProfile,
        ),
        onPanelAction: (inputId) => {
          if (inputId === "dock:detail:previous" || inputId === "dock:detail:next") {
            const currentPage = detailPage;
            detailPanel?.setPage(currentPage + (inputId.endsWith("previous") ? -1 : 1));
            detailPage = Math.max(0, currentPage + (inputId.endsWith("previous") ? -1 : 1));
            this.render();
            return;
          }
          if (inputId.startsWith("dock:tab:")) {
            const key = inputId.slice("dock:tab:".length) as SpatialPanelKey;
            if (!keys.includes(key)) return;
            hasTabTapped = true;
            activeKey = toggleSpatialDockSelection(activeKey, key);
            updateTabs();
            updateDetail();
            return;
          }
          onPanelAction(inputId);
        },
        ...(onSpatialInput ? { onSpatialInput } : {}),
        ...(arPointerTarget
          ? {
              shouldIgnorePointerTarget: (target: EventTarget | null) =>
                target instanceof Element && target.closest(
                  "button, input, select, textarea, a, dialog, [data-ar-action], [data-camera-action]",
                ) !== null,
            }
          : {}),
      });
      host = panelHost;
      let currentData = initialItems;
      updateTabs();
      updateDetail();
      let disposed = false;
      return {
        update: (next) => {
          if (disposed) return;
          currentData = next;
          detailPage = 0;
          updateDetail();
        },
        setExpanded: (expanded) => {
          if (disposed) return;
          activeKey = expanded ? (activeKey ?? "mission") : null;
          updateTabs();
          updateDetail();
        },
        setActivePanelListener: (listener) => {
          if (disposed) return;
          activePanelListener = listener;
          listener?.(activeKey);
        },
        reposition: () => {
          if (!disposed) {
            repositionDock();
            this.render();
          }
        },
        setPointerEventsEnabled: (enabled) => {
          if (!disposed) {
            panelHost.setPointerEventsEnabled(shouldEnableSpatialPanelPointerEvents(
              enabled,
              this.arActive,
              this.spatialPresentationProfile,
            ));
          }
        },
        handleRay: (ray, phase, sourceId) => panelHost.handleRay(ray, phase, sourceId),
        setHintListener: () => undefined,
        focusPanel: (key) => {
          if (keys.includes(key as SpatialPanelKey)) {
            activeKey = key as SpatialPanelKey;
            updateTabs();
            updateDetail();
          }
        },
        dispose: () => {
          if (disposed) return;
          disposed = true;
          if (this.pendingSpatialDockReposition === pendingReposition) {
            this.pendingSpatialDockReposition = null;
          }
          if (this.spatialPanelGroup === group) this.spatialPanelGroup = null;
          panelHost.dispose();
          group.removeFromParent();
          this.render();
        },
      };
    } catch (error) {
      if (this.pendingSpatialDockReposition === pendingReposition) {
        this.pendingSpatialDockReposition = null;
      }
      if (host) {
        host.dispose();
      } else {
        for (const mount of mounts) mount.panel.dispose();
      }
      group.removeFromParent();
      throw error;
    }
  }

  private createEmptySpatialSurfaceSession(layout: SpatialSurfaceLayout): SpatialPanelSession {
    const viewerCamera = this.renderer.xr.getCamera();
    const group = new THREE.Group();
    group.name = "atom-builder-spatial-surfaces";
    const surfaces: GlassSurface[] = [];
    const parent = this.scene;

    const addSurface = (
      id: string,
      variant: "shell" | "panel" | "card",
      rect: NormalizedSpatialSurfaceRect,
    ): void => {
      const geometry = spatialSurfaceGeometry(rect, xrTokens.shellWidthMeters);
      const surface = createGlassSurface(variant, {
        width: geometry.widthMeters,
        height: geometry.heightMeters,
      });
      surface.name = `atom-builder-${id}`;
      surface.position.x = geometry.xMeters;
      surface.position.y = geometry.yMeters;
      group.add(surface);
      surfaces.push(surface);
    };

    try {
      addSurface("backing-shell", "shell", layout.shell);
      for (const panel of layout.panels) {
        addSurface(panel.id, panel.variant, panel.rect);
      }
      parent.add(group);
      this.spatialPanelGroup = group;
    } catch (error) {
      for (const surface of surfaces) disposeGlassSurface(surface);
      group.removeFromParent();
      throw error;
    }

    const reposition = (viewerPose?: ArViewerPose): void => {
      if (!viewerPose) viewerCamera.updateMatrixWorld(true);
      const viewerPosition = viewerPose?.position ??
        viewerCamera.getWorldPosition(new THREE.Vector3());
      const viewerOrientation = viewerPose?.orientation ??
        viewerCamera.getWorldQuaternion(new THREE.Quaternion());
      const placement = calculateSpatialDockPlacement(
        viewerPosition,
        viewerOrientation,
        PANEL_LIMITS.distanceMeters.default,
        0,
      );
      parent.updateMatrixWorld(true);
      const parentWorldQuaternion = parent.getWorldQuaternion(new THREE.Quaternion());
      group.position.set(placement.position.x, placement.position.y, placement.position.z)
        .applyMatrix4(parent.matrixWorld.clone().invert());
      group.quaternion.copy(parentWorldQuaternion.invert().multiply(
        new THREE.Quaternion(
          placement.orientation.x,
          placement.orientation.y,
          placement.orientation.z,
          placement.orientation.w,
        ),
      ));
    };
    const pendingReposition = (pose: ArViewerPose): void => reposition(pose);
    if (this.arActive && !this.latestFramePose) {
      this.pendingSpatialDockReposition = pendingReposition;
    } else {
      reposition(this.latestFramePose ?? undefined);
    }
    this.render();

    let disposed = false;
    return {
      update: () => undefined,
      setExpanded: () => undefined,
      setActivePanelListener: (listener) => listener?.(null),
      reposition: () => {
        if (disposed) return;
        reposition(this.latestFramePose ?? undefined);
        this.render();
      },
      setPointerEventsEnabled: () => undefined,
      handleRay: () => false,
      setHintListener: () => undefined,
      focusPanel: () => undefined,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        if (this.pendingSpatialDockReposition === pendingReposition) {
          this.pendingSpatialDockReposition = null;
        }
        if (this.spatialPanelGroup === group) this.spatialPanelGroup = null;
        group.removeFromParent();
        for (const surface of surfaces) disposeGlassSurface(surface);
        this.render();
      },
    };
  }

  /** Dispose browser observers, WebGL resources, and owned DOM nodes. */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.host.removeEventListener(SCREEN_BACKGROUND_MODE_EVENT, this.onBackgroundModeChange);
    cancelAnimationFrame(this.animationFrame);
    cancelAnimationFrame(this.resizeFrame);
    this.renderer.setAnimationLoop(null);
    this.pendingSpatialDockReposition = null;
    this.disposeVrEnvironment();
    this.resizeObserver.disconnect();
    this.reducedMotion.removeEventListener("change", this.onReducedMotionChange);
    this.atomCaptionPanel?.dispose();
    this.atomCaptionPanel = null;
    this.atomCaptionAnchor?.removeFromParent();
    this.atomCaptionAnchor = null;
    this.clearSphereMeshes();
    this.clearRingMeshes();
    this.nucleonGeometry.dispose();
    this.nucleusPickMesh.geometry.dispose();
    (this.nucleusPickMesh.material as THREE.Material).dispose();
    this.atomDropOutline.geometry.dispose();
    this.atomDropOutline.material.dispose();
    this.dragGhost.geometry.dispose();
    this.dragGhost.material.dispose();
    this.dragGhostOutline.geometry.dispose();
    this.dragGhostOutline.material.dispose();
    for (const material of this.materials.values()) {
      material.dispose();
    }
    this.materials.clear();
    this.renderer.dispose();
    this.canvas.remove();
    this.slotLayer.remove();
    this.diagnosticsElement?.remove();
    this.arReticle.geometry.dispose();
    if (Array.isArray(this.arReticle.material)) {
      for (const material of this.arReticle.material) material.dispose();
    } else {
      this.arReticle.material.dispose();
    }
  }

  private readonly resize = (): void => {
    if (!this.arActive) {
      const width = Math.max(1, this.host.clientWidth);
      const height = Math.max(1, this.host.clientHeight);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height, false);
    }
    this.positionSlotMarkers();
    this.render();
  };

  private readonly onReducedMotionChange = (): void => {
    this.startDiagnosticsLoop();
  };

  private readonly onBackgroundModeChange = (event: Event): void => {
    const transparent = (event as CustomEvent<unknown>).detail;
    if (typeof transparent !== "boolean" || this.arActive) {
      return;
    }
    this.cameraViewActive = transparent;
    this.scene.background = transparent ? null : this.screenBackground;
    this.renderer.setClearColor(0x000000, transparent ? 0 : 1);
    this.render();
  };

  private readonly onPhoneSurfaceSelect = (event: Event): void => {
    if (!this.phoneHitTestActive) return;
    const source = (event as XRInputSourceEvent).inputSource;
    if (source?.hand || (source?.targetRayMode !== "screen" && source?.targetRayMode !== "transient-pointer")) {
      return;
    }
    if (this.phoneAtomPlaced && !this.phonePlacementRepositioning) {
      this.phonePlacementRepositioning = true;
      this.arReticle.visible = shouldShowArReticle(true, true, this.lastHitTestPose !== null);
      this.render();
      return;
    }
    if (!this.phonePlacementRepositioning || !this.lastHitTestPose) return;
    const hit = this.lastHitTestPose.transform.position;
    const target = new THREE.Vector3(hit.x, hit.y, hit.z);
    const fromViewer = target.clone().sub(this.arViewerOrigin);
    const hitDistance = fromViewer.length();
    const boundedDistance = clampArPlacementDistance(hitDistance);
    if (hitDistance > 0) target.copy(this.arViewerOrigin).addScaledVector(fromViewer, boundedDistance / hitDistance);
    this.arPlacementRoot.position.copy(target);
    this.arPlacementRoot.quaternion.copy(this.arViewerOrientation);
    this.phonePlacementRepositioning = false;
    this.phoneAtomPlaced = true;
    this.arReticle.visible = false;
    this.arPlacementDistance = boundedDistance;
    this.arPlacementSide = 0;
    this.render();
  };

  private async enablePhoneHitTest(session: XRSession): Promise<void> {
    const granted = hasArHitTest(session.enabledFeatures);
    const hasTrackedController = Array.from(session.inputSources).some(
      (source) => source.targetRayMode === "tracked-pointer",
    );
    const coarsePointer = globalThis.matchMedia?.("(pointer: coarse)").matches === true;
    this.phoneHitTestActive = granted && isHandheldArSession(session as XRSession & {
      interactionMode?: "screen-space" | "world-space";
      environmentBlendMode?: "opaque" | "additive" | "alpha-blend";
    },
      hasTrackedController,
      coarsePointer,
    );
    if (!this.phoneHitTestActive) return;

    const hitTestSession = session as XRSession & {
      requestHitTestSource?: (options: { space: XRSpace }) => Promise<XRHitTestSource>;
    };
    if (!hitTestSession.requestHitTestSource) {
      this.phoneHitTestActive = false;
      return;
    }
    try {
      const viewerSpace = await session.requestReferenceSpace("viewer");
      const localSpace = this.renderer.xr.getReferenceSpace();
      if (!localSpace) {
        this.phoneHitTestActive = false;
        return;
      }
      this.hitTestReferenceSpace = localSpace;
      const hitTestSource = await hitTestSession.requestHitTestSource({ space: viewerSpace });
      if (!hitTestSource) {
        this.phoneHitTestActive = false;
        return;
      }
      this.hitTestSource = hitTestSource;
      if (!this.phoneHitTestActive) {
        hitTestSource.cancel();
        this.hitTestSource = null;
        return;
      }
      this.phonePlacementRepositioning = true;
      this.phoneAtomPlaced = false;
      session.addEventListener("select", this.onPhoneSurfaceSelect);
    } catch (error) {
      this.phoneHitTestActive = false;
      this.hitTestSource?.cancel();
      this.hitTestSource = null;
      this.hitTestReferenceSpace = null;
      throw error;
    }
  }

  private updateArPlacementFromFrame(frame: XRFrame, viewerFrame: ArFramePlacement | null): void {
    if (!viewerFrame) return;
    const viewerPosition = new THREE.Vector3(
      viewerFrame.pose.position.x,
      viewerFrame.pose.position.y,
      viewerFrame.pose.position.z,
    );
    if (this.vrEnvironment) {
      this.vrEnvironment.setViewerPosition(viewerPosition);
      if (this.vrFloorUsesViewerFallback) {
        this.vrEnvironment.setFallbackFloorFromViewer(viewerPosition.y);
        this.vrFloorUsesViewerFallback = false;
      }
    }
    if (!this.initialArPlacement) {
      const placement = viewerFrame.placement;
      this.initialArPlacement = placement;
      this.arViewerOrigin.copy(viewerPosition);
      this.arViewerOrientation.set(
        placement.orientation.x,
        placement.orientation.y,
        placement.orientation.z,
        placement.orientation.w,
      );
      this.arPlacementDistance = placement.distanceMeters;
      this.arPlacementRoot.quaternion.copy(this.arViewerOrientation);
      this.updateArPlacementPosition();
    }

    if (!this.hitTestSource || !this.hitTestReferenceSpace) return;
    const results = Array.from(frame.getHitTestResults(this.hitTestSource));
    const pose = results[0]?.getPose(this.hitTestReferenceSpace) ?? null;
    this.lastHitTestPose = pose;
    this.arReticle.visible = shouldShowArReticle(
      this.phoneHitTestActive,
      this.phonePlacementRepositioning,
      pose !== null,
    );
    if (pose) {
      const transform = pose.transform;
      this.arReticle.position.set(
        transform.position.x,
        transform.position.y,
        transform.position.z,
      );
      this.arReticle.quaternion.set(
        transform.orientation.x,
        transform.orientation.y,
        transform.orientation.z,
        transform.orientation.w,
      );
    }
  }

  private disposeVrEnvironment(): void {
    if (!this.vrEnvironment) return;
    const environment = this.vrEnvironment;
    this.vrEnvironment = null;
    this.vrFloorUsesViewerFallback = false;
    environment.dispose();
  }

  private updateArPlacementPosition(): void {
    const localPosition = new THREE.Vector3(
      this.arPlacementSide,
      -spatialLayout.arPlacement.viewerDownMeters,
      -this.arPlacementDistance,
    ).applyQuaternion(this.arViewerOrientation);
    this.arPlacementRoot.position.copy(this.arViewerOrigin).add(localPosition);
  }

  private startDiagnosticsLoop(): void {
    cancelAnimationFrame(this.animationFrame);
    if (this.diagnosticsElement && !this.reducedMotion.matches && !this.disposed && !this.arActive) {
      this.animationFrame = requestAnimationFrame(this.tick);
    }
  }

  private readonly tick = (time: number): void => {
    if (this.disposed) {
      return;
    }
    const frameTime = this.lastFrameTime === 0 ? 0 : time - this.lastFrameTime;
    this.lastFrameTime = time;
    this.render(frameTime);
    this.animationFrame = requestAnimationFrame(this.tick);
  };

  private render(frameTime = 0): void {
    if (this.disposed) {
      return;
    }
    this.updateAtomCaptionPlacement();
    this.renderer.render(this.scene, this.camera);
    if (this.diagnosticsElement) {
      this.diagnosticsElement.textContent =
        `${this.renderer.info.render.calls} calls · ${frameTime.toFixed(1)} ms · ${this.qualityTier}`;
    }
    this.publishArDiagnostics();
  }

  private updateAtomCaptionPlacement(): void {
    if (!this.atomCaptionAnchor || !this.atomCaptionPanel) return;
    this.scene.updateMatrixWorld(true);
    const atomPosition = this.atomRoot.getWorldPosition(new THREE.Vector3());
    const atomScale = this.atomRoot.getWorldScale(new THREE.Vector3());
    const modelRadius = this.currentFrame
      ? Math.max(
          this.currentFrame.nucleusRadius,
          ...this.currentFrame.rings.map((ring) => ring.radius),
          ...this.currentFrame.spheres.flatMap((batch) => batch.positions.map((position) =>
            Math.hypot(position.x, position.y, position.z) + batch.radius)),
        )
      : this.nucleusRadius;
    const heightM = 192 * horizonTokens.metresPerDp;
    const captionPosition = atomPosition.clone();
    captionPosition.y -= modelRadius * atomScale.y + heightM / 2 + 0.02;
    this.atomCaptionAnchor.position.copy(this.atomRoot.worldToLocal(captionPosition));
    const placementQuaternion = this.arPlacementRoot.getWorldQuaternion(new THREE.Quaternion());
    const placementYaw = new THREE.Euler().setFromQuaternion(placementQuaternion, "YXZ").y;
    const captionWorldQuaternion = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0, placementYaw + this.arViewTransform.yaw, 0),
    );
    this.atomCaptionAnchor.quaternion.copy(
      this.atomRoot.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(captionWorldQuaternion),
    );
    this.atomCaptionAnchor.scale.setScalar(1 / Math.max(atomScale.x, 0.0001));
  }

  private publishArDiagnostics(): void {
    if (!this.arActive || !this.arDiagnosticsListener) {
      return;
    }
    const session = this.renderer.xr.getSession();
    const position = this.atomRoot.position;
    const atomVisible = this.atomRoot.visible && this.atomRoot.children.some((child) => child.visible);
    this.arDiagnosticsListener({
      sceneBackground: this.scene.background === null ? "transparent" : "opaque",
      clearColor: `#${this.renderer.getClearColor(new THREE.Color()).getHexString()}`,
      clearAlpha: this.renderer.getClearAlpha(),
      environmentBlendMode: session?.environmentBlendMode ?? "unavailable",
      grantedFeatures: Array.from(session?.enabledFeatures ?? []),
      canvasDisplay: getComputedStyle(this.canvas).display,
      renderLoopRunning: this.xrRenderLoopRunning,
      atomVisible,
      atomInCameraView: position.z < 0 && Math.abs(position.x) < 0.6 && Math.abs(position.y) < 0.6,
      sessionAttached: session !== null && session === this.activeXRSession,
      atomPosition: { x: position.x, y: position.y, z: position.z },
      atomScaleFactor: this.arViewTransform.scaleFactor,
      atomYaw: this.arViewTransform.yaw,
      atomPitch: this.arViewTransform.pitch,
      cameraPosition: {
        x: this.camera.position.x,
        y: this.camera.position.y,
        z: this.camera.position.z,
      },
    });
  }

  private updateCamera(): void {
    const horizontalDistance = this.distance * Math.cos(this.pitch);
    this.camera.position.set(
      horizontalDistance * Math.sin(this.yaw),
      this.distance * Math.sin(this.pitch),
      horizontalDistance * Math.cos(this.yaw),
    );
    this.camera.lookAt(0, 0, 0);
    this.positionSlotMarkers();
    this.render();
  }

  private updateArAtomScale(): void {
    if (!this.arActive) {
      return;
    }
    this.atomRoot.scale.setScalar(
      (this.currentFrame ? arContentScale(this.currentFrame) : 0.675) *
        this.arViewTransform.scaleFactor,
    );
  }

  private projectedRingZones(bounds: DOMRect): ProjectedDropZone[] {
    return [...this.ringMeshes.entries()].map(([shell, mesh]) => {
      const radius = (mesh.geometry as THREE.TorusGeometry).parameters.radius;
      const outline = Array.from({ length: 96 }, (_, index) => {
        const angle = (2 * Math.PI * index) / 96;
        return this.projectToCanvas(
          new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0),
          bounds,
        );
      });
      const slots = this.slotMarkers
        .filter((slot) => slot.shell === shell && !slot.occupied)
        .map((slot) => ({
          id: slot.id,
          point: this.projectToCanvas(slot.position, bounds),
        }));
      return { target: `shell:${shell}`, outline, slots };
    });
  }

  private isNearNucleus(pointer: ScreenPoint, tolerancePx: number, viewportHeight: number): boolean {
    const bounds = this.canvas.getBoundingClientRect();
    const center = this.projectToCanvas(new THREE.Vector3(), bounds);
    this.camera.updateMatrixWorld();
    const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const toleranceWorld = screenPixelsToWorldUnits(
      tolerancePx,
      Math.max(0.1, this.distance - this.nucleusRadius),
      this.camera.fov,
      viewportHeight,
    );
    const edge = this.projectToCanvas(
      cameraRight.multiplyScalar(this.nucleusRadius + toleranceWorld),
      bounds,
    );
    const projectedRadius = Math.hypot(edge.x - center.x, edge.y - center.y);
    const near = Math.hypot(pointer.x - center.x, pointer.y - center.y) <= projectedRadius;
    const material = this.nucleusPickMesh.material as THREE.MeshBasicMaterial;
    material.opacity = near && this.dragParticle !== "electron" ? 0.34 : 0;
    return near;
  }

  private projectToCanvas(point: THREE.Vector3, bounds: DOMRect): ScreenPoint {
    const projected = point.clone().project(this.camera);
    return {
      x: (projected.x * 0.5 + 0.5) * bounds.width,
      y: (-projected.y * 0.5 + 0.5) * bounds.height,
    };
  }

  private positionSlotMarkers(): void {
    if (this.slotMarkers.length === 0) {
      return;
    }
    const bounds = this.canvas.getBoundingClientRect();
    for (const slot of this.slotMarkers) {
      const point = this.projectToCanvas(slot.position, bounds);
      slot.element.style.left = `${point.x}px`;
      slot.element.style.top = `${point.y}px`;
      slot.element.hidden = slot.occupied;
    }
  }

  private updateDropHighlight(target: string | null, slotId: string | null): void {
    for (const [shell, mesh] of this.ringMeshes) {
      const material = mesh.material as THREE.MeshBasicMaterial;
      const active = target === `shell:${shell}`;
      material.color.set(active ? 0xf0b323 : shell % 2 === 0 ? 0x178b87 : 0x5b6e9b);
      material.opacity = this.dragParticle && !active ? 0.42 : active ? 0.95 : 0.72;
    }
    for (const slot of this.slotMarkers) {
      slot.element.classList.toggle(
        "is-active",
        target === `shell:${slot.shell}` && slot.id === slotId,
      );
    }
    const nucleusMaterial = this.nucleusPickMesh.material as THREE.MeshBasicMaterial;
    if (target !== "nucleus") {
      nucleusMaterial.opacity = 0;
    }
    this.render();
  }

  private materialFor(color: number): THREE.MeshStandardMaterial {
    let material = this.materials.get(color);
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.02 });
      this.materials.set(color, material);
    }
    return material;
  }

  private clearSphereMeshes(): void {
    for (const mesh of this.sphereMeshes) {
      this.atomRoot.remove(mesh);
    }
    this.sphereMeshes.length = 0;
    this.interactiveMeshes.splice(0, this.interactiveMeshes.length, this.nucleusPickMesh);
  }

  private clearRingMeshes(): void {
    for (const mesh of this.ringMeshes.values()) {
      this.atomRoot.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.ringMeshes.clear();
    for (const slot of this.slotMarkers) {
      slot.element.remove();
    }
    this.slotMarkers.length = 0;
    this.interactiveMeshes.splice(0, this.interactiveMeshes.length, this.nucleusPickMesh);
  }
}