import {
  CanvasTexture,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
} from "three";
import type { PlaneMapper } from "./plane-mapper.js";
import { visualTokens, type VisualTokens } from "./tokens.js";
import type { LabelCanvas, LabelCanvasFactory, LabelCanvasContext } from "./label-sprite.js";

export interface TextCardOptions {
  readonly mapper: PlaneMapper;
  readonly tokens?: VisualTokens;
  readonly createCanvas?: LabelCanvasFactory;
}

/** Canvas-backed upright text surface in mapper space. */
export class TextCard {
  readonly mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  readonly canvas: LabelCanvas;
  private readonly context: LabelCanvasContext;
  private readonly texture: CanvasTexture;
  private readonly tokens: VisualTokens;
  private readonly mapper: PlaneMapper;
  private text = "";

  constructor({ mapper, tokens = visualTokens, createCanvas = browserCanvas }: TextCardOptions) {
    this.tokens = tokens;
    this.mapper = mapper;
    this.canvas = createCanvas(tokens.textCardCanvasWidth, tokens.textCardCanvasHeight);
    const context = this.canvas.getContext("2d");
    if (!context) {
      throw new Error("Text card canvas does not provide a 2D drawing context.");
    }
    this.context = context;
    this.texture = new CanvasTexture(this.canvas as HTMLCanvasElement);
    this.mesh = new Mesh(
      new PlaneGeometry(tokens.textCardWidth, tokens.textCardHeight),
      new MeshBasicMaterial({
        map: this.texture,
        color: tokens.textCardColor,
        side: DoubleSide,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.mesh.renderOrder = tokens.labelRenderOrder;
    const [x, y, z] = mapper.toScene(0, 0);
    this.mesh.position.set(x, y, z);
  }

  /** Set text and redraw only when its value changes. */
  setText(text: string): void {
    if (text === this.text) {
      return;
    }
    this.text = text;
    const { context, canvas, tokens } = this;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.beginPath();
    context.roundRect(0, 0, canvas.width, canvas.height, tokens.labelMinWidth);
    context.fillStyle = colorCss(tokens.textCardColor);
    context.fill();
    context.fillStyle = colorCss(tokens.labelColor);
    context.font = `${tokens.textCardFontSize}px sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, canvas.width / 2, canvas.height / 2);
    this.texture.needsUpdate = true;
  }

  /** Flip the card surface while leaving its stored text unchanged. */
  setMirrored(mirrored: boolean): void {
    this.mesh.scale.x = mirrored ? -1 : 1;
  }

  /** Place the card at a mapper-plane coordinate and set its yaw in degrees. */
  setPose(position2D: readonly [number, number], facingDeg: number): void {
    const mapped = this.mapper.toScene(position2D[0], position2D[1]);
    this.mesh.position.set(mapped[0], mapped[1] + this.tokens.textCardLift, mapped[2]);
    this.mesh.rotation.y = facingDeg * Math.PI / 180;
  }

  /** Release the card geometry, texture, and material. */
  dispose(): void {
    this.mesh.geometry.dispose();
    this.texture.dispose();
    this.mesh.material.dispose();
  }

}

function browserCanvas(width: number, height: number): LabelCanvas {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function colorCss(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}
