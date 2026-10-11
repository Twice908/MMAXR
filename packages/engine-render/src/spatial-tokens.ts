/** Canvas-compatible mirror of the spatial glass CSS tokens. */
export interface SpatialTokens {
  readonly surface: string;
  readonly surfaceStrong: string;
  readonly edge: string;
  readonly edgeWidth: string;
  readonly highlight: string;
  readonly shadow: string;
  readonly glow: string;
  readonly radiusPanel: string;
  readonly radiusSidebar: string;
  readonly radiusTopbar: string;
  readonly ink: string;
  readonly inkMuted: string;
  readonly accentGreen: string;
  readonly accentLime: string;
  readonly accentPink: string;
  readonly accentLilac: string;
  readonly focus: string;
  readonly padPanel: string;
  readonly padSidebar: string;
  readonly padControl: string;
  readonly gapLayout: string;
  readonly gapSidebar: string;
  readonly gapControl: string;
  readonly headingLetterSpacing: string;
}

/** Values match `modules/chem-atom-builder/src/spatial-tokens.css` exactly. */
export const spatialTokens: SpatialTokens = Object.freeze({
  surface: "rgba(255, 255, 255, 0.957)",
  surfaceStrong: "rgba(255, 255, 255, 1)",
  edge: "rgba(255, 255, 255, 0.84)",
  edgeWidth: "1px",
  highlight: "inset 0 1px 0 rgba(255, 255, 255, 0.85)",
  shadow: "0 20px 55px rgba(102, 81, 118, 0.094)",
  glow: "0 0 24px rgba(180, 203, 169, 0.659)",
  radiusPanel: "24px",
  radiusSidebar: "26px",
  radiusTopbar: "22px",
  ink: "#272331",
  inkMuted: "#756d7c",
  accentGreen: "#20b977",
  accentLime: "#c8ec72",
  accentPink: "#f1b4d6",
  accentLilac: "#bba7f2",
  focus: "#48c58e",
  padPanel: "22px",
  padSidebar: "17px",
  padControl: "10px 14px",
  gapLayout: "18px",
  gapSidebar: "22px",
  gapControl: "8px",
  headingLetterSpacing: "-0.045em",
});
