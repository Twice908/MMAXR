import { BeamLine } from "./beam-line.js";
import { arcPoints, type Point2 } from "./arc.js";
import type { PlaneMapper } from "./plane-mapper.js";
import { LabelSprite, type LabelCanvasFactory } from "./label-sprite.js";
import { visualTokens, type VisualTokens } from "./tokens.js";

/** Options for a reusable angle arc and degree label. */
export interface AngleArcOptions {
  readonly mapper: PlaneMapper;
  readonly tokens?: VisualTokens;
  readonly createCanvas?: LabelCanvasFactory;
}

/** Draw an angle arc and a label at its bisector. */
export class AngleArc {
  readonly beam: BeamLine;
  readonly label: LabelSprite;
  private readonly mapper: PlaneMapper;
  private readonly tokens: VisualTokens;

  constructor({ mapper, tokens = visualTokens, createCanvas }: AngleArcOptions) {
    this.mapper = mapper;
    this.tokens = tokens;
    this.beam = new BeamLine({ mapper, tokens: { ...tokens, solidBeamColor: tokens.arcColor } });
    this.label = new LabelSprite({ tokens, ...(createCanvas ? { createCanvas } : {}) });
    this.beam.mesh.add(this.label.sprite);
  }

  /** Update the arc geometry and its formatted angle label, optionally using a measured angle. */
  set(vertex: Point2, dirA: Point2, dirB: Point2, labelAngleDeg?: number): void {
    const arc = arcPoints(vertex, dirA, dirB, this.tokens.arcRadius, 24);
    this.beam.setPoints(arc.points, "solid");
    const roundedAngle = Math.round((labelAngleDeg ?? arc.angleDeg) * 10) / 10;
    const angleText = `${Number.isInteger(roundedAngle) ? roundedAngle.toFixed(0) : roundedAngle.toFixed(1)}°`;
    const labelPoint = this.mapper.toScene(
      vertex[0] + arc.midDirection[0] * this.tokens.arcRadius * 1.6,
      vertex[1] + arc.midDirection[1] * this.tokens.arcRadius * 1.6,
    );
    this.label.setText(angleText);
    this.label.setPosition(labelPoint);
  }

  /** Release the arc buffers, label texture, and material. */
  dispose(): void {
    this.beam.dispose();
    this.label.dispose();
  }
}
