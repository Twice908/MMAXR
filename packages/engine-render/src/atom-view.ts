import * as THREE from "three";
import { LuminousAtom } from "./luminous-atom.js";

/** A 3D point in atom-local units. */
export interface Position3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** One batch of same-coloured spheres (protons, neutrons or electrons). */
export interface SphereBatch {
  readonly id: string;
  readonly color: number;
  readonly radius: number;
  readonly interactionTarget: string | null;
  readonly positions: readonly Position3[];
}

/** A concentric shell ring and its visual electron slots. */
export interface SceneRing {
  readonly shell: number;
  readonly radius: number;
  readonly slots: readonly {
    readonly id: string;
    readonly position: Position3;
    readonly occupied: boolean;
  }[];
  /**
   * Optional visual cue chosen by the caller, used by the luminous style: `pulse` makes the ring
   * breathe, `settled` makes it flash once and then glow calmly. The renderer gives these no
   * meaning of its own.
   */
  readonly emphasis?: "pulse" | "settled";
}

/** Declarative, subject-neutral geometry the renderer draws. */
export interface ScreenSceneFrame {
  readonly nucleusRadius: number;
  readonly spheres: readonly SphereBatch[];
  readonly rings: readonly SceneRing[];
}

/** How the atom is drawn: the original solid look, or glowing rings with orbiting electrons. */
export type AtomStyle = "classic" | "luminous";

/** Options for {@link AtomView}. */
export interface AtomViewOptions {
  /** Defaults to `classic`. */
  readonly style?: AtomStyle;
  /** Stops orbiting and breathing in the luminous style. */
  readonly reducedMotion?: boolean;
}

const RING_TUBE_RADIUS = 0.035;
const RING_COLOR = 0x3d9a9e;
const RING_HIGHLIGHT_COLOR = 0xf0b323;
const SLOT_COLOR = 0xffffff;

/**
 * View-only atom model: instanced nucleons and electrons, shell rings and free
 * electron slots, rebuilt from a {@link ScreenSceneFrame}. It never reads or
 * changes learning state. Interactive meshes carry `userData.interactionTarget`
 * (`"nucleus"` or `"shell:<n>"`) for picking.
 */
export class AtomView {
  /** Root to place, rotate and scale; its children are owned by this view. */
  readonly root = new THREE.Group();
  private readonly content = new THREE.Group();
  private readonly sphereGeometry = new THREE.SphereGeometry(1, 24, 16);
  private readonly slotGeometry = new THREE.SphereGeometry(0.07, 12, 8);
  private readonly slotMaterial = new THREE.MeshBasicMaterial({
    color: SLOT_COLOR,
    transparent: true,
    opacity: 0.55,
  });
  private readonly nucleusPickMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  private readonly ringMaterials = new Map<number, THREE.MeshStandardMaterial>();
  private readonly owned: { geometry?: THREE.BufferGeometry; material?: THREE.Material }[] = [];
  private frame: ScreenSceneFrame | null = null;
  private highlightTarget: string | null = null;
  private slotsVisible = false;
  private readonly luminous: LuminousAtom | null;

  constructor(options: AtomViewOptions = {}) {
    this.luminous = options.style === "luminous" ? new LuminousAtom(options.reducedMotion ?? false) : null;
    this.root.name = "atom-root";
    this.content.name = "atom-content";
    this.root.add(this.content);
  }

  /** Meshes that can be picked as drop targets. */
  get interactiveMeshes(): THREE.Object3D[] {
    const meshes: THREE.Object3D[] = [];
    this.content.traverse((object) => {
      if (typeof object.userData.interactionTarget === "string") meshes.push(object);
    });
    return meshes;
  }

  /** The latest frame, or null before the first update. */
  get currentFrame(): ScreenSceneFrame | null {
    return this.frame;
  }

  /** Outer radius of the drawn atom, in atom-local units. */
  get boundingRadius(): number {
    const frame = this.frame;
    if (!frame) return 1;
    const outerRing = frame.rings.reduce((radius, ring) => Math.max(radius, ring.radius), 0);
    return Math.max(frame.nucleusRadius, outerRing + RING_TUBE_RADIUS);
  }

  /** Rebuild the model from a new frame. */
  update(frame: ScreenSceneFrame): void {
    this.frame = frame;
    this.clearContent();

    if (this.luminous) {
      this.luminous.build(frame, this.content, this.sphereGeometry);
      this.addNucleusPick(frame).onBeforeRender = () => this.luminous?.tick();
      this.addSlotMarkers(frame);
      this.applyHighlight();
      return;
    }

    for (const batch of frame.spheres) {
      if (batch.positions.length === 0) continue;
      const material = new THREE.MeshStandardMaterial({
        color: batch.color,
        roughness: 0.42,
        metalness: 0.05,
      });
      const mesh = new THREE.InstancedMesh(this.sphereGeometry, material, batch.positions.length);
      mesh.name = `atom-${batch.id}`;
      const matrix = new THREE.Matrix4();
      batch.positions.forEach((position, index) => {
        matrix.makeScale(batch.radius, batch.radius, batch.radius);
        matrix.setPosition(position.x, position.y, position.z);
        mesh.setMatrixAt(index, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      this.own(mesh, undefined, material);
    }

    this.addNucleusPick(frame);

    for (const ring of frame.rings) {
      const geometry = new THREE.TorusGeometry(ring.radius, RING_TUBE_RADIUS, 12, 96);
      const material = new THREE.MeshStandardMaterial({
        color: RING_COLOR,
        roughness: 0.6,
        transparent: true,
        opacity: 0.85,
      });
      this.ringMaterials.set(ring.shell, material);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `atom-shell-${ring.shell}`;
      mesh.userData.interactionTarget = `shell:${ring.shell}`;
      this.own(mesh, geometry, material);
    }
    this.addSlotMarkers(frame);
    this.applyHighlight();
  }

  /** Show or hide free electron slots (shown while an electron is being dragged). */
  setSlotsVisible(visible: boolean): void {
    this.slotsVisible = visible;
    this.luminous?.setSlotsVisible(visible);
    this.content.traverse((object) => {
      if (object.userData.slot === true) object.visible = visible;
    });
  }

  /** Highlight one drop target (`"nucleus"` or `"shell:<n>"`), or clear with null. */
  setHighlight(target: string | null): void {
    this.highlightTarget = target;
    this.applyHighlight();
  }

  /** Free GPU resources. */
  dispose(): void {
    this.clearContent();
    this.sphereGeometry.dispose();
    this.slotGeometry.dispose();
    this.slotMaterial.dispose();
    this.nucleusPickMaterial.dispose();
    this.luminous?.dispose();
    this.root.removeFromParent();
  }

  private addNucleusPick(frame: ScreenSceneFrame): THREE.Mesh {
    const nucleusPick = new THREE.Mesh(this.sphereGeometry, this.nucleusPickMaterial);
    nucleusPick.name = "atom-nucleus-target";
    nucleusPick.scale.setScalar(Math.max(frame.nucleusRadius, 0.3) + 0.2);
    nucleusPick.userData.interactionTarget = "nucleus";
    this.content.add(nucleusPick);
    return nucleusPick;
  }

  private addSlotMarkers(frame: ScreenSceneFrame): void {
    for (const ring of frame.rings) {
      for (const slot of ring.slots) {
        if (slot.occupied) continue;
        const marker = new THREE.Mesh(this.slotGeometry, this.slotMaterial);
        marker.name = `atom-slot-${slot.id}`;
        marker.position.set(slot.position.x, slot.position.y, slot.position.z);
        marker.visible = this.slotsVisible;
        marker.userData.slot = true;
        this.content.add(marker);
      }
    }
  }

  private applyHighlight(): void {
    this.luminous?.setHighlight(this.highlightTarget);
    for (const [shell, material] of this.ringMaterials) {
      material.color.setHex(this.highlightTarget === `shell:${shell}` ? RING_HIGHLIGHT_COLOR : RING_COLOR);
    }
    this.nucleusPickMaterial.opacity = this.highlightTarget === "nucleus" ? 0.18 : 0;
  }

  private own(object: THREE.Object3D, geometry?: THREE.BufferGeometry, material?: THREE.Material): void {
    this.content.add(object);
    this.owned.push({ ...(geometry ? { geometry } : {}), ...(material ? { material } : {}) });
  }

  private clearContent(): void {
    for (const { geometry, material } of this.owned) {
      geometry?.dispose();
      material?.dispose();
    }
    this.owned.length = 0;
    this.ringMaterials.clear();
    this.luminous?.clear();
    for (const child of [...this.content.children]) {
      if (child instanceof THREE.InstancedMesh) child.dispose();
      child.removeFromParent();
    }
  }
}
