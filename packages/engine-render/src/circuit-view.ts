import * as THREE from "three";
import type { Position3 } from "./atom-view.js";
import type { SceneContent } from "./molecule-view.js";

/** Shapes a {@link CircuitView} can draw. */
export type CircuitPartShape = "battery" | "resistor" | "bulb" | "switch" | "ammeter" | "voltmeter" | "wire";

/** One part placed in the circuit drawing. */
export interface CircuitScenePart {
  readonly id: string;
  readonly shape: CircuitPartShape;
  readonly position: Position3;
  /** Direction the current runs through the part, in radians from +x in the x-y plane. */
  readonly angle: number;
  /** Length along the wire, in content units. */
  readonly length: number;
  /** Battery: number of cells drawn. */
  readonly cells?: number;
  /** Switch: closed (lever down) or open (lever swung out). */
  readonly closed?: boolean;
  /** Bulb: brightness from 0 (off) to 1 (full). */
  readonly glow?: number;
  /** Meters: needle deflection from 0 (zero) to 1 (full scale). */
  readonly dial?: number;
  /** Side to swing an open switch towards (unit vector), usually out of the loop. */
  readonly outward?: Position3;
}

/** Declarative circuit geometry: parts, wires and the path the charges follow. */
export interface CircuitSceneFrame {
  readonly parts: readonly CircuitScenePart[];
  /** Wire polylines. */
  readonly wires: readonly (readonly Position3[])[];
  /** Closed path in the direction of conventional current; empty when no current flows. */
  readonly currentPath: readonly Position3[];
  /**
   * Speed of the moving charges in content units per second. 0 holds them still
   * (no current, or reduced motion); arrows still show the direction when a path is set.
   */
  readonly flowSpeed: number;
}

/** Options for {@link CircuitView}. */
export interface CircuitViewOptions {
  /**
   * Milliseconds clock used to move the charges each time the scene is drawn, so they
   * move in screen, AR and VR alike. Defaults to `performance.now`.
   */
  readonly now?: () => number;
}

/** Pick target id for a part in a {@link CircuitView}. */
export function circuitPartTarget(partId: string): string {
  return `part:${partId}`;
}

const WIRE_RADIUS = 0.08;
const CHARGE_COUNT = 40;
const ARROW_FRACTIONS = [0.12, 0.37, 0.62, 0.87] as const;
const COLOR = {
  wire: 0x3d4b52,
  charge: 0xf0b323,
  arrow: 0x287f83,
  cell: 0x2f3a40,
  cap: 0xb87333,
  resistor: 0xd8c39a,
  band: [0x7a4b2a, 0x1e1e1e, 0xb9412d],
  base: 0xe8ece9,
  metal: 0x9aa4a8,
  ammeter: 0x287f83,
  voltmeter: 0xb9412d,
  face: 0xffffff,
  glass: 0xfff6d5,
  highlight: 0x1a5fb4,
} as const;

/**
 * View-only drawing of a circuit lying in the x-y plane: wires, batteries of cells,
 * resistors, bulbs that glow, switches, and meters with a needle. Charges move along
 * the current path in the direction of conventional current (+ to −), at a speed set
 * by the frame; arrows show the direction even when motion is reduced. The charges
 * advance whenever the scene is drawn (also inside XR sessions, where the page's own
 * animation frames may pause); {@link CircuitView.tick} moves them by hand. It never
 * reads or changes learning state.
 */
export class CircuitView implements SceneContent {
  readonly root = new THREE.Group();
  private readonly partsGroup = new THREE.Group();
  private readonly wiresGroup = new THREE.Group();
  private readonly arrowsGroup = new THREE.Group();
  private readonly geometry = {
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 20),
    sphere: new THREE.SphereGeometry(1, 20, 14),
    box: new THREE.BoxGeometry(1, 1, 1),
    cone: new THREE.ConeGeometry(1, 1, 16),
  };
  private readonly material = {
    wire: new THREE.MeshStandardMaterial({ color: COLOR.wire, roughness: 0.6 }),
    charge: new THREE.MeshStandardMaterial({ color: COLOR.charge, emissive: COLOR.charge, emissiveIntensity: 0.6 }),
    arrow: new THREE.MeshStandardMaterial({ color: COLOR.arrow, roughness: 0.5 }),
    cell: new THREE.MeshStandardMaterial({ color: COLOR.cell, roughness: 0.5 }),
    cap: new THREE.MeshStandardMaterial({ color: COLOR.cap, metalness: 0.6, roughness: 0.35 }),
    resistor: new THREE.MeshStandardMaterial({ color: COLOR.resistor, roughness: 0.6 }),
    bands: COLOR.band.map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.6 })),
    base: new THREE.MeshStandardMaterial({ color: COLOR.base, roughness: 0.8 }),
    metal: new THREE.MeshStandardMaterial({ color: COLOR.metal, metalness: 0.7, roughness: 0.3 }),
    ammeter: new THREE.MeshStandardMaterial({ color: COLOR.ammeter, roughness: 0.5 }),
    voltmeter: new THREE.MeshStandardMaterial({ color: COLOR.voltmeter, roughness: 0.5 }),
    face: new THREE.MeshStandardMaterial({ color: COLOR.face, roughness: 0.9 }),
    needle: new THREE.MeshBasicMaterial({ color: COLOR.cell }),
    pick: new THREE.MeshBasicMaterial({ color: COLOR.highlight, transparent: true, opacity: 0, depthWrite: false }),
  };
  private readonly charges = new THREE.InstancedMesh(this.geometry.sphere, this.material.charge, CHARGE_COUNT);
  private readonly picks = new Map<string, THREE.Mesh>();
  /** Per-part materials (bulb glass, pick highlight) rebuilt with the parts. */
  private partMaterials: THREE.Material[] = [];
  private frame: CircuitSceneFrame | null = null;
  private path: { points: THREE.Vector3[]; lengths: number[]; total: number } | null = null;
  private flowOffset = 0;
  private highlightTarget: string | null = null;
  private readonly dummy = new THREE.Object3D();
  private lastDrawn: number | null = null;

  constructor(options: CircuitViewOptions = {}) {
    const now = options.now ?? (() => performance.now());
    this.root.name = "circuit-root";
    this.partsGroup.name = "circuit-parts";
    this.wiresGroup.name = "circuit-wires";
    this.arrowsGroup.name = "circuit-arrows";
    this.charges.name = "circuit-charges";
    this.charges.count = 0;
    this.charges.frustumCulled = false;
    // Advance once per drawn frame; the second eye of a stereo frame sees no time pass.
    this.charges.onBeforeRender = () => {
      const time = now();
      if (this.lastDrawn !== null) this.tick((time - this.lastDrawn) / 1000);
      this.lastDrawn = time;
    };
    this.root.add(this.wiresGroup, this.partsGroup, this.arrowsGroup, this.charges);
  }

  /** The latest frame, or null before the first update. */
  get currentFrame(): CircuitSceneFrame | null {
    return this.frame;
  }

  get boundingRadius(): number {
    const frame = this.frame;
    if (!frame) return 1;
    let radius = 1;
    for (const part of frame.parts) radius = Math.max(radius, Math.hypot(part.position.x, part.position.y) + part.length / 2);
    for (const wire of frame.wires) for (const point of wire) radius = Math.max(radius, Math.hypot(point.x, point.y));
    return radius;
  }

  get interactiveMeshes(): THREE.Object3D[] {
    return [...this.picks.values()];
  }

  /** Redraw from a new frame. */
  update(frame: CircuitSceneFrame): void {
    this.frame = frame;
    this.clearGroup(this.partsGroup);
    this.clearGroup(this.wiresGroup);
    this.clearGroup(this.arrowsGroup);
    for (const material of this.partMaterials) material.dispose();
    this.partMaterials = [];
    this.picks.clear();

    for (const wire of frame.wires) this.drawPolyline(this.wiresGroup, wire, WIRE_RADIUS, this.material.wire);
    for (const part of frame.parts) this.drawPart(part);

    this.path = frame.currentPath.length > 1 ? measure(frame.currentPath) : null;
    if (this.path) {
      for (const fraction of ARROW_FRACTIONS) {
        const { point, direction } = this.sample(fraction * this.path.total);
        const arrow = new THREE.Mesh(this.geometry.cone, this.material.arrow);
        arrow.name = "circuit-arrow";
        arrow.scale.set(0.26, 0.55, 0.26);
        arrow.position.copy(point).setZ(0.4);
        arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
        this.arrowsGroup.add(arrow);
      }
    }
    this.placeCharges();
    this.applyHighlight();
  }

  /** Move the charges by `deltaSeconds` of the frame's flow speed. */
  tick(deltaSeconds: number): void {
    if (!this.path || !this.frame || this.frame.flowSpeed <= 0) return;
    this.flowOffset = (this.flowOffset + this.frame.flowSpeed * Math.max(0, Math.min(deltaSeconds, 0.1))) % this.path.total;
    this.placeCharges();
  }

  setHighlight(target: string | null): void {
    this.highlightTarget = target;
    this.applyHighlight();
  }

  /** Circuits have no electron slots; part of {@link SceneContent}. */
  setSlotsVisible(): void {
    // Nothing to show.
  }

  dispose(): void {
    this.clearGroup(this.partsGroup);
    this.clearGroup(this.wiresGroup);
    this.clearGroup(this.arrowsGroup);
    for (const material of this.partMaterials) material.dispose();
    for (const geometry of Object.values(this.geometry)) geometry.dispose();
    for (const material of Object.values(this.material)) {
      if (Array.isArray(material)) material.forEach((item) => item.dispose());
      else material.dispose();
    }
    this.charges.dispose();
    this.root.removeFromParent();
  }

  private drawPart(part: CircuitScenePart): void {
    const group = new THREE.Group();
    group.name = `circuit-part-${part.id}`;
    group.position.set(part.position.x, part.position.y, part.position.z);
    group.rotation.z = part.angle;
    const half = part.length / 2;
    // Local frame: +x is the current's direction through the part, +z faces the viewer.
    switch (part.shape) {
      case "battery": {
        const cells = Math.max(1, part.cells ?? 1);
        const cellLength = (part.length - 0.5) / cells;
        for (let index = 0; index < cells; index += 1) {
          const x = -half + 0.25 + cellLength * (index + 0.5);
          group.add(this.rod(this.material.cell, 0.42, cellLength * 0.86, x));
          // The + cap faces the way the current leaves the cell.
          group.add(this.rod(this.material.cap, 0.16, 0.12, x + cellLength * 0.43 + 0.05));
        }
        group.add(this.rod(this.material.wire, WIRE_RADIUS, 0.3, -half + 0.15), this.rod(this.material.wire, WIRE_RADIUS, 0.3, half - 0.15));
        break;
      }
      case "resistor": {
        group.add(this.rod(this.material.wire, WIRE_RADIUS, part.length, 0));
        group.add(this.rod(this.material.resistor, 0.36, part.length * 0.62, 0));
        this.material.bands.forEach((material, index) => {
          group.add(this.rod(material, 0.37, 0.1, -part.length * 0.18 + index * 0.18));
        });
        break;
      }
      case "bulb": {
        const glow = Math.max(0, Math.min(1, part.glow ?? 0));
        const glass = new THREE.MeshStandardMaterial({
          color: COLOR.glass,
          emissive: 0xffb300,
          emissiveIntensity: glow * 3.5,
          transparent: true,
          opacity: 0.55 + glow * 0.35,
          roughness: 0.15,
        });
        this.partMaterials.push(glass);
        group.add(this.rod(this.material.wire, WIRE_RADIUS, part.length, 0));
        const bulb = new THREE.Mesh(this.geometry.sphere, glass);
        bulb.scale.setScalar(0.66);
        bulb.position.set(0, 0, 0.1);
        const base = new THREE.Mesh(this.geometry.box, this.material.metal);
        base.scale.set(0.6, 0.36, 0.42);
        base.position.set(0, -0.6, 0);
        group.add(bulb, base);
        break;
      }
      case "switch": {
        const base = new THREE.Mesh(this.geometry.box, this.material.base);
        base.scale.set(part.length, 0.7, 0.12);
        base.position.z = -0.1;
        const postA = new THREE.Mesh(this.geometry.sphere, this.material.metal);
        const postB = new THREE.Mesh(this.geometry.sphere, this.material.metal);
        postA.scale.setScalar(0.16);
        postB.scale.setScalar(0.16);
        postA.position.set(-half + 0.15, 0, 0.05);
        postB.position.set(half - 0.15, 0, 0.05);
        const lever = new THREE.Mesh(this.geometry.box, this.material.metal);
        const leverLength = part.length - 0.3;
        lever.scale.set(leverLength, 0.12, 0.12);
        const pivot = new THREE.Group();
        pivot.position.set(-half + 0.15, 0, 0.1);
        lever.position.x = leverLength / 2;
        pivot.add(lever);
        if (!part.closed) pivot.rotation.z = this.openSwing(part);
        group.add(base, postA, postB, pivot);
        break;
      }
      case "ammeter":
      case "voltmeter": {
        const rim = new THREE.Mesh(this.geometry.cylinder, this.material[part.shape]);
        rim.rotation.x = Math.PI / 2;
        rim.scale.set(0.8, 0.2, 0.8);
        const face = new THREE.Mesh(this.geometry.cylinder, this.material.face);
        face.rotation.x = Math.PI / 2;
        face.scale.set(0.68, 0.02, 0.68);
        face.position.z = 0.11;
        // The needle turns in the drawing's frame, so undo the part's own rotation.
        const needle = new THREE.Mesh(this.geometry.box, this.material.needle);
        const deflection = Math.max(0, Math.min(1, part.dial ?? 0));
        const needlePivot = new THREE.Group();
        needlePivot.position.set(0, 0, 0.13);
        needlePivot.rotation.z = -part.angle + Math.PI * (0.75 - 0.5 * deflection);
        needle.scale.set(0.56, 0.05, 0.02);
        needle.position.x = 0.28;
        needlePivot.add(needle);
        group.add(this.rod(this.material.wire, WIRE_RADIUS, part.length, 0), rim, face, needlePivot);
        break;
      }
      case "wire":
        group.add(this.rod(this.material.wire, WIRE_RADIUS, part.length, 0));
        break;
    }
    const pickMaterial = this.material.pick.clone();
    this.partMaterials.push(pickMaterial);
    const pick = new THREE.Mesh(this.geometry.box, pickMaterial);
    pick.name = `circuit-pick-${part.id}`;
    pick.scale.set(part.length, 1.7, 1);
    pick.userData.interactionTarget = circuitPartTarget(part.id);
    group.add(pick);
    this.picks.set(part.id, pick);
    this.partsGroup.add(group);
  }

  /** Angle that swings an open lever towards the outward side, in the part's local frame. */
  private openSwing(part: CircuitScenePart): number {
    const outward = part.outward;
    if (!outward) return Math.PI / 6;
    // Local +y in world terms is (−sin, cos) of the part's angle.
    const side = -Math.sin(part.angle) * outward.x + Math.cos(part.angle) * outward.y;
    return side >= 0 ? Math.PI / 6 : -Math.PI / 6;
  }

  /** A cylinder along local x, centred at `x`. */
  private rod(material: THREE.Material, radius: number, length: number, x: number): THREE.Mesh {
    const mesh = new THREE.Mesh(this.geometry.cylinder, material);
    mesh.rotation.z = Math.PI / 2;
    mesh.scale.set(radius, length, radius);
    mesh.position.x = x;
    return mesh;
  }

  private drawPolyline(group: THREE.Group, points: readonly Position3[], radius: number, material: THREE.Material): void {
    for (let index = 1; index < points.length; index += 1) {
      const a = points[index - 1] as Position3;
      const b = points[index] as Position3;
      const start = new THREE.Vector3(a.x, a.y, a.z);
      const end = new THREE.Vector3(b.x, b.y, b.z);
      const length = start.distanceTo(end);
      if (length < 1e-6) continue;
      const segment = new THREE.Mesh(this.geometry.cylinder, material);
      segment.position.copy(start).add(end).multiplyScalar(0.5);
      segment.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
      segment.scale.set(radius, length, radius);
      group.add(segment);
      if (index < points.length - 1) {
        const joint = new THREE.Mesh(this.geometry.sphere, material);
        joint.scale.setScalar(radius);
        joint.position.copy(end);
        group.add(joint);
      }
    }
  }

  private placeCharges(): void {
    const path = this.path;
    if (!path) {
      this.charges.count = 0;
      return;
    }
    this.charges.count = CHARGE_COUNT;
    const spacing = path.total / CHARGE_COUNT;
    for (let index = 0; index < CHARGE_COUNT; index += 1) {
      const { point } = this.sample(this.flowOffset + index * spacing);
      this.dummy.position.copy(point).setZ(0.16);
      this.dummy.scale.setScalar(0.14);
      this.dummy.updateMatrix();
      this.charges.setMatrixAt(index, this.dummy.matrix);
    }
    this.charges.instanceMatrix.needsUpdate = true;
  }

  private sample(distance: number): { point: THREE.Vector3; direction: THREE.Vector3 } {
    const path = this.path as NonNullable<CircuitView["path"]>;
    let rest = ((distance % path.total) + path.total) % path.total;
    for (let index = 0; index < path.lengths.length; index += 1) {
      const length = path.lengths[index] ?? 0;
      if (rest <= length || index === path.lengths.length - 1) {
        const a = path.points[index] as THREE.Vector3;
        const b = path.points[index + 1] as THREE.Vector3;
        const direction = b.clone().sub(a).normalize();
        return { point: a.clone().lerp(b, length === 0 ? 0 : rest / length), direction };
      }
      rest -= length;
    }
    return { point: new THREE.Vector3(), direction: new THREE.Vector3(1, 0, 0) };
  }

  private applyHighlight(): void {
    for (const [id, pick] of this.picks) {
      (pick.material as THREE.MeshBasicMaterial).opacity = this.highlightTarget === circuitPartTarget(id) ? 0.18 : 0;
    }
  }

  private clearGroup(group: THREE.Group): void {
    for (const child of [...group.children]) child.removeFromParent();
  }
}

function measure(points: readonly Position3[]): { points: THREE.Vector3[]; lengths: number[]; total: number } | null {
  const vectors = points.map((point) => new THREE.Vector3(point.x, point.y, point.z));
  const lengths: number[] = [];
  for (let index = 1; index < vectors.length; index += 1) {
    lengths.push((vectors[index] as THREE.Vector3).distanceTo(vectors[index - 1] as THREE.Vector3));
  }
  const total = lengths.reduce((sum, length) => sum + length, 0);
  return total > 1e-6 ? { points: vectors, lengths, total } : null;
}
