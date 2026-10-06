import {
  CircleGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
} from "three";
import type { PlaneMapper } from "./plane-mapper.js";
import { LabelSprite, type LabelCanvasFactory } from "./label-sprite.js";
import { visualTokens, type VisualTokens } from "./tokens.js";

/** Marker role determines its token color and filled or hollow shape. */
export type PointMarkerKind = "object" | "eye" | "image";

/** Options for a point marker. */
export interface PointMarkerOptions {
  readonly kind: PointMarkerKind;
  readonly mapper: PlaneMapper;
  readonly tokens?: VisualTokens;
  readonly createCanvas?: LabelCanvasFactory;
}

/** A filled object/eye marker or a hollow virtual-image marker. */
export class PointMarker {
  readonly mesh: Mesh;
  readonly label: LabelSprite | null;
  private readonly geometry: CircleGeometry | RingGeometry;
  private readonly material: MeshBasicMaterial;
  private readonly mapper: PlaneMapper;
  private readonly markerRadius: number;

  constructor({ kind, mapper, tokens = visualTokens, createCanvas }: PointMarkerOptions) {
    this.mapper = mapper;
    this.markerRadius = tokens.markerRadius;
    const color =
      kind === "object"
        ? tokens.objectMarkerColor
        : kind === "eye"
          ? tokens.eyeMarkerColor
          : tokens.imageMarkerColor;
    this.geometry =
      kind === "image"
        ? new RingGeometry(tokens.markerRadius * 0.65, tokens.markerRadius, 32)
        : new CircleGeometry(tokens.markerRadius, 32);
    this.material = new MeshBasicMaterial({
      color,
      transparent: kind === "image",
      opacity: kind === "image" ? tokens.virtualOpacity : tokens.beamOpacity,
      depthWrite: false,
      side: DoubleSide,
    });
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.rotation.x = Math.PI / 2;
    this.label = createCanvas ? new LabelSprite({ tokens, createCanvas }) : null;
    if (this.label) {
      this.mesh.add(this.label.sprite);
    }
  }

  /** Position the marker on the mapped plane and its optional label above it. */
  setPosition(x: number, y: number): void {
    const scenePoint = this.mapper.toScene(x, y);
    this.mesh.position.set(...scenePoint);
    this.label?.setPosition([0, this.markerRadius * 3, 0]);
  }

  /** Set optional marker text when a label was configured. */
  setLabel(text: string): void {
    if (this.label === null) {
      throw new Error("This marker was created without a label canvas.");
    }
    this.label.setText(text);
  }

  /** Release marker geometry, material, and optional label resources. */
  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.label?.dispose();
  }
}
