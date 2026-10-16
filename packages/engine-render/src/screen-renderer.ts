import * as THREE from "three";
import type { InputAction } from "@mma/engine-input";
import { horizonTokens } from "./horizon-tokens.js";
import {
  spatialLayout,
  spatialSurfaceGeometry,
  type NormalizedSpatialSurfaceRect,
} from "./spatial-layout.js";
import {
  dpToMeters,
  MODEL_STAGE,
  ANDROID_CAMERA_FOV_DEGREES,
  ANDROID_PANEL_LIMITS,
  LOOK_LIMITS,
  PANEL_LIMITS,
  xrTokens,
} from "./xr-tokens.js";
import {
  cameraDragLookDelta,
  calculateCameraLookLimits,
  deviceOrientationQuaternion,
  relativeDeviceLookAngles,
  softClampCameraAngle,
  type CameraLookLimits,
  type DeviceOrientationSample,
} from "./visuals/camera-look-around.js";
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
  calculatePanelGroupPlacement,
  calculatePanelGroupPosition,
  applyPanelGroupScale,
  calculateSpatialLayoutLookAngles,
  clampPanelGroupDistance,
  clampPanelGroupScale,
  selectSpatialLayoutName,
  selectSpatialPresentationProfile,
  shouldEnableSpatialPanelPointerEvents,
  toggleSpatialDockSelection,
  type SpatialPresentationProfile,
  type PanelGroupLimits,
  type SpatialPanelKey,
} from "./visuals/spatial-placement.js";
import { createSpatialPanelHost } from "./visuals/spatial-panel-host.js";
import type {
  SpatialPointerEvent,
  SpatialPointerTarget,
} from "./visuals/spatial-pointer.js";
import {
  calculateModelStageLayout,
  modelFitsStageArea,
  nearestModelSurfaceDistance,
  panModelStage,
  resetModelStagePose,
  rotateModelStage,
  zoomModelStage,
  type ModelStageBindingLimit,
  type ModelStageLayout,
  type ModelStagePose,
} from "./visuals/model-stage.js";
import {
  createSpatialProgressBar,
  createSpatialPropertyRow,
  createSpatialStepper,
  createSpatialText,
  createSpatialButton,
  type SpatialButton,
  type SpatialProgressBar,
  type SpatialPrimitive,
  type SpatialStepper,
  type SpatialText,
} from "./visuals/spatial-primitives.js";
import { createSpatialSlider, type SpatialSlider } from "./visuals/spatial-slider.js";
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
  readonly bento: SpatialPanelGroupContent;
  readonly arControls?: readonly GlassPanelItem[];
  readonly xrDiagnostics?: readonly GlassPanelItem[];
  readonly settings: readonly GlassPanelItem[];
  readonly settingsToggles: Readonly<Record<string, boolean>>;
}

/** Typed live content rendered inside the measured immersive panel group. */
export interface SpatialPanelGroupContent {
  readonly header?: Readonly<{ brand: string; title: string }>;
  readonly model: Readonly<{
    readonly caption: string;
    readonly captionsLabel: string;
    readonly captionsAction: string;
    readonly captionsEnabled: boolean;
    readonly speedOptions: readonly Readonly<{
      value: string;
      label: string;
      selected: boolean;
    }>[];
    readonly narrationLabel: string;
    readonly narrationAction: string;
    readonly narrationEnabled: boolean;
    readonly enableLabel: string;
    readonly enableAction: string;
    readonly enableVisible: boolean;
    readonly enableDisabled: boolean;
    readonly replayLabel: string;
    readonly replayAction: string;
    readonly replayDisabled: boolean;
  }>;
  readonly particles: readonly Readonly<{
    label: string;
    value: number;
    color: string;
    addAction: string;
    removeAction: string;
    min: number;
    max?: number;
  }>[];
  readonly particleHeading: string;
  readonly particleInstruction: string;
  readonly element: Readonly<{
    symbol: string;
    name: string;
    number: string;
    properties: readonly Readonly<{ label: string; value: string }>[];
  }>;
  readonly mission: Readonly<{
    view: "lesson" | "summary" | "free-play";
    step: string;
    title: string;
    body: string;
    hint: string;
    progressValue: number;
    progressMax: number;
    hintAction: string;
    hintLabel: string;
    hintDisabled: boolean;
    checkAction: string;
    checkLabel: string;
    checkDisabled: boolean;
    freePlayAction: string;
    freePlayLabel: string;
    summaryTitle: string;
    summaryDetails: string;
    freePlayText: string;
    resetAction: string;
    resetLabel: string;
  }>;
  readonly hints: Readonly<{ label: string; text: string }>;
  readonly resetViewLabel: string;
  readonly controls: Readonly<{ positionLabel: string; scaleLabel: string }>;
}

export interface SpatialPanelSession {
  update(items: SpatialPanelItems): void;
  setExpanded(expanded: boolean): void;
  setActivePanelListener(listener: ((key: SpatialPanelKey | null) => void) | null): void;
  /** Re-place the dock from the viewer's current heading and gaze. */
  reposition(): void;
  /** Suspend browser pointer interception while an immersive session owns input. */
  setPointerEventsEnabled(enabled: boolean): void;
  handleRay(
    ray: THREE.Ray,
    phase: "move" | "down" | "up" | "cancel",
    sourceId?: string,
    source?: "controller" | "hand",
    gestureMode?: "rotate" | "pan",
    zoomDelta?: number,
  ): boolean;
  setHintListener(listener: ((hints: readonly SpatialPanelEdgeHint[]) => void) | null): void;
  focusPanel(key: SpatialPanelEdgeHint["key"]): void;
  dispose(): void;
}

export interface SpatialSurfaceLayout {
  readonly shell: NormalizedSpatialSurfaceRect;
  readonly regions: Readonly<Record<string, NormalizedSpatialSurfaceRect>>;
  readonly panels: readonly Readonly<{
    id: string;
    variant: "panel" | "card";
    rect: NormalizedSpatialSurfaceRect;
  }>[];
  readonly controls: Readonly<{
    readonly hintButton?: NormalizedSpatialSurfaceRect;
    readonly checkButton?: NormalizedSpatialSurfaceRect;
    readonly freePlayButton?: NormalizedSpatialSurfaceRect;
    readonly futureLogoSlot: NormalizedSpatialSurfaceRect;
    readonly positionSliderTrack: NormalizedSpatialSurfaceRect;
    readonly scaleSliderTrack: NormalizedSpatialSurfaceRect;
    readonly resetViewButton: NormalizedSpatialSurfaceRect;
    readonly resetAtomButton: NormalizedSpatialSurfaceRect;
    readonly positionSliderOrientation?: "horizontal" | "vertical";
    readonly scaleSliderOrientation?: "horizontal" | "vertical";
  }>;
}

export interface SpatialSurfaceLayouts {
  readonly headset: SpatialSurfaceLayout;
  readonly android: SpatialSurfaceLayout;
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
  androidCameraLayout = false,
): void {
  host.dispatchEvent(new CustomEvent(SCREEN_BACKGROUND_MODE_EVENT, {
    detail: androidCameraLayout ? { transparent, androidCameraLayout } : transparent,
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
  readonly panelGroupWorldScale?: Position3 | null;
  readonly panelGroupWorldRotation?: Readonly<{ x: number; y: number; z: number; w: number }> | null;
  readonly panelGroupDistanceMeters?: number | null;
  readonly panelGroupSliderValues?: Readonly<{ positionMeters: number; scale: number }> | null;
  readonly cameraLookAngles?: Readonly<{ yawDegrees: number; pitchDegrees: number }> | null;
  readonly cameraLookLimits?: Readonly<{ yawDegrees: number; pitchDegrees: number }> | null;
  readonly cameraFitsAtMinimumScale?: Readonly<{ portrait: boolean; landscape: boolean }> | null;
  readonly activeSpatialLayout?: "headset" | "android" | null;
  readonly spatialLayoutLimits?: Readonly<{
    scale: Readonly<{ min: number; default: number; max: number }>;
    distanceMeters: Readonly<{ min: number; default: number; max: number }>;
  }> | null;
  readonly spatialLayoutLookAngles?: Readonly<{
    leftDegrees: number;
    rightDegrees: number;
    upDegrees: number;
    downDegrees: number;
  }> | null;
  readonly spatialLayoutFitsAtMinimumScale?: boolean | null;
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
  readonly modelStage?: Readonly<{
    readonly position: Position3;
    readonly rotation: Readonly<{ x: number; y: number; z: number; w: number }>;
    readonly zoom: number;
    readonly nearestSurfaceDistanceMeters: number | null;
    readonly bindingLimit: ModelStageBindingLimit;
    readonly relativeToModelPanelCenter: Position3;
    readonly fitsInsideModelArea: boolean;
  }> | null;
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
  private readonly subpartHighlightGeometry = new THREE.SphereGeometry(1, 16, 12);
  private readonly subpartHighlightMaterial = new THREE.MeshBasicMaterial({
    color: 0x83e5b4,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    side: THREE.DoubleSide,
    wireframe: true,
  });
  private readonly subpartHighlightMesh = new THREE.Mesh(
    this.subpartHighlightGeometry,
    this.subpartHighlightMaterial,
  );
  private readonly hoveredAtomSubparts = new Map<string, {
    readonly object: THREE.Object3D;
    readonly instanceId: number | null;
  }>();
  private selectedAtomSubpart: {
    readonly object: THREE.Object3D;
    readonly instanceId: number | null;
  } | null = null;
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
  private androidCameraLayoutActive = false;
  private cameraLookYaw = 0;
  private cameraLookPitch = 0;
  private cameraLookLimits: CameraLookLimits | null = null;
  private cameraOrientationBaseline: THREE.Quaternion | null = null;
  private cameraDragPosition: Readonly<{ x: number; y: number }> | null = null;
  private currentFrame: ScreenSceneFrame | null = null;
  private activeXRSession: XRSession | null = null;
  private activeXRMode: "immersive-ar" | "immersive-vr" | null = null;
  private activeXRReferenceSpaceType: "local" | "local-floor" | null = null;
  private spatialPresentationProfile: SpatialPresentationProfile = "handheld";
  private firstFramePoseWasNull: boolean | null = null;
  private firstNonNullViewerPose: ArViewerPose | null = null;
  private latestFramePose: ArViewerPose | null = null;
  private panelGroupSliderValues: { positionMeters: number; scale: number } | null = null;
  private latestViewCount: number | null = null;
  private framesRendered = 0;
  private spatialPanelGroup: THREE.Group | null = null;
  private activeSpatialLayout: "headset" | "android" | null = null;
  private activeSpatialSurfaceLayout: SpatialSurfaceLayout | null = null;
  private modelStage: THREE.Group | null = null;
  private modelStageLayout: ModelStageLayout | null = null;
  private modelStagePose: ModelStagePose | null = null;
  private modelStageBindingLimit: ModelStageBindingLimit = null;
  private modelPanelCenter: Position3 | null = null;
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
    this.subpartHighlightMesh.name = "atom-subpart-highlight";
    this.subpartHighlightMesh.visible = false;
    this.subpartHighlightMesh.renderOrder = 31;
    this.atomRoot.add(this.subpartHighlightMesh);
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
    this.hoveredAtomSubparts.clear();
    this.selectedAtomSubpart = null;
    this.subpartHighlightMesh.visible = false;
    this.subpartHighlightMesh.geometry = this.subpartHighlightGeometry;
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
    if (this.modelStage) {
      this.atomRoot.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.renderOrder = object === this.subpartHighlightMesh ? 31 : 30;
        }
      });
    }
    if (this.arActive) {
      if (this.modelStageLayout) {
        this.atomRoot.scale.setScalar(this.modelStageLayout.fitRadius / this.atomBoundingRadius);
      } else {
        this.atomRoot.scale.setScalar(
          arContentScale(frame) * this.arViewTransform.scaleFactor,
        );
      }
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
    const panelGroup = this.spatialPanelGroup;
    panelGroup?.updateWorldMatrix(true, false);
    const panelWorld = panelGroup?.getWorldPosition(new THREE.Vector3()) ?? null;
    const panelWorldScale = panelGroup?.getWorldScale(new THREE.Vector3()) ?? null;
    const panelWorldRotation = panelGroup?.getWorldQuaternion(new THREE.Quaternion()) ?? null;
    const viewerPose = this.latestFramePose;
    let panelGroupDistanceMeters: number | null = null;
    if (panelWorld) {
      const viewerPosition = viewerPose
        ? new THREE.Vector3(viewerPose.position.x, viewerPose.position.y, viewerPose.position.z)
        : this.androidCameraLayoutActive
          ? this.camera.getWorldPosition(new THREE.Vector3())
          : this.renderer.xr.isPresenting
            ? this.renderer.xr.getCamera().getWorldPosition(new THREE.Vector3())
            : null;
      if (viewerPosition) panelGroupDistanceMeters = viewerPosition.distanceTo(panelWorld);
    }
    const spatialLayoutLimits = this.activeSpatialLayout === "android"
      ? ANDROID_PANEL_LIMITS
      : this.activeSpatialLayout === "headset"
        ? PANEL_LIMITS
        : null;
    const activeModelPanel = this.activeSpatialSurfaceLayout?.panels.find(
      ({ id }) => id === "model-panel",
    );
    const xrCamera = this.renderer.xr.getCamera();
    const projectionCamera = this.androidCameraLayoutActive
      ? this.camera
      : xrCamera instanceof THREE.ArrayCamera
        ? xrCamera.cameras[0] ?? xrCamera
        : xrCamera;
    const projectionX = projectionCamera.projectionMatrix.elements[0]!;
    const projectionY = projectionCamera.projectionMatrix.elements[5]!;
    const spatialLayoutLookAngles = this.activeSpatialSurfaceLayout && activeModelPanel &&
      spatialLayoutLimits && projectionX > 0 && projectionY > 0
      ? calculateSpatialLayoutLookAngles(
          {
            shell: this.activeSpatialSurfaceLayout.shell,
            modelPanel: activeModelPanel.rect,
          },
          xrTokens.shellWidthMeters,
          this.panelGroupSliderValues?.positionMeters ?? spatialLayoutLimits.distanceMeters.default,
          this.panelGroupSliderValues?.scale ?? spatialLayoutLimits.scale.default,
          projectionX,
          projectionY,
        )
      : null;
    const spatialLayoutMinimumScaleFit = this.activeSpatialSurfaceLayout && activeModelPanel &&
      spatialLayoutLimits && projectionX > 0 && projectionY > 0
      ? calculateSpatialLayoutLookAngles(
          {
            shell: this.activeSpatialSurfaceLayout.shell,
            modelPanel: activeModelPanel.rect,
          },
          xrTokens.shellWidthMeters,
          spatialLayoutLimits.distanceMeters.default,
          spatialLayoutLimits.scale.min,
          projectionX,
          projectionY,
        ).fitsInView
      : null;
    const cameraFitsAtMinimumScale = this.androidCameraLayoutActive &&
      this.activeSpatialSurfaceLayout && activeModelPanel
      ? (() => {
          const projectionY = 1 / Math.tan(
            THREE.MathUtils.degToRad(ANDROID_CAMERA_FOV_DEGREES) / 2,
          );
          const fits = (aspect: number): boolean =>
            calculateSpatialLayoutLookAngles(
              {
                shell: this.activeSpatialSurfaceLayout!.shell,
                modelPanel: activeModelPanel.rect,
              },
              xrTokens.shellWidthMeters,
              ANDROID_PANEL_LIMITS.distanceMeters.default,
              ANDROID_PANEL_LIMITS.scale.min,
              projectionY / aspect,
              projectionY,
            ).fitsInView;
          return { portrait: fits(412 / 915), landscape: fits(915 / 412) };
        })()
      : null;
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
    const modelStageDiagnostics = this.modelStage && this.modelStageLayout &&
      this.modelStagePose && this.modelPanelCenter
      ? (() => {
          this.modelStage.updateWorldMatrix(true, false);
          const stageWorldPosition = this.modelStage.getWorldPosition(new THREE.Vector3());
          const viewerPosition = this.renderer.xr.getCamera()
            .getWorldPosition(new THREE.Vector3());
          const groupScale = this.modelStage.parent?.scale.x ?? 1;
          const nearestSurfaceDistanceMeters = nearestModelSurfaceDistance(
            viewerPosition.distanceTo(stageWorldPosition),
            this.modelStageLayout!.fitRadius,
            groupScale,
            this.modelStagePose!.zoom,
          );
          return {
            position: { ...this.modelStagePose!.position },
            rotation: { ...this.modelStagePose!.rotation },
            zoom: this.modelStagePose!.zoom,
            nearestSurfaceDistanceMeters,
            bindingLimit: this.modelStageBindingLimit,
            relativeToModelPanelCenter: {
              x: this.modelStagePose!.position.x - this.modelPanelCenter!.x,
              y: this.modelStagePose!.position.y - this.modelPanelCenter!.y,
              z: this.modelStagePose!.position.z - this.modelPanelCenter!.z,
            },
            fitsInsideModelArea: modelFitsStageArea(
              this.modelStageLayout!,
              groupScale,
              this.modelStagePose!.zoom,
              this.modelStagePose!.position,
            ),
          };
        })()
      : null;
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
      panelGroupWorldScale: panelWorldScale
        ? { x: panelWorldScale.x, y: panelWorldScale.y, z: panelWorldScale.z }
        : null,
      panelGroupWorldRotation: panelWorldRotation
        ? {
          x: panelWorldRotation.x,
          y: panelWorldRotation.y,
          z: panelWorldRotation.z,
          w: panelWorldRotation.w,
        }
        : null,
      panelGroupDistanceMeters,
      panelGroupSliderValues: this.panelGroupSliderValues,
      cameraLookAngles: this.androidCameraLayoutActive
        ? {
            yawDegrees: THREE.MathUtils.radToDeg(this.cameraLookYaw),
            pitchDegrees: THREE.MathUtils.radToDeg(this.cameraLookPitch),
          }
        : null,
      cameraLookLimits: this.cameraLookLimits
        ? {
            yawDegrees: THREE.MathUtils.radToDeg(this.cameraLookLimits.yawRadians),
            pitchDegrees: THREE.MathUtils.radToDeg(this.cameraLookLimits.pitchRadians),
          }
        : null,
      cameraFitsAtMinimumScale,
      activeSpatialLayout: this.activeSpatialLayout,
      spatialLayoutLimits,
      spatialLayoutLookAngles: spatialLayoutLookAngles
        ? {
            leftDegrees: spatialLayoutLookAngles.leftDegrees,
            rightDegrees: spatialLayoutLookAngles.rightDegrees,
            upDegrees: spatialLayoutLookAngles.upDegrees,
            downDegrees: spatialLayoutLookAngles.downDegrees,
          }
        : null,
      spatialLayoutFitsAtMinimumScale: spatialLayoutMinimumScaleFit,
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
      modelStage: modelStageDiagnostics,
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

  /** Restore the screen camera or immersive ModelStage view without changing atom state. */
  resetView(): void {
    if (this.androidCameraLayoutActive) this.resetCameraViewLookAround();
    if (this.resetModelStageView()) return;
    this.yaw = 0;
    this.pitch = 0;
    this.distance = screenZoomConfig.defaultDistance;
    this.updateCamera();
  }

  /** Update the Android Camera view from a device orientation relative to its initial pose. */
  updateCameraViewOrientation(sample: DeviceOrientationSample): void {
    if (!this.androidCameraLayoutActive) return;
    const orientation = deviceOrientationQuaternion(sample);
    if (!this.cameraOrientationBaseline) {
      this.cameraOrientationBaseline = orientation;
      return;
    }
    const look = relativeDeviceLookAngles(this.cameraOrientationBaseline, orientation);
    this.setCameraLookAngles(look.yawRadians, look.pitchRadians);
  }

  /** Rebase the device orientation after a screen rotation without moving the view. */
  rebaseCameraViewOrientation(): void {
    this.cameraOrientationBaseline = null;
  }

  /** Recenter Camera view look-around and the ModelStage through Reset View. */
  resetCameraViewLookAround(): void {
    this.cameraLookYaw = 0;
    this.cameraLookPitch = 0;
    this.cameraOrientationBaseline = null;
    this.cameraDragPosition = null;
    this.applyCameraLookToCamera();
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

  /** Restore the initial AR placement, or the immersive ModelStage view when active. */
  resetArView(): void {
    if (this.resetModelStageView()) return;
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
    emptySurfaceLayout?: SpatialSurfaceLayout | SpatialSurfaceLayouts,
  ): SpatialPanelSession {
    if (!canCreateSpatialPanels(this.arActive, this.cameraViewActive)) {
      throw new Error("Spatial panels require an active AR or camera-view presentation.");
    }
    if (emptySurfaceLayout && (
      this.arActive ||
      (this.cameraViewActive && this.androidCameraLayoutActive)
    )) {
      const layoutName = selectSpatialLayoutName(this.spatialPresentationProfile, this.arActive || this.androidCameraLayoutActive);
      const layout = "android" in emptySurfaceLayout
        ? emptySurfaceLayout[layoutName]
        : emptySurfaceLayout;
      return this.createSpatialBentoSession(
        items,
        layout,
        layoutName,
        onPanelAction,
        arPointerTarget ?? this.canvas,
        onSpatialInput,
      );
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
        handleRay: (ray, phase, sourceId, source, gestureMode, zoomDelta) =>
          panelHost.handleRay(ray, phase, sourceId, source, gestureMode, zoomDelta),
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

  private createSpatialBentoSession(
    initialItems: SpatialPanelItems,
    layout: SpatialSurfaceLayout,
    layoutName: "headset" | "android",
    onPanelAction: (inputId: string) => void,
    pointerTarget: HTMLElement,
    onSpatialInput?: (action: InputAction) => void,
  ): SpatialPanelSession {
    const viewerCamera = this.cameraViewActive
      ? this.camera
      : this.renderer.xr.getCamera();
    const camera = viewerCamera instanceof THREE.ArrayCamera
      ? viewerCamera.cameras[0] ?? viewerCamera
      : viewerCamera;
    const panelLimits: PanelGroupLimits = layoutName === "android"
      ? ANDROID_PANEL_LIMITS
      : PANEL_LIMITS;
    const group = new THREE.Group();
    group.name = "atom-builder-panel-group";
    applyPanelGroupScale(group, panelLimits.scale.default, panelLimits);
    group.visible = false;
    const parent = this.scene;
    const surfaces: GlassSurface[] = [];
    const primitives: SpatialPrimitive[] = [];
    const propertyRows: SpatialPrimitive[] = [];
    const sliders: SpatialSlider[] = [];
    const pointerTargets: SpatialPointerTarget[] = [];
    const buttons = new Map<string, SpatialButton>();
    const steppers = new Map<string, SpatialStepper>();
    const particleValues = new Map<string, number>();
    const particleMeshes: THREE.Mesh<THREE.SphereGeometry, THREE.MeshPhongMaterial>[] = [];
    const propertyRegionIds = [
      "propertyRowAtomicNumber",
      "propertyRowMassNumber",
      "propertyRowCharge",
      "propertyRowElectronicConfiguration",
      "propertyRowOuterShell",
    ] as const;
    const positionDistance = panelLimits.distanceMeters.default;
    let distanceMeters = positionDistance;
    let scale = panelLimits.scale.default;
    let currentItems = initialItems;
    let initialViewerPosition: THREE.Vector3 | null = null;
    let initialForward: THREE.Vector3 | null = null;
    const heightOffset = layoutName === "android"
      ? 0
      : xrTokens.placement.heightOffsetMeters;
    let swatchGeometry: THREE.SphereGeometry | null = null;
    let progressBar: SpatialProgressBar | null = null;
    let brandText: SpatialText | null = null;
    let moduleTitleText: SpatialText | null = null;
    let brandPlate: GlassSurface | null = null;
    let moduleTitlePlate: GlassSurface | null = null;
    let captionText: SpatialText | null = null;
    let captionSurface: GlassSurface | null = null;
    let elementSymbolText: SpatialText | null = null;
    let elementNameText: SpatialText | null = null;
    let elementNumberText: SpatialText | null = null;
    let missionStepText: SpatialText | null = null;
    let missionTitleText: SpatialText | null = null;
    let missionBodyText: SpatialText | null = null;
    let missionHintText: SpatialText | null = null;
    let hintsLabelText: SpatialText | null = null;
    let hintsBodyText: SpatialText | null = null;

    const modelPanel = layout.panels.find(({ id }) => id === "model-panel");
    if (!modelPanel) throw new Error("Atom Builder reference layout is missing the model panel.");
    const unshiftedModelGeometry = spatialSurfaceGeometry(
      modelPanel.rect,
      xrTokens.shellWidthMeters,
    );
    const layoutOriginOffset = layoutName === "android"
      ? { x: unshiftedModelGeometry.xMeters, y: unshiftedModelGeometry.yMeters }
      : { x: 0, y: 0 };
    const geometryFor = (rect: NormalizedSpatialSurfaceRect) => {
      const geometry = spatialSurfaceGeometry(rect, xrTokens.shellWidthMeters);
      return {
        ...geometry,
        xMeters: geometry.xMeters - layoutOriginOffset.x,
        yMeters: geometry.yMeters - layoutOriginOffset.y,
      };
    };
    const regionFor = (id: string): NormalizedSpatialSurfaceRect => {
      const rect = layout.regions[id];
      if (!rect) {
        throw new Error(`Atom Builder reference layout is missing the ${id} content region.`);
      }
      return rect;
    };
    const rawStageLayout = calculateModelStageLayout(
      regionFor("modelArea"),
      ["captionTextArea", "captionsOn", "speedChip1x", "narrationOn", "replay"]
        .flatMap((id) => {
          const region = layout.regions[id];
          if (!region) return [];
          const panelRect = modelPanel.rect;
          const isInsideModelPanel =
            region.x >= panelRect.x &&
            region.y >= panelRect.y &&
            region.x + region.width <= panelRect.x + panelRect.width &&
            region.y + region.height <= panelRect.y + panelRect.height;
          return isInsideModelPanel ? [region] : [];
        }),
      xrTokens.shellWidthMeters,
      this.atomBoundingRadius,
    );
    const stageLayout = layoutName === "android"
      ? {
          ...rawStageLayout,
          safeRect: {
            ...rawStageLayout.safeRect,
            x: rawStageLayout.safeRect.x - layoutOriginOffset.x / xrTokens.shellWidthMeters,
            y: rawStageLayout.safeRect.y + layoutOriginOffset.y / xrTokens.shellWidthMeters,
          },
          home: {
            ...rawStageLayout.home,
            x: rawStageLayout.home.x - layoutOriginOffset.x,
            y: rawStageLayout.home.y - layoutOriginOffset.y,
          },
        }
      : rawStageLayout;
    const modelPanelGeometry = geometryFor(modelPanel.rect);
    const stage = new THREE.Group();
    stage.name = "atom-builder-model-stage";
    const stagePose = resetModelStagePose(stageLayout.home);
    stage.position.set(stagePose.position.x, stagePose.position.y, stagePose.position.z);
    stage.quaternion.set(
      stagePose.rotation.x,
      stagePose.rotation.y,
      stagePose.rotation.z,
      stagePose.rotation.w,
    );
    stage.scale.setScalar(stagePose.zoom);
    const stageLighting = new THREE.Group();
    stageLighting.name = "atom-builder-model-stage-lighting";
    const stageHemisphere = new THREE.HemisphereLight(0xffffff, 0x475059, 1.15);
    const stageKey = new THREE.DirectionalLight(0xffffff, 1.8);
    stageKey.position.set(-0.8, 1.2, 1.6);
    stageLighting.add(stageHemisphere, stageKey);
    stage.add(stageLighting);
    group.add(stage);
    stage.add(this.atomRoot);
    this.atomRoot.position.set(0, 0, 0);
    this.atomRoot.rotation.set(0, 0, 0);
    this.atomRoot.scale.setScalar(stageLayout.fitScale);
    this.modelStage = stage;
    this.modelStageLayout = stageLayout;
    this.modelStagePose = stagePose;
    this.modelStageBindingLimit = null;
    this.modelPanelCenter = {
      x: modelPanelGeometry.xMeters,
      y: modelPanelGeometry.yMeters,
      z: 0,
    };
    const stageInputPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(
        geometryFor(stageLayout.safeRect).widthMeters,
        geometryFor(stageLayout.safeRect).heightMeters,
      ),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        colorWrite: false,
        depthWrite: false,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0,
      }),
    );
    stageInputPlane.name = "atom-builder-model-stage-input";
    stageInputPlane.position.z = MODEL_STAGE.inputPlaneDepthMeters;
    stageInputPlane.renderOrder = 29;
    let modelStagePointerEvent: NonNullable<SpatialPointerTarget["onPointerEvent"]> = () => undefined;
    const stagePointerTarget: SpatialPointerTarget = {
      id: "model-stage",
      object3d: stageInputPlane,
      disabled: false,
      onPointerEvent: (event) => modelStagePointerEvent(event),
      setState: () => undefined,
    };
    stage.add(stageInputPlane);
    pointerTargets.push(stagePointerTarget);
    const modelStageScale = (): number => group.scale.x;
    const viewerDistance = (): number => {
      const xrViewerCamera = this.renderer.xr.getCamera();
      xrViewerCamera.updateMatrixWorld(true);
      return xrViewerCamera.getWorldPosition(new THREE.Vector3())
        .distanceTo(stage.getWorldPosition(new THREE.Vector3()));
    };
    const applyStagePose = (
      pose: ModelStagePose,
      bindingLimit: ModelStageBindingLimit,
    ): void => {
      stage.position.set(pose.position.x, pose.position.y, pose.position.z);
      stage.quaternion.set(
        pose.rotation.x,
        pose.rotation.y,
        pose.rotation.z,
        pose.rotation.w,
      );
      stage.scale.setScalar(pose.zoom);
      this.modelStagePose = pose;
      this.modelStageBindingLimit = bindingLimit;
      this.render();
    };
    const zoomStage = (delta: number): void => {
      const pose = this.modelStagePose;
      if (!pose) return;
      const result = zoomModelStage(
        pose,
        delta,
        viewerDistance(),
        stageLayout.fitRadius,
        modelStageScale(),
      );
      applyStagePose(result.pose, result.bindingLimit);
    };
    modelStagePointerEvent = (event) => {
      if (event.type === "enter" || event.type === "leave") return;
      if (event.type === "up") {
        modelPointerPositions.delete(event.sourceId);
        return;
      }
      if (event.type !== "down" && event.type !== "drag") return;
      if (event.zoomDelta !== undefined) {
        zoomStage(event.zoomDelta * MODEL_STAGE.zoomPerMeter);
        return;
      }
      if (!event.point || !event.ray) return;
      const worldPoint = new THREE.Vector3(
        event.point.x,
        event.point.y,
        event.point.z,
      );
      const localPoint = stage.worldToLocal(worldPoint.clone());
      const groupLocalPoint = group.worldToLocal(worldPoint);
      const drag = modelPointerPositions.get(event.sourceId);
      const requestedMode = event.gestureMode ??
        (event.button === 2 || event.shiftKey ? "pan" : "rotate");
      if (event.type === "down" || !drag) {
        modelPointerPositions.set(event.sourceId, {
          local: localPoint,
          groupLocal: groupLocalPoint,
          mode: requestedMode,
          source: event.source,
          clientX: event.clientX ?? 0,
          clientY: event.clientY ?? 0,
        });
        return;
      }
      const delta = localPoint.clone().sub(drag.local);
      const groupDelta = groupLocalPoint.clone().sub(drag.groupLocal);
      drag.local.copy(localPoint);
      drag.groupLocal.copy(groupLocalPoint);
      const previousClient = { x: drag.clientX, y: drag.clientY };
      drag.clientX = event.clientX ?? drag.clientX;
      drag.clientY = event.clientY ?? drag.clientY;
      const currentPose = this.modelStagePose;
      if (!currentPose) return;
      if (drag.source === "touch") {
        const otherTouch = [...modelPointerPositions.entries()]
          .find(([sourceId, pointer]) => sourceId !== event.sourceId && pointer.source === "touch");
        if (otherTouch) {
          const [, other] = otherTouch;
          const beforeDistance = Math.hypot(
            previousClient.x - other.clientX,
            previousClient.y - other.clientY,
          );
          const afterDistance = Math.hypot(
            drag.clientX - other.clientX,
            drag.clientY - other.clientY,
          );
          const zoomDelta = beforeDistance > 0
            ? (afterDistance / beforeDistance - 1) * currentPose.zoom
            : 0;
          const pan = panModelStage(currentPose, groupDelta.x / 2, groupDelta.y / 2);
          const zoomed = zoomModelStage(
            pan.pose,
            zoomDelta,
            viewerDistance(),
            stageLayout.fitRadius,
            modelStageScale(),
          );
          applyStagePose(zoomed.pose, zoomed.bindingLimit ?? pan.bindingLimit);
          return;
        }
      }
      if (drag.mode === "pan") {
        const result = panModelStage(currentPose, groupDelta.x, groupDelta.y);
        applyStagePose(result.pose, result.bindingLimit);
      } else {
        const rotation = rotateModelStage(
          new THREE.Quaternion(
            currentPose.rotation.x,
            currentPose.rotation.y,
            currentPose.rotation.z,
            currentPose.rotation.w,
          ),
          delta.x,
          delta.y,
          MODEL_STAGE.gestureRadiansPerMeter,
        );
        applyStagePose({
          ...currentPose,
          rotation: {
            x: rotation.x,
            y: rotation.y,
            z: rotation.z,
            w: rotation.w,
          },
        }, null);
      }
    };
    const modelPointerPositions = new Map<string, {
      local: THREE.Vector3;
      groupLocal: THREE.Vector3;
      mode: "rotate" | "pan";
      source: "controller" | "hand" | "mouse" | "touch" | "pen" | "xr";
      clientX: number;
      clientY: number;
    }>();
    const dimensionsDpFor = (rect: NormalizedSpatialSurfaceRect) => {
      const geometry = geometryFor(rect);
      return {
        widthDp: geometry.widthMeters / horizonTokens.metresPerDp,
        heightDp: geometry.heightMeters / horizonTokens.metresPerDp,
      };
    };
    const placeTextInRegion = (
      text: SpatialText,
      rect: NormalizedSpatialSurfaceRect,
      alignment: CanvasTextAlign,
    ): void => {
      const geometry = geometryFor(rect);
      const widthM = dpToMeters(text.widthDp);
      const x = alignment === "left"
        ? geometry.xMeters - geometry.widthMeters / 2 + widthM / 2
        : alignment === "right"
          ? geometry.xMeters + geometry.widthMeters / 2 - widthM / 2
          : geometry.xMeters;
      text.object3d.position.set(x, geometry.yMeters, xrTokens.layers.label.zOffsetM);
    };
    const addText = (
      id: string,
      text: string,
      style: "display" | "title" | "heading" | "body" | "label" | "caption",
      regionId: string,
      alignment: CanvasTextAlign = "left",
    ): SpatialText => {
      const rect = regionFor(regionId);
      const textPrimitive = createSpatialText({
        text,
        style,
        alignment,
        maxWidthDp: dimensionsDpFor(rect).widthDp,
        maxHeightDp: dimensionsDpFor(rect).heightDp,
      });
      textPrimitive.object3d.name = `atom-builder-${id}`;
      placeTextInRegion(textPrimitive, rect, alignment);
      group.add(textPrimitive.object3d);
      primitives.push(textPrimitive);
      return textPrimitive;
    };
    const addLabelPlate = (id: string, text: SpatialText): GlassSurface => {
      const surface = createGlassSurface("pill", {
        width: dpToMeters(
          text.widthDp + xrTokens.paddingDp.control.horizontal * 2,
        ),
        height: dpToMeters(
          text.heightDp + xrTokens.paddingDp.control.vertical * 2,
        ),
      });
      surface.name = `atom-builder-${id}-label-plate`;
      surface.position.set(
        text.object3d.position.x,
        text.object3d.position.y,
        xrTokens.layers.control.zOffsetM,
      );
      group.add(surface);
      surfaces.push(surface);
      return surface;
    };
    const addSurface = (
      id: string,
      variant: "shell" | "panel" | "card",
      rect: NormalizedSpatialSurfaceRect,
    ): void => {
      const geometry = geometryFor(rect);
      const surface = createGlassSurface(variant, {
        width: geometry.widthMeters,
        height: geometry.heightMeters,
      });
      surface.name = `atom-builder-${id}`;
      surface.position.set(geometry.xMeters, geometry.yMeters, 0);
      group.add(surface);
      surfaces.push(surface);
    };
    const addButton = (
      id: string,
      label: string,
      inputId: string,
      rect: NormalizedSpatialSurfaceRect,
      options: Readonly<{
        primaryTarget?: boolean;
        toggle?: boolean;
        selected?: boolean;
        disabled?: boolean;
        alternateLabels?: readonly string[];
        variant?: "pill" | "chip";
        onClick?: () => void;
      }> = {},
    ): SpatialButton => {
      const geometry = geometryFor(rect);
      const button = createSpatialButton({
        id,
        label,
        variant: options.variant ?? "pill",
        sizeDp: dimensionsDpFor(rect),
        primaryTarget: options.primaryTarget ?? false,
        ...(options.toggle === undefined ? {} : { toggle: options.toggle }),
        ...(options.selected === undefined ? {} : { selected: options.selected }),
        ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
        ...(options.alternateLabels === undefined ? {} : { alternateLabels: options.alternateLabels }),
        textStyle: "body",
        onClick: options.onClick ?? (() => onPanelAction(inputId)),
      });
      button.object3d.name = `atom-builder-${id}`;
      button.object3d.position.set(geometry.xMeters, geometry.yMeters, 0);
      button.target.object3d.scale.setScalar(1 / panelLimits.scale.min);
      group.add(button.object3d);
      primitives.push(button);
      pointerTargets.push(...button.pointerTargets);
      buttons.set(id, button);
      return button;
    };
    const updatePropertyRows = (content: SpatialPanelGroupContent): void => {
      for (const row of propertyRows.splice(0)) {
        row.dispose();
      }
      if (content.element.properties.length !== propertyRegionIds.length) {
        throw new Error("Atom Builder spatial panels require five element properties.");
      }
      content.element.properties.forEach((property, index) => {
        const regionId = propertyRegionIds[index];
        if (!regionId) {
          throw new Error("Atom Builder property row has no reference region.");
        }
        const geometry = geometryFor(regionFor(regionId));
        const row = createSpatialPropertyRow({
          label: property.label,
          value: property.value,
          widthDp: geometry.widthMeters / horizonTokens.metresPerDp,
          heightDp: geometry.heightMeters / horizonTokens.metresPerDp,
        });
        row.object3d.name = `atom-builder-${regionId}`;
        row.object3d.position.set(geometry.xMeters, geometry.yMeters, 0);
        group.add(row.object3d);
        propertyRows.push(row);
      });
    };
    const applyContent = (content: SpatialPanelGroupContent): void => {
      if (brandText && content.header) {
        brandText.setText(content.header.brand);
        placeTextInRegion(brandText, regionFor("brand"), "left");
      }
      if (moduleTitleText && content.header) {
        moduleTitleText.setText(content.header.title);
        placeTextInRegion(moduleTitleText, regionFor("moduleTitle"), "right");
      }
      for (const [plate, text] of [
        [brandPlate, brandText],
        [moduleTitlePlate, moduleTitleText],
      ] as const) {
        if (!plate || !text) continue;
        const width = dpToMeters(
          text.widthDp + xrTokens.paddingDp.control.horizontal * 2,
        );
        const height = dpToMeters(
          text.heightDp + xrTokens.paddingDp.control.vertical * 2,
        );
        const geometry = plate.geometry.parameters;
        if (geometry.width !== width || geometry.height !== height) {
          plate.geometry.dispose();
          plate.geometry = new THREE.PlaneGeometry(width, height);
        }
        plate.position.set(
          text.object3d.position.x,
          text.object3d.position.y,
          xrTokens.layers.control.zOffsetM,
        );
      }
      captionText?.setText(content.model.caption);
      if (captionText) {
        captionText.object3d.visible = content.model.captionsEnabled;
        placeTextInRegion(captionText, regionFor("captionTextArea"), "left");
      }
      if (captionSurface) {
        captionSurface.visible = content.model.captionsEnabled;
      }
      const captionsButton = buttons.get("captions-toggle");
      captionsButton?.setLabel(content.model.captionsLabel);
      captionsButton?.setSelected(content.model.captionsEnabled);
      const narrationButton = buttons.get("narration-toggle");
      narrationButton?.setLabel(content.model.enableVisible
        ? content.model.enableLabel
        : content.model.narrationLabel);
      narrationButton?.setSelected(content.model.narrationEnabled);
      if (narrationButton) {
        narrationButton.setDisabled(content.model.enableVisible && content.model.enableDisabled);
      }
      const selectedSpeed = content.model.speedOptions.find((option) => option.selected);
      if (!selectedSpeed || content.model.speedOptions.length === 0) {
        throw new Error("Spatial narration speed options must include one selected value.");
      }
      buttons.get("narration-speed")?.setLabel(selectedSpeed.label);
      buttons.get("narration-speed")?.setSelected(true);
      const replayButton = buttons.get("narration-replay");
      replayButton?.setLabel(content.model.replayLabel);
      replayButton?.setDisabled(content.model.replayDisabled);

      const mission = content.mission;
      const missionIsActive = mission.view === "lesson";
      missionStepText?.setText(missionIsActive
        ? mission.step
        : mission.view === "free-play"
          ? mission.freePlayText
          : mission.summaryTitle);
      if (missionStepText) {
        placeTextInRegion(missionStepText, regionFor("missionLabel"), "left");
      }
      missionTitleText?.setText(missionIsActive
        ? mission.title
        : mission.view === "free-play"
          ? mission.freePlayText
          : mission.summaryTitle);
      if (missionTitleText) {
        placeTextInRegion(missionTitleText, regionFor("missionTitle"), "left");
      }
      missionBodyText?.setText(missionIsActive
        ? mission.body
        : mission.view === "summary"
          ? mission.summaryDetails
          : "");
      if (missionBodyText) {
        placeTextInRegion(missionBodyText, regionFor("missionBody"), "left");
      }
      missionHintText?.setText(mission.hint);
      if (missionHintText) {
        missionHintText.object3d.visible = mission.hint.length > 0;
        placeTextInRegion(missionHintText, regionFor("missionHintLine"), "left");
      }
      if (progressBar) {
        progressBar.object3d.visible = missionIsActive;
        progressBar.setValue(mission.progressValue);
      }
      const hintButton = buttons.get("hint-button");
      hintButton?.setLabel(mission.hintLabel);
      hintButton?.setDisabled(!missionIsActive || mission.hintDisabled);
      const checkButton = buttons.get("check-button");
      checkButton?.setLabel(mission.checkLabel);
      checkButton?.setDisabled(!missionIsActive || mission.checkDisabled);
      const freePlayButton = buttons.get("free-play-button");
      freePlayButton?.setLabel(mission.freePlayLabel);
      freePlayButton?.setSelected(mission.view === "free-play");
      buttons.get("reset-atom-button")?.setLabel(mission.resetLabel);
      buttons.get("reset-view-button")?.setLabel(content.resetViewLabel);
      hintsLabelText?.setText(content.hints.label);
      hintsBodyText?.setText(content.hints.text);
      if (hintsLabelText) placeTextInRegion(hintsLabelText, regionFor("hintsLabel"), "left");
      if (hintsBodyText) {
        hintsBodyText.object3d.visible = content.hints.text.length > 0;
        placeTextInRegion(hintsBodyText, regionFor("hintsBody"), "left");
      }
      elementSymbolText?.setText(content.element.symbol);
      elementNameText?.setText(content.element.name);
      elementNumberText?.setText(content.element.number);
      if (elementSymbolText) {
        elementSymbolText.object3d.visible = content.element.symbol.trim().length > 0;
        placeTextInRegion(elementSymbolText, regionFor("elementSymbol"), "center");
      }
      if (elementNameText) {
        elementNameText.object3d.visible = content.element.name.trim().length > 0;
        placeTextInRegion(elementNameText, regionFor("elementName"), "left");
      }
      if (elementNumberText) {
        elementNumberText.object3d.visible = content.element.number.trim().length > 0;
        placeTextInRegion(elementNumberText, regionFor("elementNumber"), "left");
      }
      updatePropertyRows(content);
      for (const particle of content.particles) {
        particleValues.set(particle.label, particle.value);
        const stepper = steppers.get(particle.label);
        stepper?.setValue(particle.value);
      }
    };

    try {
      addSurface("backing-shell", "shell", layout.shell);
      for (const panel of layout.panels) addSurface(panel.id, panel.variant, panel.rect);
      const logoGeometry = geometryFor(layout.controls.futureLogoSlot);
      const logoSlot = createGlassSurface("card", {
        width: logoGeometry.widthMeters,
        height: logoGeometry.heightMeters,
      });
      logoSlot.name = "atom-builder-future-logo-slot";
      logoSlot.position.set(logoGeometry.xMeters, logoGeometry.yMeters, 0);
      group.add(logoSlot);
      surfaces.push(logoSlot);

      const initialContent = initialItems.bento;
      brandText = initialContent.header && layout.regions.brand
        ? addText("brand", initialContent.header.brand, "heading", "brand")
        : null;
      moduleTitleText = initialContent.header && layout.regions.moduleTitle
        ? addText("module-title", initialContent.header.title, "title", "moduleTitle", "right")
        : null;
      brandPlate = brandText ? addLabelPlate("brand", brandText) : null;
      moduleTitlePlate = moduleTitleText ? addLabelPlate("module-title", moduleTitleText) : null;
      const captionTextArea = layout.regions.captionTextArea;
      if (captionTextArea) {
        captionSurface = createGlassSurface("card", {
          width: geometryFor(captionTextArea).widthMeters,
          height: geometryFor(captionTextArea).heightMeters,
        });
        captionSurface.name = "atom-builder-caption-surface";
        const captionGeometry = geometryFor(captionTextArea);
        captionSurface.position.set(
          captionGeometry.xMeters,
          captionGeometry.yMeters,
          xrTokens.layers.panel.zOffsetM,
        );
        group.add(captionSurface);
        surfaces.push(captionSurface);
        captionText = addText("model-caption", initialContent.model.caption, "caption", "captionTextArea");
      }
      addText(
        "particle-heading",
        initialContent.particleInstruction,
        "heading",
        "particleTitle",
      );
      elementSymbolText = addText("element-symbol", "", "display", "elementSymbol", "center");
      elementNameText = addText("element-name", "", "body", "elementName");
      elementNumberText = addText("element-number", "", "caption", "elementNumber");
      missionStepText = addText("mission-step", "", "label", "missionLabel");
      missionTitleText = addText("mission-title", "", "heading", "missionTitle");
      missionBodyText = addText("mission-body", "", "body", "missionBody");
      missionHintText = addText("mission-hint", "", "caption", "missionHintLine");
      hintsLabelText = addText("hints-label", "", "label", "hintsLabel");
      hintsBodyText = addText("hints-body", "", "body", "hintsBody");
      const progressGeometry = geometryFor(regionFor("missionProgressBar"));
      progressBar = createSpatialProgressBar({
        widthDp: progressGeometry.widthMeters / horizonTokens.metresPerDp,
        heightDp: progressGeometry.heightMeters / horizonTokens.metresPerDp,
        value: initialContent.mission.progressValue,
        max: initialContent.mission.progressMax,
      });
      progressBar.object3d.name = "atom-builder-mission-progress";
      progressBar.object3d.position.set(progressGeometry.xMeters, progressGeometry.yMeters, 0);
      group.add(progressBar.object3d);
      primitives.push(progressBar);

      const hintButton = layout.controls.hintButton
        ? addButton(
            "hint-button",
            initialContent.mission.hintLabel,
            initialContent.mission.hintAction,
            layout.controls.hintButton,
          )
        : null;
      const checkButton = layout.controls.checkButton
        ? addButton(
            "check-button",
            initialContent.mission.checkLabel,
            initialContent.mission.checkAction,
            layout.controls.checkButton,
            { primaryTarget: true },
          )
        : null;
      const freePlayButton = layout.controls.freePlayButton
        ? addButton(
            "free-play-button",
            initialContent.mission.freePlayLabel,
            initialContent.mission.freePlayAction,
            layout.controls.freePlayButton,
          )
        : null;
      addButton(
        "reset-view-button",
        initialContent.resetViewLabel,
        "reset-view",
        layout.controls.resetViewButton,
      );
      addButton(
        "reset-atom-button",
        initialContent.mission.resetLabel,
        initialContent.mission.resetAction,
        layout.controls.resetAtomButton,
      );
      hintButton?.setDisabled(initialContent.mission.view !== "lesson" || initialContent.mission.hintDisabled);
      checkButton?.setDisabled(initialContent.mission.view !== "lesson" || initialContent.mission.checkDisabled);
      freePlayButton?.setSelected(initialContent.mission.view === "free-play");

      const captionButton = addButton(
        "captions-toggle",
        initialContent.model.captionsLabel,
        initialContent.model.captionsAction,
        regionFor("captionsOn"),
        {
          toggle: true,
          selected: initialContent.model.captionsEnabled,
          alternateLabels: ["Captions On", "Captions Off"],
        },
      );
      const speedButton = addButton(
        "narration-speed",
        initialContent.model.speedOptions.find((option) => option.selected)?.label ?? "",
        "",
        regionFor("speedChip1x"),
        {
          variant: "chip",
          selected: true,
          alternateLabels: initialContent.model.speedOptions.map((option) => option.label),
          onClick: () => {
            const options = currentItems.bento.model.speedOptions;
            const selectedIndex = options.findIndex((option) => option.selected);
            const next = options[(selectedIndex + 1 + options.length) % options.length];
            if (!next) throw new Error("Spatial narration speed option could not be selected.");
            onPanelAction(`narration-speed:${next.value}`);
          },
        },
      );
      addButton(
        "narration-toggle",
        initialContent.model.enableVisible
          ? initialContent.model.enableLabel
          : initialContent.model.narrationLabel,
        "",
        regionFor("narrationOn"),
        {
          toggle: true,
          selected: initialContent.model.narrationEnabled,
          disabled: initialContent.model.enableVisible && initialContent.model.enableDisabled,
          alternateLabels: ["Enable sound", "Narration On", "Narration Off"],
          onClick: () => {
            const model = currentItems.bento.model;
            onPanelAction(model.enableVisible ? model.enableAction : model.narrationAction);
          },
        },
      );
      const replayButton = addButton(
        "narration-replay",
        initialContent.model.replayLabel,
        initialContent.model.replayAction,
        regionFor("replay"),
        { disabled: initialContent.model.replayDisabled },
      );
      captionButton.setSelected(initialContent.model.captionsEnabled);
      speedButton.setSelected(true);
      replayButton.setDisabled(initialContent.model.replayDisabled);

      const positionGeometry = geometryFor(layout.controls.positionSliderTrack);
      const positionOrientation = layout.controls.positionSliderOrientation ?? "horizontal";
      const positionTrackSize = dimensionsDpFor(layout.controls.positionSliderTrack);
      const positionSlider = createSpatialSlider({
        id: "position",
        label: initialContent.controls.positionLabel,
        orientation: positionOrientation,
        min: panelLimits.distanceMeters.min,
        max: panelLimits.distanceMeters.max,
        value: positionDistance,
        ...(layoutName === "android" ? {
          trackLengthDp: positionOrientation === "horizontal"
            ? positionTrackSize.widthDp
            : positionTrackSize.heightDp,
        } : {}),
        minimumGroupScale: panelLimits.scale.min,
        onChange: (next) => {
          distanceMeters = clampPanelGroupDistance(next, panelLimits);
          if (initialViewerPosition && initialForward) {
            const worldPosition = calculatePanelGroupPosition(
              initialViewerPosition,
              initialForward,
              distanceMeters,
              heightOffset,
            );
            parent.updateWorldMatrix(true, false);
            group.position.copy(parent.worldToLocal(new THREE.Vector3(
              worldPosition.x,
              worldPosition.y,
              worldPosition.z,
            )));
          }
          this.panelGroupSliderValues = { positionMeters: distanceMeters, scale };
          this.refreshCameraLookLimits();
          this.render();
        },
      });
      positionSlider.object3d.position.set(positionGeometry.xMeters, positionGeometry.yMeters, 0);
      sliders.push(positionSlider);
      primitives.push(positionSlider);
      pointerTargets.push(...positionSlider.pointerTargets);
      group.add(positionSlider.object3d);

      const scaleGeometry = geometryFor(layout.controls.scaleSliderTrack);
      const scaleOrientation = layout.controls.scaleSliderOrientation ?? "vertical";
      const scaleTrackSize = dimensionsDpFor(layout.controls.scaleSliderTrack);
      const scaleSlider = createSpatialSlider({
        id: "scale",
        label: initialContent.controls.scaleLabel,
        orientation: scaleOrientation,
        min: panelLimits.scale.min,
        max: panelLimits.scale.max,
        value: panelLimits.scale.default,
        ...(layoutName === "android" ? {
          trackLengthDp: scaleOrientation === "horizontal"
            ? scaleTrackSize.widthDp
            : scaleTrackSize.heightDp,
        } : {}),
        minimumGroupScale: panelLimits.scale.min,
        onChange: (next) => {
          scale = clampPanelGroupScale(next, panelLimits);
          applyPanelGroupScale(group, scale, panelLimits);
          this.panelGroupSliderValues = { positionMeters: distanceMeters, scale };
          this.refreshCameraLookLimits();
          this.render();
        },
      });
      scaleSlider.object3d.position.set(scaleGeometry.xMeters, scaleGeometry.yMeters, 0);
      sliders.push(scaleSlider);
      primitives.push(scaleSlider);
      pointerTargets.push(...scaleSlider.pointerTargets);
      group.add(scaleSlider.object3d);

      const particlePanelCenter = geometryFor(layout.panels.find(
        (panel) => panel.id === "particles-panel",
      )?.rect ?? regionFor("particleTitle"));
      const swatchLights = new THREE.Group();
      swatchLights.name = "atom-builder-particle-swatch-lights";
      swatchLights.position.set(
        particlePanelCenter.xMeters,
        particlePanelCenter.yMeters,
        xrTokens.shellWidthMeters / 2,
      );
      const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x4a4040, 1);
      hemisphereLight.name = "atom-builder-particle-hemisphere-light";
      const keyLight = new THREE.DirectionalLight(0xffffff, 1);
      keyLight.name = "atom-builder-particle-key-light";
      keyLight.position.set(-xrTokens.shellWidthMeters / 2, xrTokens.shellWidthMeters / 2, 1);
      swatchLights.add(hemisphereLight, keyLight);
      group.add(swatchLights);
      const sphereGeometry = new THREE.SphereGeometry(1, 16, 12);
      swatchGeometry = sphereGeometry;
      const particleRegionIds = ["proton", "neutron", "electron"] as const;
      if (initialContent.particles.length !== particleRegionIds.length) {
        throw new Error("Atom Builder spatial panels require three particle rows.");
      }
      initialContent.particles.forEach((particle, index) => {
        const regionKey = particleRegionIds[index];
        if (!regionKey) throw new Error("Spatial particle row has no reference region.");
        const swatchRect = regionFor(`${regionKey}Swatch`);
        const swatchGeometryData = geometryFor(swatchRect);
        const radius = Math.min(swatchGeometryData.widthMeters, swatchGeometryData.heightMeters) / 2;
        const material = new THREE.MeshPhongMaterial({
          color: new THREE.Color(particle.color),
          specular: xrTokens.colors.textPrimary,
          shininess: 32,
        });
        const sphere = new THREE.Mesh(sphereGeometry, material);
        sphere.name = `atom-builder-${regionKey}-swatch-sphere`;
        sphere.scale.setScalar(radius);
        sphere.position.set(
          swatchGeometryData.xMeters,
          swatchGeometryData.yMeters,
          radius + xrTokens.layers.panel.zOffsetM,
        );
        group.add(sphere);
        particleMeshes.push(sphere);
        pointerTargets.push({
          id: `particle:token:${regionKey}`,
          object3d: sphere,
          disabled: false,
          setState: ({ hover = false, pressed = false, dragging = false }) => {
            sphere.material.emissive.setHex(hover || pressed || dragging ? 0x433821 : 0x000000);
          },
        });
        const labelGeometry = geometryFor(regionFor(`${regionKey}LabelAndCount`));
        const row = geometryFor(regionFor(`${regionKey}Row`));
        const labelLeftMeters = labelGeometry.xMeters - labelGeometry.widthMeters / 2;
        const rightEdgeMeters = row.xMeters + row.widthMeters / 2 -
          dpToMeters(xrTokens.gapsDp.inline);
        const minusGeometry = geometryFor(regionFor(`${regionKey}Minus`));
        const buttonSizeDp = Math.min(
          minusGeometry.widthMeters,
          minusGeometry.heightMeters,
        ) / horizonTokens.metresPerDp;
        const groupWidthDp =
          (rightEdgeMeters - labelLeftMeters) / horizonTokens.metresPerDp;
        const labelWidthDp = labelGeometry.widthMeters / horizonTokens.metresPerDp;
        if (groupWidthDp <= 0 || labelWidthDp <= 0) {
          throw new Error(`Particle label has no room in the ${regionKey} row.`);
        }
        particleValues.set(particle.label, particle.value);
        const stepper = createSpatialStepper({
          id: `${regionKey}-stepper`,
          value: particle.value,
          min: particle.min,
          ...(particle.max === undefined ? {} : { max: particle.max }),
          layout: "label-count-left",
          label: particle.label,
          labelWidthDp,
          groupWidthDp,
          buttonSizeDp,
          onChange: (nextValue) => {
            const currentValue = particleValues.get(particle.label) ?? particle.value;
            particleValues.set(particle.label, nextValue);
            onPanelAction(nextValue > currentValue ? particle.addAction : particle.removeAction);
          },
        });
        const stepperWidthM = dpToMeters(stepper.widthDp);
        stepper.object3d.name = `atom-builder-${regionKey}-stepper`;
        stepper.object3d.position.set(
          labelLeftMeters + stepperWidthM / 2,
          row.yMeters,
          0,
        );
        for (const target of stepper.pointerTargets) {
          target.object3d.scale.setScalar(1 / panelLimits.scale.min);
        }
        group.add(stepper.object3d);
        primitives.push(stepper);
        pointerTargets.push(...stepper.pointerTargets);
        steppers.set(particle.label, stepper);
      });
      applyContent(initialContent);
      parent.add(group);
      this.spatialPanelGroup = group;
      this.activeSpatialLayout = layoutName;
      this.activeSpatialSurfaceLayout = layout;
      this.panelGroupSliderValues = { positionMeters: positionDistance, scale };
      this.refreshCameraLookLimits();
    } catch (error) {
      for (const row of propertyRows) row.dispose();
      for (const primitive of primitives) primitive.dispose();
      for (const mesh of particleMeshes) mesh.material.dispose();
      swatchGeometry?.dispose();
      for (const surface of surfaces) disposeGlassSurface(surface);
      stageInputPlane.geometry.dispose();
      stageInputPlane.material.dispose();
      this.arPlacementRoot.add(this.atomRoot);
      this.atomRoot.position.set(0, 0, 0);
      this.atomRoot.rotation.set(0, 0, 0);
      if (this.currentFrame) this.atomRoot.scale.setScalar(arContentScale(this.currentFrame));
      this.modelStage = null;
      this.modelStageLayout = null;
      this.modelStagePose = null;
      this.modelStageBindingLimit = null;
      this.modelPanelCenter = null;
      this.activeSpatialLayout = null;
      this.activeSpatialSurfaceLayout = null;
      this.hoveredAtomSubparts.clear();
      this.selectedAtomSubpart = null;
      this.subpartHighlightMesh.visible = false;
      this.subpartHighlightMesh.geometry = this.subpartHighlightGeometry;
      group.removeFromParent();
      throw error;
    }

    const placeFromViewerPose = (viewerPose: ArViewerPose): void => {
      const placement = calculatePanelGroupPlacement(
        viewerPose.position,
        viewerPose.orientation,
        distanceMeters,
        heightOffset,
      );
      initialViewerPosition = new THREE.Vector3(
        viewerPose.position.x,
        viewerPose.position.y,
        viewerPose.position.z,
      );
      initialForward = new THREE.Vector3(
        placement.forward.x,
        placement.forward.y,
        placement.forward.z,
      );
      parent.updateWorldMatrix(true, false);
      group.position.copy(parent.worldToLocal(new THREE.Vector3(
        placement.position.x,
        placement.position.y,
        placement.position.z,
      )));
      const worldOrientation = new THREE.Quaternion(
        placement.orientation.x,
        placement.orientation.y,
        placement.orientation.z,
        placement.orientation.w,
      );
      group.quaternion.copy(
        parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(worldOrientation),
      );
      applyPanelGroupScale(group, scale, panelLimits);
      group.visible = true;
      this.render();
    };
    const pendingPlacement = (viewerPose: ArViewerPose): void => placeFromViewerPose(viewerPose);
    const initialViewerPose = this.firstNonNullViewerPose ?? this.latestFramePose;
    if (initialViewerPose) {
      placeFromViewerPose(initialViewerPose);
    } else if (this.cameraViewActive && this.androidCameraLayoutActive) {
      camera.updateMatrixWorld(true);
      const cameraPosition = camera.getWorldPosition(new THREE.Vector3());
      const cameraOrientation = camera.getWorldQuaternion(new THREE.Quaternion());
      placeFromViewerPose({
        position: { x: cameraPosition.x, y: cameraPosition.y, z: cameraPosition.z },
        orientation: {
          x: cameraOrientation.x,
          y: cameraOrientation.y,
          z: cameraOrientation.z,
          w: cameraOrientation.w,
        },
      });
    } else {
      this.pendingSpatialDockReposition = pendingPlacement;
    }

    const panelHost = createSpatialPanelHost({
      group,
      camera,
      pointerTarget,
      panels: [],
      pointerTargets,
      onPanelAction,
      onPointerEvent: (event) => {
        this.updateModelSubpartHighlight(event);
        if (event.type !== "move") this.render();
      },
      enablePointerEvents: true,
      ...(onSpatialInput ? { onSpatialInput } : {}),
      ...(this.cameraViewActive && this.androidCameraLayoutActive
        ? { onBackgroundPointer: (event) => this.handleCameraBackgroundPointer(event) }
        : {}),
      onWheel: (_ray, deltaY) => {
        const pose = this.modelStagePose;
        if (!pose) return false;
        zoomStage(-deltaY * MODEL_STAGE.zoomWheelSensitivity * pose.zoom);
        return true;
      },
      shouldIgnorePointerTarget: (target) =>
        target instanceof Element && target.closest(
          "button, input, select, textarea, a, dialog, [data-ar-action], [data-camera-action]",
        ) !== null,
    });
    let disposed = false;
    return {
      update: (nextItems) => {
        if (disposed) return;
        currentItems = nextItems;
        applyContent(nextItems.bento);
        this.render();
      },
      setExpanded: () => undefined,
      setActivePanelListener: (listener) => listener?.(null),
      reposition: () => undefined,
      setPointerEventsEnabled: (enabled) =>
        panelHost.setPointerEventsEnabled(enabled || this.arActive),
      handleRay: (ray, phase, sourceId, source, gestureMode, zoomDelta) =>
        panelHost.handleRay(ray, phase, sourceId, source, gestureMode, zoomDelta),
      setHintListener: () => undefined,
      focusPanel: () => undefined,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        if (this.pendingSpatialDockReposition === pendingPlacement) {
          this.pendingSpatialDockReposition = null;
        }
        if (this.spatialPanelGroup === group) this.spatialPanelGroup = null;
        this.activeSpatialLayout = null;
        this.activeSpatialSurfaceLayout = null;
        this.panelGroupSliderValues = null;
        panelHost.dispose();
        this.arPlacementRoot.add(this.atomRoot);
        this.atomRoot.position.set(0, 0, 0);
        this.atomRoot.rotation.set(0, 0, 0);
        if (this.currentFrame && this.arActive) {
          this.atomRoot.scale.setScalar(arContentScale(this.currentFrame));
        }
        stageInputPlane.geometry.dispose();
        stageInputPlane.material.dispose();
        this.modelStage = null;
        this.modelStageLayout = null;
        this.modelStagePose = null;
        this.modelStageBindingLimit = null;
        this.modelPanelCenter = null;
        for (const row of propertyRows) row.dispose();
        for (const primitive of primitives) primitive.dispose();
        for (const mesh of particleMeshes) mesh.material.dispose();
        swatchGeometry?.dispose();
        for (const surface of surfaces) disposeGlassSurface(surface);
        group.removeFromParent();
        this.render();
      },
    };
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
    this.subpartHighlightGeometry.dispose();
    this.subpartHighlightMaterial.dispose();
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
      if (this.androidCameraLayoutActive) this.refreshCameraLookLimits();
    }
    this.positionSlotMarkers();
    this.render();
  };

  private readonly onReducedMotionChange = (): void => {
    this.startDiagnosticsLoop();
  };

  private readonly onBackgroundModeChange = (event: Event): void => {
    const detail = (event as CustomEvent<unknown>).detail;
    const transparent = typeof detail === "boolean"
      ? detail
      : typeof detail === "object" && detail !== null &&
        "transparent" in detail && typeof detail.transparent === "boolean"
        ? detail.transparent
        : null;
    if (transparent === null || this.arActive) {
      return;
    }
    const androidCameraLayout = typeof detail === "object" && detail !== null &&
      "androidCameraLayout" in detail && detail.androidCameraLayout === true;
    this.cameraViewActive = transparent;
    this.androidCameraLayoutActive = transparent && androidCameraLayout;
    this.camera.fov = this.androidCameraLayoutActive ? ANDROID_CAMERA_FOV_DEGREES : 42;
    this.camera.updateProjectionMatrix();
    if (!this.androidCameraLayoutActive) {
      this.cameraLookLimits = null;
      this.cameraLookYaw = 0;
      this.cameraLookPitch = 0;
      this.cameraOrientationBaseline = null;
    } else {
      this.applyCameraLookToCamera();
    }
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
    this.applyCameraLookToCamera();
    this.positionSlotMarkers();
    this.render();
  }

  private refreshCameraLookLimits(): void {
    const layout = this.activeSpatialSurfaceLayout;
    const modelPanel = layout?.panels.find(({ id }) => id === "model-panel");
    if (!this.androidCameraLayoutActive || !layout || !modelPanel) {
      this.cameraLookLimits = null;
      return;
    }
    this.cameraLookLimits = calculateCameraLookLimits(
      layout,
      modelPanel.rect,
      xrTokens.shellWidthMeters,
      this.panelGroupSliderValues?.positionMeters ?? ANDROID_PANEL_LIMITS.distanceMeters.default,
      this.spatialPanelGroup?.scale.x ?? ANDROID_PANEL_LIMITS.scale.default,
      ANDROID_CAMERA_FOV_DEGREES,
      this.camera.aspect,
      LOOK_LIMITS.marginDegrees,
    );
  }

  private setCameraLookAngles(yawRadians: number, pitchRadians: number): void {
    this.refreshCameraLookLimits();
    const limits = this.cameraLookLimits;
    if (!limits) return;
    const targetYaw = softClampCameraAngle(yawRadians, limits.yawRadians);
    const targetPitch = softClampCameraAngle(pitchRadians, limits.pitchRadians);
    this.cameraLookYaw += (targetYaw - this.cameraLookYaw) * LOOK_LIMITS.smoothing;
    this.cameraLookPitch += (targetPitch - this.cameraLookPitch) * LOOK_LIMITS.smoothing;
    this.applyCameraLookToCamera();
    this.render();
  }

  private handleCameraBackgroundPointer(event: Readonly<{
    phase: "move" | "down" | "up" | "cancel";
    pointerId: number;
    clientX: number;
    clientY: number;
  }>): void {
    if (event.phase === "down") {
      this.cameraDragPosition = { x: event.clientX, y: event.clientY };
      return;
    }
    if (event.phase === "move" && this.cameraDragPosition) {
      const delta = cameraDragLookDelta(
        event.clientX - this.cameraDragPosition.x,
        event.clientY - this.cameraDragPosition.y,
        LOOK_LIMITS.dragRadiansPerPixel,
      );
      this.cameraDragPosition = { x: event.clientX, y: event.clientY };
      this.setCameraLookAngles(
        this.cameraLookYaw + delta.yawRadians,
        this.cameraLookPitch + delta.pitchRadians,
      );
      return;
    }
    this.cameraDragPosition = null;
  }

  private applyCameraLookToCamera(): void {
    if (!this.androidCameraLayoutActive) return;
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.set(this.cameraLookPitch, this.cameraLookYaw, 0, "YXZ");
    this.camera.updateMatrixWorld(true);
  }

  private updateArAtomScale(): void {
    if (!this.arActive) {
      return;
    }
    if (this.modelStageLayout) {
      this.atomRoot.scale.setScalar(this.modelStageLayout.fitRadius / this.atomBoundingRadius);
      return;
    }
    this.atomRoot.scale.setScalar(
      (this.currentFrame ? arContentScale(this.currentFrame) : 0.675) *
        this.arViewTransform.scaleFactor,
    );
  }

  private resetModelStageView(): boolean {
    if (!this.modelStage || !this.modelStageLayout) return false;
    const pose = resetModelStagePose(this.modelStageLayout.home);
    this.modelStage.position.set(pose.position.x, pose.position.y, pose.position.z);
    this.modelStage.quaternion.set(
      pose.rotation.x,
      pose.rotation.y,
      pose.rotation.z,
      pose.rotation.w,
    );
    this.modelStage.scale.setScalar(pose.zoom);
    this.modelStagePose = pose;
    this.modelStageBindingLimit = null;
    this.render();
    return true;
  }

  private updateModelSubpartHighlight(event: SpatialPointerEvent): void {
    if (!this.modelStage || event.targetId !== "model-stage") return;
    if (event.type === "leave") {
      this.hoveredAtomSubparts.delete(event.sourceId);
    } else if (
      (event.type === "enter" || event.type === "move" || event.type === "drag" ||
        event.type === "click") && event.ray
    ) {
      this.raycaster.ray.copy(event.ray);
      const hit = this.raycaster.intersectObjects(this.interactiveMeshes, false)
        .find(({ object }) =>
          object !== this.nucleusPickMesh &&
          typeof object.userData.interactionTarget === "string",
        );
      const subpart = hit
        ? { object: hit.object, instanceId: hit.instanceId ?? null }
        : null;
      if (event.type === "click") this.selectedAtomSubpart = subpart;
      if (subpart) this.hoveredAtomSubparts.set(event.sourceId, subpart);
      else this.hoveredAtomSubparts.delete(event.sourceId);
    }
    const target = [...this.hoveredAtomSubparts.values()].at(-1) ?? this.selectedAtomSubpart;
    if (!target || !(target.object instanceof THREE.Mesh)) {
      this.subpartHighlightMesh.visible = false;
      return;
    }
    this.subpartHighlightMesh.geometry = target.object.geometry;
    if (target.object instanceof THREE.InstancedMesh && target.instanceId !== null) {
      const instanceTransform = new THREE.Matrix4();
      target.object.getMatrixAt(target.instanceId, instanceTransform);
      instanceTransform.decompose(
        this.subpartHighlightMesh.position,
        this.subpartHighlightMesh.quaternion,
        this.subpartHighlightMesh.scale,
      );
    } else {
      this.subpartHighlightMesh.position.copy(target.object.position);
      this.subpartHighlightMesh.quaternion.copy(target.object.quaternion);
      this.subpartHighlightMesh.scale.copy(target.object.scale);
    }
    this.subpartHighlightMesh.visible = true;
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