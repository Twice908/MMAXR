import * as THREE from "three";

/** One pill button on an {@link XrCard}. */
export interface XrCardButton {
  readonly id: string;
  readonly label: string;
  readonly tone?: "idle" | "primary" | "right" | "wrong";
  readonly disabled?: boolean;
}

/** What an {@link XrCard} shows: words, answer pills and action pills. */
export interface XrCardContent {
  /** Small capitals line, such as "CHAPTER 2 OF 4". */
  readonly eyebrow: string;
  /** The caption or question; wraps to three lines. */
  readonly title: string;
  /** Feedback or a hint; wraps to two lines. */
  readonly line?: string;
  /** Answer pills, two per row. */
  readonly options?: readonly XrCardButton[];
  /** Pills along the bottom (Pause, Skip, Exit ...). */
  readonly actions?: readonly XrCardButton[];
  /** Accent for the eyebrow, as `#rrggbb`. */
  readonly accent?: string;
}

const WIDTH_M = 0.52;
const CANVAS_W = 1024;
const CANVAS_H = 760;
const FONT = "'Avenir Next', 'Segoe UI', Roboto, Arial, sans-serif";
const PAD = 56;
/** Panel and pill colours: a light panel in the lesson's green and white. */
const INK = "#17402a";
const SOFT = "#4f7a5c";
const TONES = {
  idle: { fill: "#ffffff", stroke: "#b9dcaa", text: INK },
  primary: { fill: "#3d8b4a", stroke: "#3d8b4a", text: "#ffffff" },
  right: { fill: "#3d8b4a", stroke: "#3d8b4a", text: "#ffffff" },
  wrong: { fill: "#fbe3d8", stroke: "#e0714f", text: "#8a3a22" },
} as const;
/** Pointing at a pill lifts it; pressing it sinks it, so both read clearly at a distance. */
const HOVER = { fill: "#e3f5dc", stroke: "#3d8b4a", text: INK } as const;
const HOVER_PRIMARY = { fill: "#2c6b37", stroke: "#2c6b37", text: "#ffffff" } as const;
const PRESSED = { fill: "#1f5228", stroke: "#1f5228", text: "#ffffff" } as const;

/**
 * A light, rounded headset panel for narrated lessons: an eyebrow, the caption or question,
 * feedback, answer pills and action pills, with hover and pressed states. It is drawn on a
 * canvas texture and always on top of the scene, so a model that grows around the student
 * never hides it. {@link XrCard.buttonAt} turns a ray hit (texture uv) into the pressed button.
 */
export class XrCard {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly canvas: HTMLCanvasElement;
  private readonly texture: THREE.CanvasTexture;
  private buttons: { readonly id: string; readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly disabled: boolean }[] = [];
  private lastDrawn = "";
  private content: XrCardContent | null = null;
  private hovered: string | null = null;
  private pressed: string | null = null;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = CANVAS_W;
    this.canvas.height = CANVAS_H;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.material = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH_M, (WIDTH_M * CANVAS_H) / CANVAS_W), this.material);
    this.mesh.name = "xr-card";
    this.mesh.renderOrder = 9_000;
    this.mesh.visible = false;
  }

  /** Show content, or hide the card with null. Redraws only when the content changes. */
  show(content: XrCardContent | null): void {
    this.mesh.visible = content !== null;
    if (!content) return;
    const key = JSON.stringify(content);
    if (key === this.lastDrawn) return;
    this.lastDrawn = key;
    this.content = content;
    this.draw(content);
  }

  /** Show which pill the ray points at and which is held down (ids, or null). */
  setPointer(hovered: string | null, pressed: string | null): void {
    if (hovered === this.hovered && pressed === this.pressed) return;
    this.hovered = hovered;
    this.pressed = pressed;
    if (this.content && this.mesh.visible) this.draw(this.content);
  }

  /** The enabled button under a texture coordinate (from a ray hit), or null. */
  buttonAt(uv: { readonly x: number; readonly y: number }): string | null {
    const x = uv.x * CANVAS_W;
    const y = (1 - uv.y) * CANVAS_H;
    const hit = this.buttons.find((button) => x >= button.x && x <= button.x + button.w && y >= button.y && y <= button.y + button.h);
    return hit && !hit.disabled ? hit.id : null;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }

  private draw(content: XrCardContent): void {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const inner = CANVAS_W - PAD * 2;
    const options = content.options ?? [];
    const actions = content.actions ?? [];
    ctx.font = `700 40px ${FONT}`;
    const titleLines = wrap(ctx, content.title, inner).slice(0, 3);
    ctx.font = `500 28px ${FONT}`;
    const lines = content.line ? wrap(ctx, content.line, inner).slice(0, 3) : [];
    const pillH = 64;
    const gap = 14;
    const columns = options.length > 2 ? 2 : Math.max(1, options.length);
    const optionRows = Math.ceil(options.length / columns);
    const height = Math.min(
      CANVAS_H,
      PAD + 30 + 30 + titleLines.length * 50 + (lines.length ? 14 + lines.length * 38 : 0) +
        (options.length ? 26 + optionRows * (pillH + gap) - gap : 0) + (actions.length ? 30 + pillH : 0) + PAD - 34,
    );
    // Centred on the card's place, so the panel sits at eye level whatever its length.
    const top = Math.max(0, (CANVAS_H - height) / 2);

    // The panel: rounded, light, with a soft edge and a thin green border.
    ctx.save();
    ctx.shadowColor = "rgba(20, 60, 30, 0.28)";
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.roundRect(8, top + 8, CANVAS_W - 16, height - 16, 44);
    ctx.fillStyle = "rgba(255, 255, 255, 0.97)";
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(61, 139, 74, 0.3)";
    ctx.beginPath();
    ctx.roundRect(8, top + 8, CANVAS_W - 16, height - 16, 44);
    ctx.stroke();

    let y = top + PAD + 14;
    ctx.fillStyle = content.accent ?? "#3d8b4a";
    ctx.font = `800 24px ${FONT}`;
    ctx.fillText(content.eyebrow.toUpperCase().split("").join("\u2009"), PAD, y);
    y += 50;
    ctx.fillStyle = INK;
    ctx.font = `700 40px ${FONT}`;
    for (const line of titleLines) {
      ctx.fillText(line, PAD, y);
      y += 50;
    }
    if (lines.length) {
      y += 6;
      ctx.fillStyle = SOFT;
      ctx.font = `500 28px ${FONT}`;
      for (const line of lines) {
        ctx.fillText(line, PAD, y);
        y += 38;
      }
    }

    this.buttons = [];
    ctx.textAlign = "center";
    if (options.length > 0) {
      y += 6;
      const w = (inner - (columns - 1) * gap) / columns;
      options.forEach((option, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        this.pill(ctx, option, PAD + column * (w + gap), y + row * (pillH + gap), w, pillH, 28);
      });
      y += optionRows * (pillH + gap) - gap;
    }
    if (actions.length > 0) {
      y += 24;
      const w = Math.min(240, (inner - (actions.length - 1) * gap) / actions.length);
      // Actions sit at the right, the primary one last, like a dialog's buttons.
      const left = PAD + inner - (actions.length * w + (actions.length - 1) * gap);
      actions.forEach((action, index) => this.pill(ctx, action, left + index * (w + gap), y, w, pillH - 6, 26));
    }
    this.texture.needsUpdate = true;
  }

  private pill(ctx: CanvasRenderingContext2D, button: XrCardButton, x: number, y: number, w: number, h: number, size: number): void {
    const live = !button.disabled;
    const isPressed = live && this.pressed === button.id;
    const isHovered = live && !isPressed && this.hovered === button.id;
    const base = TONES[button.tone ?? "idle"];
    const tone = isPressed ? PRESSED : isHovered ? (button.tone === "primary" ? HOVER_PRIMARY : HOVER) : base;
    ctx.globalAlpha = button.disabled ? 0.45 : 1;
    // Hovered pills grow a little; pressed ones sink back.
    const grow = isHovered ? 6 : isPressed ? -3 : 0;
    x -= grow;
    y -= grow / 2;
    w += grow * 2;
    h += grow;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, h / 2);
    ctx.fillStyle = tone.fill;
    ctx.fill();
    ctx.lineWidth = isHovered ? 4 : 2.5;
    ctx.strokeStyle = tone.stroke;
    ctx.stroke();
    ctx.fillStyle = tone.text;
    ctx.font = `600 ${size}px ${FONT}`;
    ctx.fillText(button.label, x + w / 2, y + h / 2, w - 30);
    ctx.globalAlpha = 1;
    this.buttons.push({ id: button.id, x, y, w, h, disabled: button.disabled === true });
  }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}
