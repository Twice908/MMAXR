import {
  PokeInteractable,
  RayInteractable,
  ReferenceSpaceType,
  SessionMode,
  UIKitDocument,
  World,
  type Entity,
  type WorldOptions,
} from "@iwsdk/core";
import * as THREE from "three";
import { AtomView, type ScreenSceneFrame } from "./atom-view.js";
import { selectSnapTarget } from "./snap-target.js";
import {
  screenDropTolerancePx,
  screenPixelsToWorldUnits,
  selectProjectedSnapTarget,
  type ProjectedDropZone,
  type ScreenPoint,
} from "./screen-snap.js";
import { screenZoomConfig } from "./zoom-controls.js";
import { createXrLessonPanels, type XrLessonPanels } from "./xr-lesson-panels.js";
import type { XrLessonContent } from "./xr-lesson-content.js";

/** Options for {@link SceneRenderer}. */
export interface SceneRendererOptions {
  /** Scene viewport element; the canvas fills it (not the window) and it receives background-mode events. */
  readonly host: HTMLElement;
  /**
   * IWSDK world options, normally the project options from `iwsdk.config.json`
   * (`virtual:iwsdk-project`). Defaults suit tests and hosts without the IWSDK plugin.
   */
  readonly worldOptions?: WorldOptions;
  readonly diagnostics?: boolean;
}

/** Device orientation sample used by the Android camera view look-around. */
export interface DeviceOrientationSample {
  readonly alpha: number;
  readonly beta: number;
  readonly gamma: number;
  readonly screenAngleDegrees: number;
}

/** PII-free facts about the immersive scene for the development report. */
export interface XrSceneDiagnostics {
  readonly worldReady: boolean;
  readonly sessionMode: XRSessionMode | null;
  readonly referenceSpaceType: string | null;
  readonly rendererPresenting: boolean;
  readonly framesRendered: number;
  readonly inputSourceCount: number;
  readonly atomWorldPosition: { readonly x: number; readonly y: number; readonly z: number } | null;
  readonly atomScale: number;
  readonly lessonPanelsVisible: boolean;
}

/** Touch tuning for handheld AR gestures. */
export const arTouchGestureConfig = Object.freeze({
  pinchSensitivity: 0.008,
  pinchDeadZonePx: 1,
  dragThresholdPx: 4,
});

/** Default world options when no IWSDK project options are supplied. */
export const DEFAULT_WORLD_OPTIONS: WorldOptions = {
  xr: { sessionMode: SessionMode.ImmersiveAR, offer: "none", features: { handTracking: true } },
  // Desktop and touch input stay with the page's own adapters; IWSDK handles XR input.
  input: { canvasPointerEvents: false },
  render: { fov: 40, near: 0.01, far: 200, camera: { position: [0, 1.7, 0], lookAt: [0, 1.7, -1] } },
  features: {
    locomotion: false,
    grabbing: false,
    physics: false,
    sceneUnderstanding: false,
    environmentRaycast: false,
    spatialUI: { kit: "horizon", preferredColorScheme: "light" },
  },
};

/** World-locked XR placement relative to the head at session start (metres, radians). */
const XR_LAYOUT = {
  atomDistance: 0.85,
  atomDrop: 0.12,
  panelDistance: 1.05,
  panelDrop: 0.12,
  panelYaw: 0.62,
  dockDistance: 0.8,
  dockDrop: 0.48,
  dockTilt: -0.45,
} as const;
/** UIKit lays out in centimetres (100 units = 1 m); 0.1 makes 1 unit = 1 mm in XR. */
const XR_PANEL_SCALE = 0.1;
/** Atom scale in XR: the largest atom (4 shells, about 3.4 units) is about 34 cm wide. */
const XR_ATOM_SCALE = 0.05;
const SCREEN_EYE = new THREE.Vector3(0, 1.7, 0);
const ROTATE_SPEED = 0.006;
const PITCH_LIMIT = 1.15;
const AR_SCALE_LIMITS = { min: 0.5, max: 2.5 } as const;
const AR_DISTANCE_LIMITS = { min: 0.35, max: 2 } as const;
const SCREEN_BACKGROUND_MODE_EVENT = "mma:screen-background-mode";

/**
 * Renderer built on Meta's Immersive Web SDK (IWSDK). Outside XR it draws the atom
 * inside the page's scene viewport, and the page keeps its own mouse and touch input.
 * In AR/VR IWSDK owns the session, the frame loop and all XR input (controllers and
 * hands with Meta's default rays, pinch and poke), and this class adds world-locked
 * Horizon UI lesson panels. It never changes learning state; UI commands go back to
 * the caller.
 */
export class SceneRenderer {
  /** Resolves once the IWSDK world exists. */
  readonly ready: Promise<void>;
  private readonly host: HTMLElement;
  private readonly container: HTMLDivElement;
  private readonly atom = new AtomView();
  /** Positions the atom: in front of the camera on screen, world-locked in XR. */
  private readonly anchor = new THREE.Group();
  /** Applies view rotation and scale without touching the anchor. */
  private readonly pivot = new THREE.Group();
  /** Invisible sphere that receives drag-to-rotate pointer events. */
  private readonly grabSphere = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 16),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  private readonly lights: THREE.Light[] = [];
  private readonly floor = createFloor();
  private world: World | null = null;
  private atomEntity: Entity | null = null;
  private yaw = 0;
  private pitch = 0;
  private distance: number = screenZoomConfig.defaultDistance;
  private cameraLookYaw = 0;
  private cameraLookPitch = 0;
  private cameraOrientationBaseline: { alpha: number; beta: number } | null = null;
  private drag: { pointerId: number; direction: THREE.Vector3 } | null = null;
  private xrScale = 1;
  private xrDistance: number = XR_LAYOUT.atomDistance;
  private resizeObserver: ResizeObserver | null = null;
  private xrSession: XRSession | null = null;
  private xrMode: XRSessionMode | null = null;
  private xrNeedsPlacement = false;
  private xrFrames = 0;
  private stopXrFrames: (() => void) | null = null;
  private lessonPanels: XrLessonPanels | null = null;
  private lessonEntities: Entity[] = [];
  private pendingLesson: { content: XrLessonContent; onCommand: (command: string) => void } | null = null;
  private disposed = false;

  constructor(options: SceneRendererOptions) {
    this.host = options.host;
    this.container = document.createElement("div");
    this.container.className = "iwsdk-scene-host";
    this.container.style.cssText = "position:absolute;inset:0;overflow:hidden;";
    if (getComputedStyle(this.host).position === "static") this.host.style.position = "relative";
    this.host.append(this.container);
    this.anchor.name = "atom-anchor";
    this.pivot.name = "atom-pivot";
    this.grabSphere.name = "atom-grab-sphere";
    this.anchor.add(this.pivot);
    this.pivot.add(this.atom.root, this.grabSphere);
    this.host.addEventListener(SCREEN_BACKGROUND_MODE_EVENT, this.onBackgroundMode);
    this.ready = World.create(this.container, options.worldOptions ?? DEFAULT_WORLD_OPTIONS).then((world) => {
      if (this.disposed) {
        world.destroy();
        return;
      }
      this.world = world;
      this.setupScene(world);
    });
  }

  /** The WebGL canvas, once the world exists. */
  get canvas(): HTMLCanvasElement | null {
    return this.world?.renderer.domElement ?? null;
  }

  /** Redraw the atom from a new frame. */
  update(frame: ScreenSceneFrame): void {
    this.atom.update(frame);
    this.grabSphere.scale.setScalar(this.atom.boundingRadius);
  }

  /** Rotate the screen view from a drag in CSS pixels, without changing atom state. */
  rotate(deltaX: number, deltaY: number): void {
    this.rotateBy(-deltaX * ROTATE_SPEED, deltaY * ROTATE_SPEED);
  }

  /** Zoom the screen view by a log-scale delta. */
  scale(delta: number): void {
    this.setDistance(this.distance * Math.exp(delta));
  }

  /** Rotate the atom in handheld AR. */
  rotateArView(deltaX: number, deltaY: number): void {
    this.rotate(deltaX, deltaY);
  }

  /** Scale the atom in handheld AR, bounded around its default size. */
  scaleArView(delta: number): void {
    this.xrScale = THREE.MathUtils.clamp(this.xrScale * Math.exp(delta), AR_SCALE_LIMITS.min, AR_SCALE_LIMITS.max);
    this.applyPivot();
  }

  /** Push the atom away (positive y) or pull it closer in handheld AR. */
  moveArView(_deltaX: number, deltaY: number): void {
    this.xrDistance = THREE.MathUtils.clamp(
      this.xrDistance + deltaY * 0.002,
      AR_DISTANCE_LIMITS.min,
      AR_DISTANCE_LIMITS.max,
    );
    this.xrNeedsPlacement = true;
  }

  /** Start a particle drag: show free electron slots for electrons. */
  beginDrag(particle: string): void {
    this.atom.setSlotsVisible(particle === "electron");
  }

  /** End a particle drag and clear drop highlights. */
  endDrag(): void {
    this.atom.setSlotsVisible(false);
    this.atom.setHighlight(null);
  }

  /** Find the drop target under viewport coordinates (screen mode). */
  pickTarget(clientX: number, clientY: number, source?: string, pointerType = "mouse"): string | null {
    const world = this.world;
    const canvas = this.canvas;
    if (!world || !canvas) return null;
    const bounds = canvas.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return null;
    world.scene.updateMatrixWorld(true);
    const camera = world.camera;
    const pointer: ScreenPoint = { x: clientX - bounds.left, y: clientY - bounds.top };
    if (source?.startsWith("tray:")) {
      const tolerance = screenDropTolerancePx(pointerType, bounds.width);
      if (source === "tray:electron") {
        const selection = selectProjectedSnapTarget(pointer, this.projectedRingZones(bounds, camera), tolerance);
        this.atom.setHighlight(selection?.target ?? null);
        return selection?.target ?? null;
      }
      if (source === "tray:proton" || source === "tray:neutron") {
        const target = this.isNearNucleus(pointer, tolerance, bounds, camera) ? "nucleus" : null;
        this.atom.setHighlight(target);
        return target;
      }
    }
    const ndc = new THREE.Vector2((pointer.x / bounds.width) * 2 - 1, -(pointer.y / bounds.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(this.atom.interactiveMeshes, false);
    return selectSnapTarget(hits.flatMap((hit) => {
      const target = hit.object.userData.interactionTarget;
      return typeof target === "string"
        ? [{ target, distance: hit.distance, priority: target === "nucleus" ? 1 : 0 }]
        : [];
    }));
  }

  /** Rotate the atom by yaw and pitch deltas in radians, without changing atom state. */
  rotateBy(yaw: number, pitch: number): void {
    this.yaw += yaw;
    this.pitch = THREE.MathUtils.clamp(this.pitch + pitch, -PITCH_LIMIT, PITCH_LIMIT);
    this.applyPivot();
  }

  /** Current screen-mode viewing distance. */
  getDistance(): number {
    return this.distance;
  }

  /** Set the screen-mode viewing distance within the configured limits. */
  setDistance(distance: number): void {
    this.distance = THREE.MathUtils.clamp(distance, screenZoomConfig.minDistance, screenZoomConfig.maxDistance);
    this.applyScreenAnchor();
  }

  /** Restore the default view; in XR, also re-place the atom and panels in front of the user. */
  resetView(): void {
    this.yaw = 0;
    this.pitch = 0;
    this.cameraLookYaw = 0;
    this.cameraLookPitch = 0;
    this.cameraOrientationBaseline = null;
    if (this.xrSession) {
      this.xrScale = 1;
      this.xrDistance = XR_LAYOUT.atomDistance;
      this.xrNeedsPlacement = true;
    } else {
      this.distance = screenZoomConfig.defaultDistance;
      this.applyScreenAnchor();
    }
    this.applyPivot();
  }

  /** Reset the handheld AR view (same as {@link resetView}). */
  resetArView(): void {
    this.resetView();
  }

  /** Re-place the atom and panels in front of the current head pose (XR). */
  recenter(): void {
    this.xrNeedsPlacement = true;
  }

  /** Look around in the Android camera view from device orientation. */
  updateCameraViewOrientation(sample: DeviceOrientationSample): void {
    if (!this.cameraOrientationBaseline) {
      this.cameraOrientationBaseline = { alpha: sample.alpha, beta: sample.beta };
      return;
    }
    const wrap = (degrees: number): number => ((degrees + 540) % 360) - 180;
    this.cameraLookYaw = THREE.MathUtils.degToRad(wrap(sample.alpha - this.cameraOrientationBaseline.alpha));
    this.cameraLookPitch = THREE.MathUtils.clamp(
      THREE.MathUtils.degToRad(sample.beta - this.cameraOrientationBaseline.beta),
      -0.6,
      0.6,
    );
    this.applyPivot();
  }

  /** Forget the orientation baseline after a screen rotation. */
  rebaseCameraViewOrientation(): void {
    this.cameraOrientationBaseline = null;
  }

  /** Show or update the world-locked Horizon UI lesson panels (AR/VR only). */
  setLessonPanels(content: XrLessonContent, onCommand: (command: string) => void): void {
    if (this.lessonPanels) {
      this.lessonPanels.update(content);
      return;
    }
    if (!this.world) {
      this.pendingLesson = { content, onCommand };
      return;
    }
    this.createLessonPanels(this.world, content, onCommand);
  }

  /** Remove the lesson panels. */
  hideLessonPanels(): void {
    for (const entity of this.lessonEntities) entity.destroy();
    this.lessonEntities = [];
    this.lessonPanels?.dispose();
    this.lessonPanels = null;
    this.pendingLesson = null;
  }

  /**
   * Hand a session (requested by the app's session flow) to IWSDK. IWSDK then
   * renders it and runs all XR input, rays and controller/hand models.
   */
  async enterARSession(session: EventTarget, mode: XRSessionMode = "immersive-ar"): Promise<void> {
    await this.ready;
    const world = this.world;
    if (!world || this.disposed) throw new Error("The XR scene is not ready.");
    const xrSession = session as XRSession;
    this.xrSession = xrSession;
    this.xrMode = mode;
    this.xrNeedsPlacement = true;
    this.xrFrames = 0;
    this.xrScale = 1;
    this.xrDistance = XR_LAYOUT.atomDistance;
    this.yaw = 0;
    this.pitch = 0;
    world.scene.background = mode === "immersive-vr" ? new THREE.Color(0x1d2027) : null;
    this.floor.visible = mode === "immersive-vr";
    const adopted = await adoptSession(world, xrSession, mode);
    if (!adopted) {
      this.xrSession = null;
      this.xrMode = null;
      throw new Error("IWSDK could not start the XR session.");
    }
    this.stopXrFrames = world.onXRFrame(() => this.onXrFrame());
  }

  /** End the XR session (if any) and return to the screen view. */
  async exitARSession(): Promise<void> {
    const session = this.xrSession;
    this.stopXrFrames?.();
    this.stopXrFrames = null;
    this.hideLessonPanels();
    this.xrSession = null;
    this.xrMode = null;
    this.floor.visible = false;
    if (this.world) this.world.scene.background = null;
    if (session) {
      try {
        await session.end();
      } catch {
        // Already ended by the browser or the user.
      }
    }
    this.yaw = 0;
    this.pitch = 0;
    this.applyScreenAnchor();
    this.applyPivot();
    this.onResize();
  }

  /** Facts for the development XR report. */
  getXrSceneDiagnostics(): XrSceneDiagnostics {
    const world = this.world;
    const position = world ? this.atom.root.getWorldPosition(new THREE.Vector3()) : null;
    return {
      worldReady: world !== null,
      sessionMode: this.xrMode,
      referenceSpaceType: world?.renderer.xr.isPresenting ? (world.xrReferenceSpace ? "adopted" : "pending") : null,
      rendererPresenting: world?.renderer.xr.isPresenting ?? false,
      framesRendered: this.xrFrames,
      inputSourceCount: this.xrSession ? Array.from(this.xrSession.inputSources).length : 0,
      atomWorldPosition: position ? { x: position.x, y: position.y, z: position.z } : null,
      atomScale: this.atom.root.getWorldScale(new THREE.Vector3()).x,
      lessonPanelsVisible: this.lessonPanels !== null,
    };
  }

  /** Destroy the world and free GPU resources. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopXrFrames?.();
    this.host.removeEventListener(SCREEN_BACKGROUND_MODE_EVENT, this.onBackgroundMode);
    window.removeEventListener("resize", this.onResize);
    this.resizeObserver?.disconnect();
    this.hideLessonPanels();
    this.atomEntity?.destroy();
    this.atom.dispose();
    this.grabSphere.geometry.dispose();
    this.grabSphere.material.dispose();
    this.floor.geometry.dispose();
    (this.floor.material as THREE.Material).dispose();
    for (const light of this.lights) light.removeFromParent();
    this.world?.destroy();
    this.world = null;
    this.container.remove();
  }

  // --- internals -----------------------------------------------------------

  private setupScene(world: World): void {
    const hemisphere = new THREE.HemisphereLight(0xffffff, 0x5c6870, 2);
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(2, 4, 3);
    this.lights.push(hemisphere, key);
    world.scene.add(hemisphere, key, this.floor);
    world.scene.background = null;
    world.renderer.setClearColor(0x000000, 0);
    this.floor.visible = false;
    // The atom is an IWSDK entity so mouse, touch, rays and pokes can drag-rotate it.
    this.atomEntity = world.createTransformEntity(this.anchor);
    this.atomEntity.addComponent(RayInteractable);
    this.grabSphere.addEventListener("pointerdown", this.onGrabDown as never);
    this.grabSphere.addEventListener("pointermove", this.onGrabMove as never);
    this.grabSphere.addEventListener("pointerup", this.onGrabUp as never);
    this.grabSphere.addEventListener("pointercancel", this.onGrabUp as never);
    this.applyScreenAnchor();
    this.applyPivot();
    this.resizeObserver = new ResizeObserver(this.onResize);
    this.resizeObserver.observe(this.host);
    // IWSDK sizes its canvas to the window; keep it sized to the scene viewport instead.
    window.addEventListener("resize", this.onResize);
    this.onResize();
    const pending = this.pendingLesson;
    this.pendingLesson = null;
    if (pending) this.createLessonPanels(world, pending.content, pending.onCommand);
  }

  private createLessonPanels(world: World, content: XrLessonContent, onCommand: (command: string) => void): void {
    const panels = createXrLessonPanels(content, onCommand);
    this.lessonPanels = panels;
    this.lessonEntities = panels.roots.map((root, index) => {
      const holder = [panels.lesson, panels.build, panels.dock][index]!;
      holder.add(new UIKitDocument(root));
      holder.scale.setScalar(XR_PANEL_SCALE);
      const entity = world.createTransformEntity(holder);
      entity.addComponent(RayInteractable);
      entity.addComponent(PokeInteractable);
      return entity;
    });
    this.xrNeedsPlacement = true;
  }

  private readonly onGrabDown = (event: { pointerId: number; ray?: THREE.Ray }): void => {
    if (!event.ray) return;
    this.drag = { pointerId: event.pointerId, direction: event.ray.direction.clone() };
    this.grabSphere.setPointerCapture(event.pointerId);
  };

  private readonly onGrabMove = (event: { pointerId: number; ray?: THREE.Ray }): void => {
    const drag = this.drag;
    if (!drag || drag.pointerId !== event.pointerId || !event.ray) return;
    const next = event.ray.direction;
    const yawDelta = Math.atan2(next.x, -next.z) - Math.atan2(drag.direction.x, -drag.direction.z);
    const pitchDelta = Math.asin(THREE.MathUtils.clamp(next.y, -1, 1)) -
      Math.asin(THREE.MathUtils.clamp(drag.direction.y, -1, 1));
    // Amplify small ray angles so a short drag turns the atom a useful amount.
    this.rotateBy(yawDelta * 4, -pitchDelta * 4);
    drag.direction.copy(next);
  };

  private readonly onGrabUp = (event: { pointerId: number }): void => {
    if (this.drag?.pointerId !== event.pointerId) return;
    this.grabSphere.releasePointerCapture(event.pointerId);
    this.drag = null;
  };

  private readonly onResize = (): void => {
    const world = this.world;
    if (!world || world.renderer.xr.isPresenting) return;
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    world.renderer.setSize(width, height);
    world.camera.aspect = width / height;
    world.camera.updateProjectionMatrix();
  };

  private readonly onBackgroundMode = (event: Event): void => {
    const detail = (event as CustomEvent<boolean | { transparent: boolean }>).detail;
    const transparent = typeof detail === "boolean" ? detail : detail.transparent;
    this.container.classList.toggle("is-transparent", transparent);
  };

  private applyScreenAnchor(): void {
    if (this.xrSession) return;
    // The IWSDK camera stays at eye height looking down -Z; the atom moves instead.
    this.anchor.position.set(SCREEN_EYE.x, SCREEN_EYE.y, SCREEN_EYE.z - this.distance);
    this.anchor.quaternion.identity();
  }

  private applyPivot(): void {
    this.pivot.rotation.set(this.pitch - this.cameraLookPitch, this.yaw - this.cameraLookYaw, 0, "YXZ");
    this.pivot.scale.setScalar(this.xrSession ? XR_ATOM_SCALE * this.xrScale : 1);
  }

  private onXrFrame(): void {
    const world = this.world;
    if (!world) return;
    this.xrFrames += 1;
    if (!this.xrNeedsPlacement) return;
    const camera = world.renderer.xr.getCamera();
    camera.updateMatrixWorld(true);
    const head = camera.getWorldPosition(new THREE.Vector3());
    const forward = camera.getWorldDirection(new THREE.Vector3());
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) return;
    this.placeXrContent(head, Math.atan2(-forward.x, -forward.z));
    this.xrNeedsPlacement = false;
  }

  /** World-lock the atom and panels relative to the head pose, yaw only (no tilt). */
  private placeXrContent(head: THREE.Vector3, headingYaw: number): void {
    const at = (distance: number, drop: number, yawOffset: number): THREE.Vector3 => new THREE.Vector3(
      head.x - Math.sin(headingYaw + yawOffset) * distance,
      head.y - drop,
      head.z - Math.cos(headingYaw + yawOffset) * distance,
    );
    this.anchor.position.copy(at(this.xrDistance, XR_LAYOUT.atomDrop, 0));
    this.anchor.rotation.set(0, headingYaw, 0);
    this.applyPivot();
    const panels = this.lessonPanels;
    if (!panels) return;
    const placePanel = (object: THREE.Object3D, yawOffset: number): void => {
      object.position.copy(at(XR_LAYOUT.panelDistance, XR_LAYOUT.panelDrop, yawOffset));
      object.rotation.set(0, headingYaw + yawOffset, 0);
    };
    placePanel(panels.lesson, XR_LAYOUT.panelYaw);
    placePanel(panels.build, -XR_LAYOUT.panelYaw);
    panels.dock.position.copy(at(XR_LAYOUT.dockDistance, XR_LAYOUT.dockDrop, 0));
    panels.dock.rotation.set(XR_LAYOUT.dockTilt, headingYaw, 0, "YXZ");
  }

  private projectedRingZones(bounds: DOMRect, camera: THREE.Camera): ProjectedDropZone[] {
    const frame = this.atom.currentFrame;
    if (!frame) return [];
    const toScreen = (local: THREE.Vector3): ScreenPoint => {
      const projected = this.atom.root.localToWorld(local).project(camera);
      return { x: (projected.x * 0.5 + 0.5) * bounds.width, y: (-projected.y * 0.5 + 0.5) * bounds.height };
    };
    return frame.rings.map((ring) => ({
      target: `shell:${ring.shell}`,
      outline: Array.from({ length: 96 }, (_, index) => {
        const angle = (2 * Math.PI * index) / 96;
        return toScreen(new THREE.Vector3(Math.cos(angle) * ring.radius, Math.sin(angle) * ring.radius, 0));
      }),
      slots: ring.slots
        .filter((slot) => !slot.occupied)
        .map((slot) => ({
          id: slot.id,
          point: toScreen(new THREE.Vector3(slot.position.x, slot.position.y, slot.position.z)),
        })),
    }));
  }

  private isNearNucleus(
    pointer: ScreenPoint,
    tolerancePx: number,
    bounds: DOMRect,
    camera: THREE.PerspectiveCamera,
  ): boolean {
    const nucleusRadius = Math.max(this.atom.currentFrame?.nucleusRadius ?? 0.3, 0.3);
    const centerWorld = this.atom.root.getWorldPosition(new THREE.Vector3());
    const project = (point: THREE.Vector3): ScreenPoint => {
      const projected = point.clone().project(camera);
      return { x: (projected.x * 0.5 + 0.5) * bounds.width, y: (-projected.y * 0.5 + 0.5) * bounds.height };
    };
    const center = project(centerWorld);
    const toleranceWorld = screenPixelsToWorldUnits(
      tolerancePx,
      Math.max(0.1, camera.getWorldPosition(new THREE.Vector3()).distanceTo(centerWorld) - nucleusRadius),
      camera.fov,
      bounds.height,
    );
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
    const edge = project(centerWorld.clone().addScaledVector(right, nucleusRadius + toleranceWorld));
    return Math.hypot(pointer.x - center.x, pointer.y - center.y) <= Math.hypot(edge.x - center.x, edge.y - center.y);
  }
}

function createFloor(): THREE.Mesh {
  // A soft floor disc gives a stable horizon reference in VR (comfort).
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(4, 64).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x3a3f4b, roughness: 0.95 }),
  );
  mesh.name = "vr-floor";
  return mesh;
}

/**
 * Adopt an app-requested session into IWSDK: the same steps IWSDK's own
 * `launchXR` takes after `requestSession` (reference space, renderer session,
 * `world.session`), so IWSDK input and rendering run on it.
 */
async function adoptSession(world: World, session: XRSession, mode: XRSessionMode): Promise<boolean> {
  const candidates = mode === "immersive-vr"
    ? [ReferenceSpaceType.LocalFloor, ReferenceSpaceType.Local]
    : [ReferenceSpaceType.Local, ReferenceSpaceType.LocalFloor];
  let resolved: ReferenceSpaceType | null = null;
  for (const type of candidates) {
    try {
      await session.requestReferenceSpace(type);
      resolved = type;
      break;
    } catch {
      // Try the next reference space type.
    }
  }
  if (!resolved) return false;
  world.renderer.xr.enabled = true;
  world.renderer.xr.setReferenceSpaceType(resolved);
  await world.renderer.xr.setSession(session);
  world.session = session;
  session.addEventListener("end", () => {
    if (world.session === session) world.session = undefined;
  }, { once: true });
  return true;
}

/** Ask the renderer under `host` to make its background transparent (camera view). */
export function setScreenRendererTransparentBackground(
  host: HTMLElement,
  transparent: boolean,
  androidCameraLayout = false,
): void {
  host.dispatchEvent(new CustomEvent(SCREEN_BACKGROUND_MODE_EVENT, {
    bubbles: true,
    detail: androidCameraLayout ? { transparent, androidCameraLayout } : transparent,
  }));
}

/** Whether a DOM settings button should be offered while AR or the camera view is active. */
export function shouldShowSpatialSettingsFallback(arActive: boolean, cameraViewActive: boolean): boolean {
  return arActive || cameraViewActive;
}
