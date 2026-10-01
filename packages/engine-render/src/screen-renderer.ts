import * as THREE from "three";
import { selectSnapTarget } from "./snap-target.js";

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
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly nucleonGeometry = new THREE.SphereGeometry(1, 16, 12);
  private readonly materials = new Map<number, THREE.MeshStandardMaterial>();
  private readonly sphereMeshes: THREE.InstancedMesh[] = [];
  private readonly ringMeshes: THREE.Mesh[] = [];
  private readonly interactiveMeshes: THREE.Object3D[] = [];
  private readonly nucleusPickMesh: THREE.Mesh;
  private readonly resizeObserver: ResizeObserver;
  private readonly reducedMotion: MediaQueryList;
  private readonly diagnosticsElement: HTMLElement | null;
  private animationFrame = 0;
  private resizeFrame = 0;
  private lastFrameTime = 0;
  private yaw = 0;
  private pitch = 0;
  private distance = 14;
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
    this.host.append(this.canvas);
    this.scene.background = new THREE.Color(0xf4f4ee);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x5c6870, 2));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
    keyLight.position.set(4, 5, 9);
    this.scene.add(keyLight);
    this.camera.position.set(0, 0, this.distance);

    const pickMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.nucleusPickMesh = new THREE.Mesh(new THREE.SphereGeometry(1), pickMaterial);
    this.nucleusPickMesh.userData.interactionTarget = "nucleus";
    this.scene.add(this.nucleusPickMesh);
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
    this.clearSphereMeshes();
    this.clearRingMeshes();

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
      this.scene.add(mesh);
      this.sphereMeshes.push(mesh);
      if (batch.interactionTarget) {
        this.interactiveMeshes.push(mesh);
      }
    }

    this.nucleusPickMesh.scale.setScalar(Math.max(frame.nucleusRadius, 0.2));
    for (const ring of frame.rings) {
      const geometry = new THREE.TorusGeometry(ring.radius, 0.035, 6, 96);
      const material = new THREE.MeshBasicMaterial({
        color: ring.shell % 2 === 0 ? 0x178b87 : 0x5b6e9b,
        transparent: true,
        opacity: 0.72,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData.interactionTarget = `shell:${ring.shell}`;
      this.scene.add(mesh);
      this.ringMeshes.push(mesh);
      this.interactiveMeshes.push(mesh);
    }
    this.render();
  }

  /** Find the closest interactive scene surface under viewport coordinates. */
  pickTarget(clientX: number, clientY: number): string | null {
    const bounds = this.canvas.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) {
      return null;
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

  /** Dispose browser observers, WebGL resources, and owned DOM nodes. */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    cancelAnimationFrame(this.animationFrame);
    cancelAnimationFrame(this.resizeFrame);
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
    this.diagnosticsElement?.remove();
  }

  private readonly resize = (): void => {
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.render();
  };

  private readonly onReducedMotionChange = (): void => {
    this.startDiagnosticsLoop();
  };

  private startDiagnosticsLoop(): void {
    cancelAnimationFrame(this.animationFrame);
    if (this.diagnosticsElement && !this.reducedMotion.matches && !this.disposed) {
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
  }

  private updateCamera(): void {
    const horizontalDistance = this.distance * Math.cos(this.pitch);
    this.camera.position.set(
      horizontalDistance * Math.sin(this.yaw),
      this.distance * Math.sin(this.pitch),
      horizontalDistance * Math.cos(this.yaw),
    );
    this.camera.lookAt(0, 0, 0);
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
      this.scene.remove(mesh);
    }
    this.sphereMeshes.length = 0;
    this.interactiveMeshes.splice(0, this.interactiveMeshes.length, this.nucleusPickMesh);
  }

  private clearRingMeshes(): void {
    for (const mesh of this.ringMeshes) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.ringMeshes.length = 0;
    this.interactiveMeshes.splice(0, this.interactiveMeshes.length, this.nucleusPickMesh);
  }
}