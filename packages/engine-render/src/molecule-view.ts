import * as THREE from "three";
import { AtomView, type Position3, type ScreenSceneFrame } from "./atom-view.js";

/** One atom placed in a multi-atom scene. */
export interface MoleculeSceneAtom {
  /** Stable id; the atom's pick target is `atom:<id>`. */
  readonly id: string;
  /** Centre of the atom in scene units. */
  readonly position: Position3;
  /** Outer radius of the drawn atom, used for picking and fitting. */
  readonly radius: number;
  /** The atom's own particles and rings around its centre. */
  readonly atom: ScreenSceneFrame;
}

/** A line between two atoms: a faint attraction, or a solid bond. */
export interface MoleculeSceneLink {
  readonly from: string;
  readonly to: string;
  readonly kind: "attraction" | "bond";
}

/** Declarative, subject-neutral geometry for several atoms and the links between them. */
export interface MoleculeSceneFrame {
  readonly atoms: readonly MoleculeSceneAtom[];
  readonly links: readonly MoleculeSceneLink[];
}

/**
 * The view-only content a {@link SceneRenderer} places, rotates and scales.
 * {@link AtomView} (one atom) and {@link MoleculeView} (several atoms) both fit.
 */
export interface SceneContent {
  readonly root: THREE.Object3D;
  /** Outer radius of everything drawn, in content-local units. */
  readonly boundingRadius: number;
  /** Meshes carrying `userData.interactionTarget`, for picking. */
  readonly interactiveMeshes: THREE.Object3D[];
  /** Highlight one pick target, or clear with null. */
  setHighlight(target: string | null): void;
  /** Show or hide free electron slots. */
  setSlotsVisible(visible: boolean): void;
  dispose(): void;
}

/** A tag drawn in the scene above an atom, such as "Na" or "Cl" with a raised "−". */
export interface MoleculeLabel {
  readonly id: string;
  readonly symbol: string;
  /** Raised charge text ("", "+", "2+", "−"). */
  readonly charge: string;
  /** Border colour cue; the charge text carries the meaning, not the colour. */
  readonly tone: "positive" | "negative" | "neutral";
  /** Bottom centre of the tag, in content-local units. */
  readonly position: Position3;
}

/** Options for {@link MoleculeView}. */
export interface MoleculeViewOptions {
  /** Canvas factory for label textures; defaults to `document.createElement("canvas")`. */
  readonly createCanvas?: () => HTMLCanvasElement;
}

/** Height of an in-scene label in content units (about 7.5 cm at the AR/VR scale of 0.025). */
const LABEL_HEIGHT = 3;
const LABEL_BORDER = { positive: "#b9412d", negative: "#287f83", neutral: "#d7dfdb" } as const;

/** Pick target id for an atom in a {@link MoleculeView}. */
export function moleculeAtomTarget(atomId: string): string {
  return `atom:${atomId}`;
}

/** Atom id from a `atom:<id>` pick target, or null for any other target. */
export function atomIdFromTarget(target: string | null): string | null {
  return target?.startsWith("atom:") ? target.slice("atom:".length) || null : null;
}

const LINK_COLOR = { attraction: 0xf0b323, bond: 0x3d9a9e } as const;
const LINK_RADIUS = { attraction: 0.03, bond: 0.07 } as const;
const PICK_HIGHLIGHT_OPACITY = 0.16;

interface PlacedAtom {
  readonly group: THREE.Group;
  readonly view: AtomView;
  readonly pick: THREE.Mesh;
  readonly pickMaterial: THREE.MeshBasicMaterial;
}

/**
 * View-only model of several atoms, each drawn by its own {@link AtomView}, with
 * attraction or bond lines between them. Each atom has one invisible pick sphere
 * whose target is `atom:<id>`. It never reads or changes learning state.
 */
export class MoleculeView implements SceneContent {
  readonly root = new THREE.Group();
  private readonly atoms = new Map<string, PlacedAtom>();
  private readonly linkGroup = new THREE.Group();
  private readonly pickGeometry = new THREE.SphereGeometry(1, 24, 16);
  private readonly linkGeometry = new THREE.CylinderGeometry(1, 1, 1, 12);
  private readonly linkMaterials = {
    attraction: new THREE.MeshBasicMaterial({ color: LINK_COLOR.attraction, transparent: true, opacity: 0.7 }),
    bond: new THREE.MeshStandardMaterial({ color: LINK_COLOR.bond, roughness: 0.5 }),
  };
  private frame: MoleculeSceneFrame | null = null;
  private highlightTarget: string | null = null;
  private readonly labelGroup = new THREE.Group();
  private readonly labels = new Map<string, { key: string; sprite: THREE.Sprite; texture: THREE.CanvasTexture }>();
  private readonly createCanvas: () => HTMLCanvasElement;

  constructor(options: MoleculeViewOptions = {}) {
    this.createCanvas = options.createCanvas ?? (() => document.createElement("canvas"));
    this.labelGroup.name = "molecule-labels";
    this.root.name = "molecule-root";
    this.linkGroup.name = "molecule-links";
    this.root.add(this.linkGroup, this.labelGroup);
  }

  /**
   * Show tags above atoms inside the scene (for headsets and the emulator, where page
   * overlays are not drawn). Pass an empty list to remove them. Tags always face the
   * viewer and never take pointer hits.
   */
  setLabels(labels: readonly MoleculeLabel[]): void {
    const ids = new Set(labels.map((label) => label.id));
    for (const [id, entry] of this.labels) {
      if (!ids.has(id)) {
        this.disposeLabel(entry);
        this.labels.delete(id);
      }
    }
    for (const label of labels) {
      const key = `${label.symbol}|${label.charge}|${label.tone}`;
      let entry = this.labels.get(label.id);
      if (!entry || entry.key !== key) {
        if (entry) this.disposeLabel(entry);
        entry = this.createLabel(label, key);
        this.labels.set(label.id, entry);
      }
      const { sprite } = entry;
      sprite.position.set(label.position.x, label.position.y + sprite.scale.y / 2, label.position.z);
    }
  }

  /** The latest frame, or null before the first update. */
  get currentFrame(): MoleculeSceneFrame | null {
    return this.frame;
  }

  get boundingRadius(): number {
    const frame = this.frame;
    if (!frame || frame.atoms.length === 0) return 1;
    return frame.atoms.reduce(
      (radius, atom) => Math.max(radius, Math.hypot(atom.position.x, atom.position.y, atom.position.z) + atom.radius),
      0,
    );
  }

  get interactiveMeshes(): THREE.Object3D[] {
    return [...this.atoms.values()].map((placed) => placed.pick);
  }

  /** Redraw from a new frame, reusing the views of atoms that are still present. */
  update(frame: MoleculeSceneFrame): void {
    this.frame = frame;
    const ids = new Set(frame.atoms.map((atom) => atom.id));
    for (const [id, placed] of this.atoms) {
      if (!ids.has(id)) {
        this.disposeAtom(placed);
        this.atoms.delete(id);
      }
    }
    for (const atom of frame.atoms) {
      const placed = this.atoms.get(atom.id) ?? this.createAtom(atom.id);
      placed.group.position.set(atom.position.x, atom.position.y, atom.position.z);
      placed.view.update(atom.atom);
      placed.pick.scale.setScalar(atom.radius);
    }
    this.updateLinks(frame);
    this.applyHighlight();
  }

  /** Centre of an atom in content-local units, or null when it is not drawn. */
  atomPosition(atomId: string): Position3 | null {
    const atom = this.frame?.atoms.find((candidate) => candidate.id === atomId);
    return atom ? atom.position : null;
  }

  setHighlight(target: string | null): void {
    this.highlightTarget = target;
    this.applyHighlight();
  }

  setSlotsVisible(visible: boolean): void {
    for (const placed of this.atoms.values()) placed.view.setSlotsVisible(visible);
  }

  /** Show free electron slots only on these atoms (for example, the atoms that can take one). */
  setSlotsVisibleFor(atomIds: readonly string[]): void {
    for (const [id, placed] of this.atoms) placed.view.setSlotsVisible(atomIds.includes(id));
  }

  dispose(): void {
    for (const placed of this.atoms.values()) this.disposeAtom(placed);
    this.atoms.clear();
    this.clearLinks();
    this.setLabels([]);
    this.pickGeometry.dispose();
    this.linkGeometry.dispose();
    this.linkMaterials.attraction.dispose();
    this.linkMaterials.bond.dispose();
    this.root.removeFromParent();
  }

  private createAtom(id: string): PlacedAtom {
    const group = new THREE.Group();
    group.name = `molecule-atom-${id}`;
    const view = new AtomView();
    const pickMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
    const pick = new THREE.Mesh(this.pickGeometry, pickMaterial);
    pick.name = `molecule-pick-${id}`;
    pick.userData.interactionTarget = moleculeAtomTarget(id);
    group.add(view.root, pick);
    this.root.add(group);
    const placed = { group, view, pick, pickMaterial };
    this.atoms.set(id, placed);
    return placed;
  }

  private createLabel(label: MoleculeLabel, key: string): { key: string; sprite: THREE.Sprite; texture: THREE.CanvasTexture } {
    const canvas = this.createCanvas();
    const context = canvas.getContext("2d");
    const pixelHeight = 128;
    const symbolFont = "700 72px system-ui, sans-serif";
    const chargeFont = "700 46px system-ui, sans-serif";
    let width = 160;
    if (context) {
      context.font = symbolFont;
      const symbolWidth = context.measureText(label.symbol).width;
      context.font = chargeFont;
      const chargeWidth = label.charge ? context.measureText(label.charge).width + 4 : 0;
      width = Math.max(pixelHeight, Math.ceil(symbolWidth + chargeWidth + 64));
    }
    canvas.width = width;
    canvas.height = pixelHeight;
    if (context) {
      const radius = pixelHeight / 2 - 6;
      context.lineWidth = 8;
      context.fillStyle = "#ffffff";
      context.strokeStyle = LABEL_BORDER[label.tone];
      context.beginPath();
      context.roundRect(4, 4, width - 8, pixelHeight - 8, radius);
      context.fill();
      context.stroke();
      context.fillStyle = "#1e292d";
      context.textBaseline = "alphabetic";
      context.font = symbolFont;
      const symbolWidth = context.measureText(label.symbol).width;
      context.font = chargeFont;
      const chargeWidth = label.charge ? context.measureText(label.charge).width + 4 : 0;
      const start = (width - symbolWidth - chargeWidth) / 2;
      context.font = symbolFont;
      context.fillText(label.symbol, start, 90);
      if (label.charge) {
        context.font = chargeFont;
        context.fillText(label.charge, start + symbolWidth + 4, 58);
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    sprite.name = `molecule-label-${label.id}`;
    sprite.scale.set((LABEL_HEIGHT * width) / pixelHeight, LABEL_HEIGHT, 1);
    // Labels are read, not pointed at: let rays pass through to the model.
    sprite.raycast = () => undefined;
    this.labelGroup.add(sprite);
    return { key, sprite, texture };
  }

  private disposeLabel(entry: { sprite: THREE.Sprite; texture: THREE.CanvasTexture }): void {
    entry.texture.dispose();
    entry.sprite.material.dispose();
    entry.sprite.removeFromParent();
  }

  private disposeAtom(placed: PlacedAtom): void {
    placed.view.dispose();
    placed.pickMaterial.dispose();
    placed.group.removeFromParent();
  }

  private updateLinks(frame: MoleculeSceneFrame): void {
    this.clearLinks();
    const byId = new Map(frame.atoms.map((atom) => [atom.id, atom]));
    for (const link of frame.links) {
      const from = byId.get(link.from);
      const to = byId.get(link.to);
      if (!from || !to) continue;
      const start = new THREE.Vector3(from.position.x, from.position.y, from.position.z);
      const end = new THREE.Vector3(to.position.x, to.position.y, to.position.z);
      const direction = end.clone().sub(start);
      const centreDistance = direction.length();
      if (centreDistance < 1e-6) continue;
      direction.normalize();
      // Draw from nucleus edge to nucleus edge so the line reads as joining the two centres.
      const inset = Math.min(from.atom.nucleusRadius + 0.1, centreDistance / 2);
      const outset = Math.min(to.atom.nucleusRadius + 0.1, centreDistance / 2);
      const a = start.clone().addScaledVector(direction, inset);
      const b = end.clone().addScaledVector(direction, -outset);
      const length = a.distanceTo(b);
      if (length < 1e-6) continue;
      const mesh = new THREE.Mesh(this.linkGeometry, this.linkMaterials[link.kind]);
      mesh.name = `molecule-link-${link.kind}-${link.from}-${link.to}`;
      mesh.position.copy(a).add(b).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
      mesh.scale.set(LINK_RADIUS[link.kind], length, LINK_RADIUS[link.kind]);
      this.linkGroup.add(mesh);
    }
  }

  private clearLinks(): void {
    for (const child of [...this.linkGroup.children]) child.removeFromParent();
  }

  private applyHighlight(): void {
    for (const [id, placed] of this.atoms) {
      placed.pickMaterial.opacity = this.highlightTarget === moleculeAtomTarget(id) ? PICK_HIGHLIGHT_OPACITY : 0;
    }
  }
}
