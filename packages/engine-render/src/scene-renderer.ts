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
import { AtomView, type Position3, type ScreenSceneFrame } from "./atom-view.js";
import type { SceneContent } from "./molecule-view.js";
import { selectSnapTarget } from "./snap-target.js";
import {
  screenDropTolerancePx,
  screenPixelsToWorldUnits,
  selectProjectedSnapTarget,
  type ProjectedDropZone,
  type ScreenPoint,
} from "./screen-snap.js";
import { screenZoomConfig } from "./zoom-controls.js";
import { createXrModulePanels, type XrModulePanels, type XrModulePanelsContent } from "./xr-module-panels.js";

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
  /**
   * What to draw. Defaults to one {@link AtomView} driven by {@link SceneRenderer.update};
   * pass a {@link MoleculeView} (or other content) to draw several atoms instead.
   */
  readonly content?: SceneContent;
  /** Screen-mode camera distances. Defaults to {@link screenZoomConfig}. */
  readonly screenZoom?: ScreenZoomDistances;
  /** Content scale in XR (metres per content unit). Defaults to 0.05. */
  readonly xrContentScale?: number;
  /**
   * Phone AR with a DOM overlay: project points and pick targets through the AR camera,
   * in full-screen overlay coordinates, so page overlays (labels, grab rings) and touch
   * drags line up with the camera view. Off by default.
   */
  readonly handheldOverlay?: boolean;
  /**
   * Raise everything placed in AR/VR (model, panels, dock) by this many metres. The
   * default layout sits the model 12 cm below eye level; content below eye level appears
   * to drift down and sideways as the viewer moves toward it. Defaults to 0.
   */
  readonly xrLift?: number;
}

/** Screen-mode camera distance limits and the distance Reset view restores. */
export interface ScreenZoomDistances {
  readonly minDistance: number;
  readonly maxDistance: number;
  readonly defaultDistance: number;
}

/** A point in the scene viewport, in CSS pixels from its top-left corner. */
export interface ViewportPoint {
  readonly x: number;
  readonly y: number;
  /** False when the point is behind the camera or outside the viewport. */
  readonly visible: boolean;
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
  /** What is drawn: the default atom, or content supplied by the caller. */
  private readonly content: SceneContent;
  private readonly zoom: ScreenZoomDistances;
  private readonly xrContentScale: number;
  private readonly handheldOverlay: boolean;
  private readonly xrLift: number;
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
  private distance: number;
  /** Content width kept in view by {@link fitToWidth}, or null when not fitting. */
  private fitWidth: number | null = null;
  private fittedDistance: number | null = null;
  private drag: { pointerId: number; direction: THREE.Vector3 } | null = null;
  private xrScale = 1;
  private xrDistance: number = XR_LAYOUT.atomDistance;
  private resizeObserver: ResizeObserver | null = null;
  private xrSession: XRSession | null = null;
  private xrMode: XRSessionMode | null = null;
  private xrNeedsPlacement = false;
  private xrFrames = 0;
  private stopXrFrames: (() => void) | null = null;
  private lessonPanels: XrModulePanels | null = null;
  private lessonEntities: Entity[] = [];
  private pendingLesson: (() => XrModulePanels) | null = null;
  private disposed = false;

  constructor(options: SceneRendererOptions) {
    this.host = options.host;
    this.content = options.content ?? this.atom;
    this.zoom = options.screenZoom ?? screenZoomConfig;
    this.distance = this.zoom.defaultDistance;
    this.xrContentScale = options.xrContentScale ?? XR_ATOM_SCALE;
    this.handheldOverlay = options.handheldOverlay ?? false;
    this.xrLift = options.xrLift ?? 0;
    this.container = document.createElement("div");
    this.container.className = "iwsdk-scene-host";
    this.container.style.cssText = "position:absolute;inset:0;overflow:hidden;";
    if (getComputedStyle(this.host).position === "static") this.host.style.position = "relative";
    this.host.append(this.container);
    this.anchor.name = "atom-anchor";
    this.pivot.name = "atom-pivot";
    this.grabSphere.name = "atom-grab-sphere";
    this.anchor.add(this.pivot);
    this.pivot.add(this.content.root, this.grabSphere);
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

  /** Redraw the default atom from a new frame (when no custom content was supplied). */
  update(frame: ScreenSceneFrame): void {
    this.atom.update(frame);
    this.contentChanged();
  }

  /**
   * Keep content of this width (content units, centred) fully in view on screen. The
   * fitted distance becomes what Reset view restores, and it is updated when the
   * viewport changes shape (a phone rotating). Zooming out further is still allowed.
   */
  fitToWidth(width: number): void {
    this.fitWidth = Math.max(0, width);
    this.applyFit(true);
  }

  /** Call after updating custom content so rotation picking matches its new size. */
  contentChanged(): void {
    this.grabSphere.scale.setScalar(this.content.boundingRadius);
  }

  /**
   * Project a point in content-local units (for example a label anchor) to the scene
   * viewport in CSS pixels. Returns null before the world exists or while in XR.
   */
  projectContentPoint(point: Position3): ViewportPoint | null {
    const world = this.world;
    const canvas = this.canvas;
    if (!world || !canvas) return null;
    const overlay = this.overlayView();
    if (overlay) {
      const projected = this.content.root.localToWorld(new THREE.Vector3(point.x, point.y, point.z)).project(overlay.camera);
      const hostBounds = this.host.getBoundingClientRect();
      const x = (projected.x * 0.5 + 0.5) * overlay.width - hostBounds.left;
      const y = (-projected.y * 0.5 + 0.5) * overlay.height - hostBounds.top;
      const visible = projected.z > -1 && projected.z < 1 && x >= 0 && x <= overlay.width && y >= 0 && y <= overlay.height;
      return { x, y, visible };
    }
    if (this.xrSession) return null;
    const bounds = canvas.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return null;
    world.scene.updateMatrixWorld(true);
    const projected = this.content.root.localToWorld(new THREE.Vector3(point.x, point.y, point.z)).project(world.camera);
    const x = (projected.x * 0.5 + 0.5) * bounds.width;
    const y = (-projected.y * 0.5 + 0.5) * bounds.height;
    const visible = projected.z > -1 && projected.z < 1 && x >= 0 && x <= bounds.width && y >= 0 && y <= bounds.height;
    return { x, y, visible };
  }

  /** Rotate the screen view from a drag in CSS pixels, without changing atom state. */
  rotate(deltaX: number, deltaY: number): void {
    // Web view: the model's front follows the pointer (drag right, model turns right).
    this.rotateBy(deltaX * ROTATE_SPEED, deltaY * ROTATE_SPEED);
  }

  /** Zoom the screen view by a log-scale delta. */
  scale(delta: number): void {
    this.setDistance(this.distance * Math.exp(delta));
  }

  /** Rotate the atom in handheld AR. */
  rotateArView(deltaX: number, deltaY: number): void {
    // Handheld AR keeps its original direction; only the web view was flipped.
    this.rotateBy(-deltaX * ROTATE_SPEED, deltaY * ROTATE_SPEED);
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
    this.content.setSlotsVisible(particle === "electron");
  }

  /** End a particle drag and clear drop highlights. */
  endDrag(): void {
    this.content.setSlotsVisible(false);
    this.content.setHighlight(null);
  }

  /** Highlight one pick target (for example a drop target under the pointer), or clear with null. */
  setHighlight(target: string | null): void {
    this.content.setHighlight(target);
  }

  /** Find the drop target under viewport coordinates (screen mode). */
  pickTarget(clientX: number, clientY: number, source?: string, pointerType = "mouse"): string | null {
    const world = this.world;
    const canvas = this.canvas;
    if (!world || !canvas) return null;
    const overlay = this.overlayView();
    if (overlay) {
      const ndc = new THREE.Vector2((clientX / overlay.width) * 2 - 1, -(clientY / overlay.height) * 2 + 1);
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(ndc, overlay.camera);
      const hits = raycaster.intersectObjects(this.content.interactiveMeshes, false);
      return selectSnapTarget(hits.flatMap((hit) => {
        const target = hit.object.userData.interactionTarget;
        return typeof target === "string" ? [{ target, distance: hit.distance }] : [];
      }));
    }
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
    const hits = raycaster.intersectObjects(this.content.interactiveMeshes, false);
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
    this.distance = THREE.MathUtils.clamp(distance, this.zoom.minDistance, this.zoom.maxDistance);
    this.applyScreenAnchor();
  }

  /** Restore the default view; in XR, also re-place the atom and panels in front of the user. */
  resetView(): void {
    this.yaw = 0;
    this.pitch = 0;
    if (this.xrSession) {
      this.xrScale = 1;
      this.xrDistance = XR_LAYOUT.atomDistance;
      this.xrNeedsPlacement = true;
    } else {
      this.distance = this.fittedDistance ?? this.zoom.defaultDistance;
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

  /**
   * Show or update the shared module panels (lesson card, a side panel of info cards and
   * actions, and a dock) for modules other than the Atom Builder (AR/VR only).
   */
  setModulePanels(content: XrModulePanelsContent, onCommand: (command: string) => void): void {
    if (this.lessonPanels) {
      this.lessonPanels.update(content);
      return;
    }
    if (!this.world) {
      this.pendingLesson = () => createXrModulePanels(content, onCommand);
      return;
    }
    this.mountPanels(this.world, createXrModulePanels(content, onCommand));
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
    const position = world ? this.content.root.getWorldPosition(new THREE.Vector3()) : null;
    return {
      worldReady: world !== null,
      sessionMode: this.xrMode,
      referenceSpaceType: world?.renderer.xr.isPresenting ? (world.xrReferenceSpace ? "adopted" : "pending") : null,
      rendererPresenting: world?.renderer.xr.isPresenting ?? false,
      framesRendered: this.xrFrames,
      inputSourceCount: this.xrSession ? Array.from(this.xrSession.inputSources).length : 0,
      atomWorldPosition: position ? { x: position.x, y: position.y, z: position.z } : null,
      atomScale: this.content.root.getWorldScale(new THREE.Vector3()).x,
      lessonPanelsVisible: this.lessonPanels !== null,
    };
  }

  /** Destroy the world and free GPU resources. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopXrFrames?.();
    window.removeEventListener("resize", this.onResize);
    this.resizeObserver?.disconnect();
    this.hideLessonPanels();
    this.atomEntity?.destroy();
    if (this.content !== this.atom) this.content.dispose();
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

  /**
   * The AR camera and full-screen overlay size during handheld AR with
   * {@link SceneRendererOptions.handheldOverlay}; null otherwise.
   */
  private overlayView(): { camera: THREE.Camera; width: number; height: number } | null {
    const world = this.world;
    if (!this.handheldOverlay || !world || !this.xrSession || this.xrMode !== "immersive-ar") return null;
    const xrCamera = world.renderer.xr.getCamera();
    const camera = xrCamera.cameras[0] ?? xrCamera;
    return { camera, width: window.innerWidth, height: window.innerHeight };
  }

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
    if (pending) this.mountPanels(world, pending());
  }

  private mountPanels(world: World, panels: XrModulePanels): void {
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
    this.applyFit(false);
  };

  /**
   * Work out the distance that keeps {@link fitWidth} in view. On a new fit it is
   * applied; on a resize the view only moves back if the content would be cut off.
   */
  private applyFit(force: boolean): void {
    const world = this.world;
    if (this.fitWidth === null || !world || this.xrSession) return;
    const camera = world.camera;
    const halfVertical = THREE.MathUtils.degToRad(camera.fov) / 2;
    const halfHorizontal = Math.atan(Math.tan(halfVertical) * camera.aspect);
    const margin = 1.15;
    const needed = (this.fitWidth / 2) * margin / Math.tan(halfHorizontal);
    this.fittedDistance = THREE.MathUtils.clamp(
      Math.max(needed, this.zoom.defaultDistance),
      this.zoom.minDistance,
      this.zoom.maxDistance,
    );
    if (force || this.distance < this.fittedDistance) this.setDistance(this.fittedDistance);
  }

  private applyScreenAnchor(): void {
    if (this.xrSession) return;
    // The IWSDK camera stays at eye height looking down -Z; the atom moves instead.
    this.anchor.position.set(SCREEN_EYE.x, SCREEN_EYE.y, SCREEN_EYE.z - this.distance);
    this.anchor.quaternion.identity();
  }

  private applyPivot(): void {
    this.pivot.rotation.set(this.pitch, this.yaw, 0, "YXZ");
    this.pivot.scale.setScalar(this.xrSession ? this.xrContentScale * this.xrScale : 1);
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
      head.y - drop + this.xrLift,
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
