import { CanvasTexture, Sprite, SpriteMaterial } from "three";
import { visualTokens, type VisualTokens } from "./tokens.js";

/** Canvas-like surface needed to draw a label texture. */
export interface LabelCanvas {
  width: number;
  height: number;
  getContext(contextId: "2d"): LabelCanvasContext | null;
}

/** Two-dimensional drawing methods used by label sprites. */
export interface LabelCanvasContext {
  clearRect(x: number, y: number, width: number, height: number): void;
  beginPath(): void;
  roundRect(x: number, y: number, width: number, height: number, radius: number): void;
  fill(): void;
  fillText(text: string, x: number, y: number): void;
  set fillStyle(value: string | CanvasGradient | CanvasPattern);
  set font(value: string);
  set textAlign(value: CanvasTextAlign);
  set textBaseline(value: CanvasTextBaseline);
}

/** Create the backing canvas for a label, optionally replacing browser canvas creation. */
export type LabelCanvasFactory = (width: number, height: number) => LabelCanvas;

/** Options for a text label sprite. */
export interface LabelSpriteOptions {
  readonly tokens?: VisualTokens;
  readonly createCanvas?: LabelCanvasFactory;
}

/** A canvas-backed sprite that redraws only when its text changes. */
export class LabelSprite {
  readonly sprite: Sprite;
  readonly canvas: LabelCanvas;
  private readonly context: LabelCanvasContext;
  private readonly texture: CanvasTexture;
  private readonly material: SpriteMaterial;
  private readonly tokens: VisualTokens;
  private text: string | null = null;

  constructor({ tokens = visualTokens, createCanvas = browserCanvas }: LabelSpriteOptions = {}) {
    this.tokens = tokens;
    this.canvas = createCanvas(tokens.labelCanvasWidth, tokens.labelCanvasHeight);
    const context = this.canvas.getContext("2d");
    if (context === null) {
      throw new Error("Label canvas does not provide a 2D drawing context.");
    }
    this.context = context;
    this.texture = new CanvasTexture(this.canvas as HTMLCanvasElement);
    this.material = new SpriteMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });
    this.sprite = new Sprite(this.material);
    this.sprite.scale.set(
      Math.max(tokens.markerRadius * tokens.labelMarkerWidthScale, tokens.labelMinWidth),
      Math.max(
        tokens.markerRadius * tokens.labelMarkerHeightScale,
        tokens.labelMinWidth / tokens.labelAspectRatio,
      ),
      1,
    );
    this.sprite.renderOrder = tokens.labelRenderOrder;
    this.sprite.visible = false;
  }

  /** Set the label text, redrawing only when it differs from the current text. */
  setText(text: string): void {
    if (text === this.text) {
      return;
    }
    this.text = text;
    const { context, canvas, tokens } = this;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.beginPath();
    context.roundRect(
      tokens.labelCanvasPadding,
      tokens.labelCanvasPadding,
      canvas.width - tokens.labelCanvasPadding * 2,
      canvas.height - tokens.labelCanvasPadding * 2,
      tokens.labelCornerRadius,
    );
    context.fillStyle = colorWithAlpha(tokens.labelColor, tokens.labelBackgroundOpacity);
    context.fill();
    context.fillStyle = colorCss(tokens.labelColor);
    context.font = `${tokens.labelFontSize}px sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, canvas.width / 2, canvas.height / 2);
    this.texture.needsUpdate = true;
    this.sprite.visible = true;
  }

  /** Place the sprite in scene coordinates. */
  setPosition(position: readonly [number, number, number]): void {
    this.sprite.position.set(position[0], position[1], position[2]);
  }

  /** Release the canvas texture and sprite material. */
  dispose(): void {
    this.texture.dispose();
    this.material.dispose();
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

function colorWithAlpha(color: number, alpha: number): string {
  return `rgba(${(color >> 16) & 255}, ${(color >> 8) & 255}, ${color & 255}, ${alpha})`;
}
