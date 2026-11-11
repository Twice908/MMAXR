import * as THREE from "three";

/** Words for a short celebration shown in the XR scene. */
export interface XrBannerContent {
  /** Small capitals line, such as "MISSION COMPLETE". */
  readonly eyebrow: string;
  readonly title: string;
  readonly line?: string;
  /** Accent for the eyebrow and border, as `#rrggbb`. Defaults to cyan. */
  readonly accent?: string;
}

const WIDTH_M = 0.52;
const CANVAS_W = 1024;
const CANVAS_H = 512;
/** The ring of light starts this wide (metres) and grows to RING_GROWTH times that. */
const RING_RADIUS_M = 0.05;
const RING_GROWTH = 4.5;
const RING_MS = 1400;
const FADE_IN_MS = 280;
const FADE_OUT_MS = 520;

/**
 * A celebration banner for headsets, where DOM overlays do not exist: a camera-facing panel drawn
 * on a canvas texture, always on top of panels and models, fading in and out on its own. It never
 * takes pointer input (raycasts skip it), so it cannot block a click on the panels behind it.
 */
export class XrBanner {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly ring: THREE.Mesh;
  private readonly ringMaterial: THREE.MeshBasicMaterial;
  private texture: THREE.CanvasTexture | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private shownAt = 0;
  private durationMs = 0;

  constructor() {
    this.material = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH_M, (WIDTH_M * CANVAS_H) / CANVAS_W), this.material);
    this.mesh.name = "xr-banner";
    this.mesh.renderOrder = 10_000;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.mesh.raycast = () => undefined;

    // The expanding ring of light behind the words, as on the page banner.
    this.ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x6ff3ff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 96), this.ringMaterial);
    this.ring.name = "xr-banner-ring";
    this.ring.renderOrder = 9_999;
    this.ring.position.z = -0.002;
    this.ring.raycast = () => undefined;
    this.mesh.add(this.ring);
  }

  /** Show `content` for `durationMs` (including the fades). */
  show(content: XrBannerContent, durationMs: number, now = performance.now()): void {
    this.draw(content);
    this.ringMaterial.color.set(content.accent ?? "#6ff3ff");
    this.shownAt = now;
    this.durationMs = Math.max(FADE_IN_MS + FADE_OUT_MS, durationMs);
    this.mesh.visible = true;
  }

  /** Hide straight away. */
  hide(): void {
    this.mesh.visible = false;
    this.material.opacity = 0;
    this.durationMs = 0;
  }

  /**
   * Place the banner at `position`, turned (yaw only) to face `head`, and advance its fade.
   * Call once per XR frame while a session runs.
   */
  update(position: THREE.Vector3, head: THREE.Vector3, now = performance.now()): void {
    if (!this.mesh.visible) return;
    const elapsed = now - this.shownAt;
    if (elapsed >= this.durationMs) {
      this.hide();
      return;
    }
    const fadeIn = Math.min(1, elapsed / FADE_IN_MS);
    const fadeOut = Math.min(1, (this.durationMs - elapsed) / FADE_OUT_MS);
    this.material.opacity = Math.min(fadeIn, fadeOut);
    const settle = 1 - (1 - fadeIn) ** 3;
    this.mesh.scale.setScalar(0.92 + 0.08 * settle);
    this.mesh.position.copy(position);
    this.mesh.position.y += 0.012 * (1 - settle);
    this.mesh.rotation.set(0, Math.atan2(head.x - position.x, head.z - position.z), 0);
    const ringT = Math.min(1, elapsed / RING_MS);
    const ringEase = 1 - (1 - ringT) ** 3;
    this.ring.scale.setScalar(RING_RADIUS_M * (0.2 + (RING_GROWTH - 0.2) * ringEase));
    this.ringMaterial.opacity = 0.9 * (1 - ringT);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.ring.geometry.dispose();
    this.ringMaterial.dispose();
    this.texture?.dispose();
  }

  private draw(content: XrBannerContent): void {
    if (!this.canvas) {
      this.canvas = document.createElement("canvas");
      this.canvas.width = CANVAS_W;
      this.canvas.height = CANVAS_H;
      this.texture = new THREE.CanvasTexture(this.canvas);
      this.texture.colorSpace = THREE.SRGBColorSpace;
      this.material.map = this.texture;
      this.material.needsUpdate = true;
    }
    const ctx = this.canvas.getContext("2d");
    if (!ctx || !this.texture) return;
    const accent = content.accent ?? "#6ff3ff";
    const cx = CANVAS_W / 2;
    const cy = CANVAS_H / 2;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // Soft dark backdrop that fades out to nothing at the edges (no frame), like the page banner.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, CANVAS_H / CANVAS_W);
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, CANVAS_W / 2);
    glow.addColorStop(0, "rgba(12, 10, 36, 0.9)");
    glow.addColorStop(0.62, "rgba(12, 10, 36, 0.62)");
    glow.addColorStop(1, "rgba(12, 10, 36, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(-CANVAS_W / 2, -CANVAS_W / 2, CANVAS_W, CANVAS_W);
    ctx.restore();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const font = "'Avenir Next', 'Segoe UI', Roboto, Arial, sans-serif";
    const hasLine = Boolean(content.line);
    const titleY = hasLine ? cy + 4 : cy + 22;

    ctx.shadowColor = accent;
    ctx.shadowBlur = 26;
    ctx.fillStyle = accent;
    ctx.font = `800 34px ${font}`;
    ctx.fillText(spaced(content.eyebrow), cx, titleY - 84);

    ctx.shadowColor = "rgba(143, 123, 255, 0.95)";
    ctx.shadowBlur = 44;
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 84px ${font}`;
    ctx.fillText(content.title, cx, titleY, CANVAS_W - 160);
    ctx.shadowBlur = 18;
    ctx.fillText(content.title, cx, titleY, CANVAS_W - 160);

    if (hasLine && content.line) {
      ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
      ctx.shadowBlur = 12;
      ctx.fillStyle = "#d6dbff";
      ctx.font = `500 36px ${font}`;
      ctx.fillText(content.line, cx, titleY + 78, CANVAS_W - 200);
    }
    ctx.shadowBlur = 0;
    this.texture.needsUpdate = true;
  }
}

/** Letter-space small capitals for the eyebrow (canvas has no letter-spacing everywhere). */
function spaced(text: string): string {
  return text.toUpperCase().split("").join("\u2009");
}
