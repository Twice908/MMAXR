import { horizonTokens } from "./horizon-tokens.js";

export type GlassSurfaceVariant = "shell" | "panel" | "card" | "control" | "pill";
export type GlassLayer = "shell" | "panel" | "control" | "label";

export interface GlassTint {
  readonly rgb: string;
  readonly alpha: number;
}

export interface GlassVariantTokens {
  readonly tint: GlassTint;
  readonly radiusM: number;
  readonly rimWidthM: number;
}

export interface XrTokens {
  readonly typography: Readonly<{
    fontFamily: string;
    display: Readonly<{ sizeDp: number; lineHeightDp: number; weight: "strong" }>;
    title: Readonly<{ sizeDp: number; lineHeightDp: number; weight: "strong" }>;
    heading: Readonly<{ sizeDp: number; lineHeightDp: number; weight: "strong" }>;
    body: Readonly<{ sizeDp: number; lineHeightDp: number; weight: "regular" }>;
    label: Readonly<{ sizeDp: number; lineHeightDp: number; weight: "strong" }>;
    caption: Readonly<{ sizeDp: number; lineHeightDp: number; weight: "regular" }>;
  }>;
  readonly spacingDp: readonly number[];
  readonly paddingDp: Readonly<{
    shell: number;
    panel: number;
    card: number;
    control: Readonly<{ vertical: number; horizontal: number }>;
  }>;
  readonly gapsDp: Readonly<{ panel: number; stack: number; inline: number }>;
  readonly radiiM: Readonly<{
    shell: number;
    panel: number;
    card: number;
    control: number;
    pill: number;
  }>;
  readonly borders: Readonly<{
    hairlineDp: number;
    defaultDp: number;
    focusDp: number;
    color: GlassTint;
  }>;
  readonly sizesDp: Readonly<{
    icon: number;
    targetMin: number;
    targetPrimary: number;
    sliderTrack: Readonly<{ length: number; thickness: number }>;
    sliderThumb: Readonly<{ width: number; height: number }>;
  }>;
  readonly colors: Readonly<{
    textPrimary: string;
    textSecondary: string;
    textDisabled: string;
    accent: string;
    success: string;
    warning: string;
    danger: string;
    focus: string;
  }>;
  readonly glass: Readonly<{
    variants: Readonly<Record<GlassSurfaceVariant, GlassVariantTokens>>;
    rimColor: string;
    rimAlpha: number;
    highlightAlpha: number;
    innerShadowAlpha: number;
    noiseAmount: number;
    reduced: Readonly<{
      highlightAlpha: number;
      innerShadowAlpha: number;
      noiseAmount: number;
    }>;
    states: Readonly<{
      hoverBrightness: number;
      hoverRim: number;
      pressedBrightness: number;
      pressedRim: number;
      selectedBrightness: number;
      selectedRim: number;
      disabledBrightness: number;
      disabledRim: number;
    }>;
  }>;
  readonly layers: Readonly<Record<GlassLayer, Readonly<{
    zOffsetM: number;
    renderOrder: number;
  }>>>;
  readonly panelLimits: Readonly<{
    scale: Readonly<{ min: number; default: number; max: number }>;
    distanceMeters: Readonly<{ min: number; default: number; max: number }>;
  }>;
  readonly modelLimits: Readonly<{
    zoom: Readonly<{ min: number; default: number; max: number }>;
    panMeters: Readonly<{ x: number; y: number }>;
    viewerDistanceMeters: Readonly<{ min: number; default: number; max: number }>;
  }>;
  readonly shellWidthMeters: number;
}

const shellAspectRatio = 2028 / 1300;
const defaultPanelWidthM = horizonTokens.panelSizeDp.default.width * horizonTokens.metresPerDp;
const defaultPanelHeightM = horizonTokens.panelSizeDp.default.height * horizonTokens.metresPerDp;
const shellWidthMeters = Math.min(defaultPanelWidthM, defaultPanelHeightM * shellAspectRatio);
const shellMetersPerSourcePixel = shellWidthMeters / 2028;
const sourcePixelsToMeters = (pixels: number): number => pixels * shellMetersPerSourcePixel;

/** Shared visual, comfort, glass, and interaction tokens for spatial surfaces. */
export const xrTokens = Object.freeze({
  typography: {
    fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
    display: { sizeDp: 32, lineHeightDp: 36, weight: "strong" },
    title: { sizeDp: 24, lineHeightDp: 28, weight: "strong" },
    heading: { sizeDp: 20, lineHeightDp: 24, weight: "strong" },
    body: { sizeDp: 14, lineHeightDp: 20, weight: "regular" },
    label: { sizeDp: 14, lineHeightDp: 20, weight: "strong" },
    caption: { sizeDp: 14, lineHeightDp: 20, weight: "regular" },
  },
  spacingDp: [4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96, 128, 160],
  paddingDp: {
    shell: 24,
    panel: 48,
    card: 40,
    control: { vertical: 8, horizontal: 16 },
  },
  gapsDp: { panel: 48, stack: 32, inline: 8 },
  radiiM: {
    shell: sourcePixelsToMeters(56),
    panel: sourcePixelsToMeters(24),
    card: sourcePixelsToMeters(24),
    control: sourcePixelsToMeters(8),
    pill: sourcePixelsToMeters(32),
  },
  borders: {
    hairlineDp: 1,
    defaultDp: 1,
    focusDp: 2,
    color: { rgb: "#F2EAE8", alpha: 0.3 },
  },
  sizesDp: {
    icon: horizonTokens.iconSizeDp,
    targetMin: horizonTokens.minimumHitTargetDp,
    targetPrimary: horizonTokens.primaryHandHitTargetDp,
    sliderTrack: { length: 486, thickness: 34 },
    sliderThumb: { width: 80, height: 34 },
  },
  colors: {
    textPrimary: "#F2ECE9",
    textSecondary: "#D0C7C3",
    textDisabled: "#9A918E",
    accent: "#20B977",
    success: "#20B977",
    warning: "#C8EC72",
    danger: "#D64C35",
    focus: "#48C58E",
  },
  glass: {
    variants: {
      shell: {
        tint: { rgb: "#150C0C", alpha: 0.85 },
        radiusM: sourcePixelsToMeters(56),
        rimWidthM: sourcePixelsToMeters(2),
      },
      panel: {
        tint: { rgb: "#3A3333", alpha: 0.7 },
        radiusM: sourcePixelsToMeters(24),
        rimWidthM: sourcePixelsToMeters(2),
      },
      card: {
        tint: { rgb: "#3A3333", alpha: 0.7 },
        radiusM: sourcePixelsToMeters(24),
        rimWidthM: sourcePixelsToMeters(2),
      },
      control: {
        tint: { rgb: "#6B6363", alpha: 0.55 },
        radiusM: sourcePixelsToMeters(8),
        rimWidthM: sourcePixelsToMeters(1),
      },
      pill: {
        tint: { rgb: "#6B6363", alpha: 0.55 },
        radiusM: sourcePixelsToMeters(32),
        rimWidthM: sourcePixelsToMeters(1),
      },
    },
    rimColor: "#F2EAE8",
    rimAlpha: 0.3,
    highlightAlpha: 0.15,
    innerShadowAlpha: 0.2,
    noiseAmount: 0.008,
    reduced: {
      highlightAlpha: 0,
      innerShadowAlpha: 0,
      noiseAmount: 0,
    },
    states: {
      hoverBrightness: 0.08,
      hoverRim: 0.2,
      pressedBrightness: -0.06,
      pressedRim: -0.15,
      selectedBrightness: 0.04,
      selectedRim: 0.25,
      disabledBrightness: -0.3,
      disabledRim: -0.5,
    },
  },
  layers: {
    shell: { zOffsetM: 0, renderOrder: 10 },
    panel: { zOffsetM: 0.0005, renderOrder: 11 },
    control: { zOffsetM: 0.001, renderOrder: 12 },
    label: { zOffsetM: 0.0015, renderOrder: 13 },
  },
  panelLimits: {
    scale: { min: 0.75, default: 1, max: 1.25 },
    distanceMeters: { min: 0.9, default: 1, max: 1.5 },
  },
  modelLimits: {
    zoom: { min: 0.5, default: 1, max: 2 },
    panMeters: { x: 0.78, y: 0.61 },
    viewerDistanceMeters: { min: 0.5, default: 1, max: 2 },
  },
  shellWidthMeters,
} satisfies XrTokens);

export const GLASS = xrTokens.glass;
export const PANEL_LIMITS = xrTokens.panelLimits;
export const MODEL_LIMITS = xrTokens.modelLimits;
