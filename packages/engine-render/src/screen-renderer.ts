import * as THREE from "three";
import { selectSnapTarget } from "./snap-target.js";
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

const SCREEN_BACKGROUND_MODE_EVENT = "mma:screen-background-mode";

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

/** Position of the atom in the AR session's fixed local reference space. */
export const arWorldAnchorPosition: Position3 = Object.freeze({ x: 0, y: 0, z: -0.6 });

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
  private readonly slotLayer: HTMLDivElement;
  private readonly resizeObserver: ResizeObserver;
  private readonly reducedMotion: MediaQueryList;
  private readonly diagnosticsElement: HTMLElement | null;
  private animationFrame = 0;
  private resizeFrame = 0;
  private lastFrameTime = 0;
  private yaw = 0;
  private pitch = 0;
  private distance = 14;
  private arViewTransform: ArViewTransform = DEFAULT_AR_VIEW_TRANSFORM;
  private nucleusRadius = 0.2;
  private dragParticle: string | null = null;
  private arActive = false;
  private currentFrame: ScreenSceneFrame | null = null;
  private activeXRSession: XRSession | null = null;
  private xrRenderLoopRunning = false;
  private arDiagnosticsListener: ((diagnostics: ArRenderDiagnostics) => void) | null = null;
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
    this.scene.add(this.atomRoot);
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
    this.render();
  }

  /** Present the atom at tabletop scale through the active WebXR session. */
  async enterARSession(session: EventTarget): Promise<void> {
    if (this.disposed) {
      throw new Error("Cannot start AR with a disposed renderer.");
    }
    if (this.arActive) {
      return;
    }

    this.arActive = true;
    cancelAnimationFrame(this.animationFrame);
    this.renderer.xr.enabled = true;
    this.renderer.xr.setReferenceSpaceType("local");
    this.scene.background = null;
    this.atomRoot.position.set(
      arWorldAnchorPosition.x,
      arWorldAnchorPosition.y,
      arWorldAnchorPosition.z,
    );
    this.arViewTransform = DEFAULT_AR_VIEW_TRANSFORM;
    this.atomRoot.rotation.set(0, 0, 0);
    this.atomRoot.scale.setScalar(
      (this.currentFrame ? arContentScale(this.currentFrame) : 0.675) *
        this.arViewTransform.scaleFactor,
    );

    try {
      this.activeXRSession = session as XRSession;
      await this.renderer.xr.setSession(this.activeXRSession);
      this.xrRenderLoopRunning = true;
      this.renderer.setAnimationLoop((time) => {
        const frameTime = this.lastFrameTime === 0 ? 0 : time - this.lastFrameTime;
        this.lastFrameTime = time;
        this.render(frameTime);
      });
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

    this.renderer.setAnimationLoop(null);
    this.xrRenderLoopRunning = false;
    const session = this.renderer.xr.getSession();
    if (session) {
      try {
        await this.renderer.xr.setSession(null);
      } catch {
        // The browser may already have ended the session.
      }
    }
    this.renderer.xr.enabled = false;
    this.activeXRSession = null;
    this.atomRoot.position.set(0, 0, 0);
    this.atomRoot.rotation.set(0, 0, 0);
    this.atomRoot.scale.setScalar(1);
    this.arViewTransform = DEFAULT_AR_VIEW_TRANSFORM;
    this.scene.background = this.screenBackground;
    this.arActive = false;
    this.render();
    this.startDiagnosticsLoop();
  }

  /** Subscribe to live AR renderer facts for a development-only overlay. */
  setArDiagnosticsListener(
    listener: ((diagnostics: ArRenderDiagnostics) => void) | null,
  ): void {
    this.arDiagnosticsListener = listener;
    this.publishArDiagnostics();
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

  /** Show electron slot markers while a particle is being dragged. */
  beginDrag(particle: string): void {
    this.dragParticle = particle;
    this.slotLayer.classList.toggle("is-visible", particle === "electron");
    this.positionSlotMarkers();
  }

  /** Clear transient drop-zone highlights after a drag ends or is cancelled. */
  endDrag(): void {
    this.dragParticle = null;
    this.slotLayer.classList.remove("is-visible");
    this.updateDropHighlight(null, null);
  }

  /** Rotate the view without changing atom state. */
  rotate(deltaX: number, deltaY: number): void {
    this.yaw -= deltaX * 0.006;
    this.pitch = THREE.MathUtils.clamp(this.pitch + deltaY * 0.006, -1.15, 1.15);
    this.updateCamera();
  }

  /** Zoom the view within fixed comfortable camera-distance limits. */
  scale(delta: number): void {
    this.distance = THREE.MathUtils.clamp(this.distance * (delta > 0 ? 1.12 : 0.89), 7, 26);
    this.updateCamera();
  }

  /** Restore the initial camera position without changing atom state. */
  resetView(): void {
    this.yaw = 0;
    this.pitch = 0;
    this.distance = 14;
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

  /** Restore the AR atom's default scale and rotation while preserving its anchor. */
  resetArView(): void {
    this.arViewTransform = DEFAULT_AR_VIEW_TRANSFORM;
    this.atomRoot.rotation.set(0, 0, 0);
    this.updateArAtomScale();
    this.render();
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
    this.resizeObserver.disconnect();
    this.reducedMotion.removeEventListener("change", this.onReducedMotionChange);
    this.clearSphereMeshes();
    this.clearRingMeshes();
    this.nucleonGeometry.dispose();
    this.nucleusPickMesh.geometry.dispose();
    (this.nucleusPickMesh.material as THREE.Material).dispose();
    for (const material of this.materials.values()) {
      material.dispose();
    }
    this.materials.clear();
    this.renderer.dispose();
    this.canvas.remove();
    this.slotLayer.remove();
    this.diagnosticsElement?.remove();
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
    this.scene.background = transparent ? null : this.screenBackground;
    this.renderer.setClearColor(0x000000, transparent ? 0 : 1);
    this.render();
  };

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
    this.renderer.render(this.scene, this.camera);
    if (this.diagnosticsElement) {
      this.diagnosticsElement.textContent =
        `${this.renderer.info.render.calls} calls · ${frameTime.toFixed(1)} ms · ${this.qualityTier}`;
    }
    this.publishArDiagnostics();
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
      grantedFeatures: session?.enabledFeatures ?? [],
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