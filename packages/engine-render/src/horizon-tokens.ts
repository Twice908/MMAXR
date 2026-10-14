/** Meta Horizon OS UI Set reference values, expressed in dp unless noted. */
export interface HorizonTokens {
  readonly components: readonly string[];
  readonly states: readonly string[];
  readonly typeScale: Readonly<{
    headline1: Readonly<{ sizeDp: number; lineHeightDp: number }>;
    headline2: Readonly<{ sizeDp: number; lineHeightDp: number }>;
    headline3: Readonly<{ sizeDp: number; lineHeightDp: number }>;
    body1: Readonly<{ sizeDp: number; lineHeightDp: number }>;
    body2: Readonly<{ sizeDp: number; lineHeightDp: number }>;
    strongWeight: string;
    regularWeight: string;
    italics: boolean;
  }>;
  readonly iconSizeDp: number;
  readonly minimumHitTargetDp: number;
  readonly primaryHandHitTargetDp: number;
  readonly panelSizeDp: Readonly<{
    default: Readonly<{ width: number; height: number }>;
    minimum: Readonly<{ width: number; height: number }>;
    maximum: Readonly<{ width: number; height: number }>;
  }>;
  readonly handheldCssPixelsPerDp: number;
  readonly metresPerDp: number;
}

/** Shared values supplied for the Horizon UI Set and dp conversion. */
export const horizonTokens: HorizonTokens = Object.freeze({
  components: [
    "primary button",
    "secondary button",
    "borderless button",
    "destructive button",
    "tile button",
    "shelf button",
    "tooltip",
    "card",
    "dialog",
    "dropdown",
    "toggle selector",
    "checkbox selector",
    "radio selector",
    "slider",
    "panel",
    "window",
  ],
  states: ["default", "hover", "pressed", "disabled"],
  typeScale: {
    headline1: { sizeDp: 32, lineHeightDp: 36 },
    headline2: { sizeDp: 24, lineHeightDp: 28 },
    headline3: { sizeDp: 20, lineHeightDp: 24 },
    body1: { sizeDp: 14, lineHeightDp: 20 },
    body2: { sizeDp: 11, lineHeightDp: 16 },
    strongWeight: "TODO(kit)",
    regularWeight: "TODO(kit)",
    italics: false,
  },
  iconSizeDp: 24,
  minimumHitTargetDp: 48,
  primaryHandHitTargetDp: 60,
  panelSizeDp: {
    default: { width: 1024, height: 640 },
    minimum: { width: 384, height: 500 },
    maximum: { width: 1440, height: 1000 },
  },
  handheldCssPixelsPerDp: 1,
  metresPerDp: 0.000958,
});

/** CSS custom properties kept in parity with `horizon-tokens.css`. */
export const horizonTokenCssValues: Readonly<Record<string, string>> = Object.freeze({
  "--horizon-components": horizonTokens.components.join(", "),
  "--horizon-states": horizonTokens.states.join(", "),
  "--horizon-type-headline-1-size": `${horizonTokens.typeScale.headline1.sizeDp}px`,
  "--horizon-type-headline-1-line-height": `${horizonTokens.typeScale.headline1.lineHeightDp}px`,
  "--horizon-type-headline-2-size": `${horizonTokens.typeScale.headline2.sizeDp}px`,
  "--horizon-type-headline-2-line-height": `${horizonTokens.typeScale.headline2.lineHeightDp}px`,
  "--horizon-type-headline-3-size": `${horizonTokens.typeScale.headline3.sizeDp}px`,
  "--horizon-type-headline-3-line-height": `${horizonTokens.typeScale.headline3.lineHeightDp}px`,
  "--horizon-type-body-1-size": `${horizonTokens.typeScale.body1.sizeDp}px`,
  "--horizon-type-body-1-line-height": `${horizonTokens.typeScale.body1.lineHeightDp}px`,
  "--horizon-type-body-2-size": `${horizonTokens.typeScale.body2.sizeDp}px`,
  "--horizon-type-body-2-line-height": `${horizonTokens.typeScale.body2.lineHeightDp}px`,
  "--horizon-type-weight-strong": horizonTokens.typeScale.strongWeight,
  "--horizon-type-weight-regular": horizonTokens.typeScale.regularWeight,
  "--horizon-type-italics": String(horizonTokens.typeScale.italics),
  "--horizon-icon-size": `${horizonTokens.iconSizeDp}px`,
  "--horizon-hit-target-min": `${horizonTokens.minimumHitTargetDp}px`,
  "--horizon-hit-target-primary-hands": `${horizonTokens.primaryHandHitTargetDp}px`,
  "--horizon-panel-default-width": `${horizonTokens.panelSizeDp.default.width}px`,
  "--horizon-panel-default-height": `${horizonTokens.panelSizeDp.default.height}px`,
  "--horizon-panel-min-width": `${horizonTokens.panelSizeDp.minimum.width}px`,
  "--horizon-panel-min-height": `${horizonTokens.panelSizeDp.minimum.height}px`,
  "--horizon-panel-max-width": `${horizonTokens.panelSizeDp.maximum.width}px`,
  "--horizon-panel-max-height": `${horizonTokens.panelSizeDp.maximum.height}px`,
  "--horizon-handheld-css-pixels-per-dp": String(horizonTokens.handheldCssPixelsPerDp),
  "--horizon-metres-per-dp": String(horizonTokens.metresPerDp),
});
