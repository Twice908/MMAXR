/** A colour as red, green and blue channels from 0 to 1. */
export type Rgb = readonly [number, number, number];

/**
 * The four colours of one cosmic scene, each as `#rrggbb`. The nebula shader blends them from
 * the darkest (`deep`) to the rarest highlight (`accent`).
 */
export interface CosmosPalette {
  /** Empty space between the gas clouds. Keep it dark so text stays readable. */
  readonly deep: string;
  /** The main body of the nebula. */
  readonly mid: string;
  /** Bright, glowing gas. */
  readonly glow: string;
  /** Thin filaments and highlights. */
  readonly accent: string;
}

/** A {@link CosmosPalette} already converted to channels, for shaders. */
export interface RgbPalette {
  readonly deep: Rgb;
  readonly mid: Rgb;
  readonly glow: Rgb;
  readonly accent: Rgb;
}

const HEX = /^#([0-9a-f]{6})$/i;

/** Parse `#rrggbb` into channels from 0 to 1. Throws on any other format. */
export function hexToRgb(hex: string): Rgb {
  const match = HEX.exec(hex.trim());
  if (!match || match[1] === undefined) throw new Error(`Expected a colour like #12ab9f, got "${hex}".`);
  const value = Number.parseInt(match[1], 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

/** Format channels from 0 to 1 as `#rrggbb`, clamping out-of-range values. */
export function rgbToHex(rgb: Rgb): string {
  return `#${rgb
    .map((channel) => Math.round(Math.min(1, Math.max(0, channel)) * 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** Blend two colours. `t` 0 gives `a`, 1 gives `b`. */
export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Convert a palette to channels. */
export function paletteToRgb(palette: CosmosPalette): RgbPalette {
  return {
    deep: hexToRgb(palette.deep),
    mid: hexToRgb(palette.mid),
    glow: hexToRgb(palette.glow),
    accent: hexToRgb(palette.accent),
  };
}

/**
 * Blend two colours while keeping their colourfulness. A straight blend of blue and orange
 * passes through grey; this one rescales the midpoint's chroma to the blended chroma, so a sky
 * changing hue stays vivid all the way.
 */
export function mixVivid(a: Rgb, b: Rgb, t: number): Rgb {
  const mixed = mixRgb(a, b, t);
  const chroma = (c: Rgb): number => Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);
  const current = chroma(mixed);
  if (current < 1e-4) return mixed;
  const wanted = chroma(a) + (chroma(b) - chroma(a)) * t;
  const lum = 0.2126 * mixed[0] + 0.7152 * mixed[1] + 0.0722 * mixed[2];
  const scale = wanted / current;
  const clamp = (v: number): number => Math.min(1, Math.max(0, v));
  return [
    clamp(lum + (mixed[0] - lum) * scale),
    clamp(lum + (mixed[1] - lum) * scale),
    clamp(lum + (mixed[2] - lum) * scale),
  ];
}

/** Blend two channel palettes with {@link mixVivid}. */
export function mixVividPalette(a: RgbPalette, b: RgbPalette, t: number): RgbPalette {
  return {
    deep: mixVivid(a.deep, b.deep, t),
    mid: mixVivid(a.mid, b.mid, t),
    glow: mixVivid(a.glow, b.glow, t),
    accent: mixVivid(a.accent, b.accent, t),
  };
}

/** Blend two channel palettes. */
export function mixRgbPalette(a: RgbPalette, b: RgbPalette, t: number): RgbPalette {
  return {
    deep: mixRgb(a.deep, b.deep, t),
    mid: mixRgb(a.mid, b.mid, t),
    glow: mixRgb(a.glow, b.glow, t),
    accent: mixRgb(a.accent, b.accent, t),
  };
}

/** Blend two palettes. `t` 0 gives `a`, 1 gives `b`. */
export function mixPalette(a: CosmosPalette, b: CosmosPalette, t: number): CosmosPalette {
  const mixed = mixRgbPalette(paletteToRgb(a), paletteToRgb(b), t);
  return {
    deep: rgbToHex(mixed.deep),
    mid: rgbToHex(mixed.mid),
    glow: rgbToHex(mixed.glow),
    accent: rgbToHex(mixed.accent),
  };
}

/** A CSS radial gradient made from a palette, for veils and no-WebGL fallbacks. */
export function paletteGradient(palette: CosmosPalette): string {
  return `radial-gradient(120% 90% at 50% 45%, ${palette.glow} 0%, ${palette.mid} 38%, ${palette.deep} 78%)`;
}
