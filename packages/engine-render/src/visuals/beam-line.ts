import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
} from "three";
import { dashPolyline } from "./dash.js";
import type { PlaneMapper } from "./plane-mapper.js";
import { ribbonVertices } from "./ribbon.js";
import { visualTokens, type VisualTokens } from "./tokens.js";
import type { Point2 } from "./arc.js";

/** Options for a reusable solid or dotted beam. */
export interface BeamLineOptions {
  readonly mapper: PlaneMapper;
  readonly tokens?: VisualTokens;
}

/** A single growable mesh for solid or dotted paths. */
export class BeamLine {
  readonly mesh: Mesh<BufferGeometry, MeshBasicMaterial>;
  private readonly geometry: BufferGeometry;
  private readonly material: MeshBasicMaterial;
  private readonly mapper: PlaneMapper;
  private readonly tokens: VisualTokens;
  private capacity = 0;

  constructor({ mapper, tokens = visualTokens }: BeamLineOptions) {
    this.mapper = mapper;
    this.tokens = tokens;
    this.geometry = new BufferGeometry();
    this.material = new MeshBasicMaterial({
      color: tokens.solidBeamColor,
      transparent: true,
      opacity: tokens.beamOpacity,
      depthWrite: false,
      side: DoubleSide,
    });
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
  }

  /** Replace the displayed path, growing backing geometry only when capacity is exceeded. */
  setPoints(points2D: readonly Point2[], kind: "solid" | "dotted"): void {
    const paths =
      kind === "solid"
        ? [points2D]
        : dashPolyline(points2D, this.tokens.virtualDash, this.tokens.virtualGap);
    const ribbons = paths.map((path) => ribbonVertices(path, this.tokens.beamWidth));
    const vertexCount = ribbons.reduce((total, ribbon) => total + ribbon.positions.length / 2, 0);
    const indexCount = ribbons.reduce((total, ribbon) => total + ribbon.indices.length, 0);
    this.ensureCapacity(vertexCount, indexCount);

    const positionAttribute = this.geometry.getAttribute("position") as BufferAttribute;
    const positions = positionAttribute.array as Float32Array;
    const indexAttribute = this.geometry.getIndex();
    if (indexAttribute === null) {
      throw new Error("Beam geometry index buffer was not initialized.");
    }
    const indices = indexAttribute.array as Uint32Array;
    let vertexOffset = 0;
    let indexOffset = 0;
    for (const ribbon of ribbons) {
      for (let index = 0; index < ribbon.positions.length; index += 2) {
        const scenePoint = this.mapper.toScene(
          ribbon.positions[index] as number,
          ribbon.positions[index + 1] as number,
        );
        const target = vertexOffset * 3;
        positions[target] = scenePoint[0];
        positions[target + 1] = scenePoint[1];
        positions[target + 2] = scenePoint[2];
        vertexOffset += 1;
      }
      for (const index of ribbon.indices) {
        indices[indexOffset] = index + vertexOffset - ribbon.positions.length / 2;
        indexOffset += 1;
      }
    }
    positionAttribute.needsUpdate = true;
    indexAttribute.needsUpdate = true;
    this.geometry.setDrawRange(0, indexCount);
    this.material.color.set(kind === "solid" ? this.tokens.solidBeamColor : this.tokens.virtualBeamColor);
    this.material.opacity = kind === "solid" ? this.tokens.beamOpacity : this.tokens.virtualOpacity;
    this.geometry.computeBoundingSphere();
  }

  /** Release the mesh buffers and material. */
  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }

  private ensureCapacity(vertexCount: number, indexCount: number): void {
    if (vertexCount <= this.capacity && this.geometry.getIndex() !== null &&
        (this.geometry.getIndex()?.array.length ?? 0) >= indexCount) {
      return;
    }
    this.capacity = Math.max(4, 2 ** Math.ceil(Math.log2(Math.max(vertexCount, this.capacity + 1))));
    this.geometry.setAttribute("position", new BufferAttribute(new Float32Array(this.capacity * 3), 3));
    this.geometry.setIndex(new BufferAttribute(new Uint32Array(this.capacity * 6), 1));
  }
}
