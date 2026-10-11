/** Spatial panel dimensions and placement, expressed in metres and radians. */
export interface SpatialPanelLayout {
  /** Panel centre relative to the atom origin. */
  readonly position: Readonly<{ x: number; y: number; z: number }>;
  /** Expanded and compact card dimensions. */
  readonly expandedSize: Readonly<{ width: number; height: number }>;
  readonly collapsedSize: Readonly<{ width: number; height: number }>;
  /** Small angular offsets, in radians, applied after facing the viewer. */
  readonly tiltRadians: Readonly<{ x: number; y: number; z: number }>;
  /** Keep the panel normal aimed toward the current viewer. */
  readonly facingRule: "viewer";
}

/** Spatial layout centered around the atom's AR anchor at the origin. */
export interface SpatialLayout {
  readonly mission: SpatialPanelLayout;
  readonly particles: SpatialPanelLayout;
  readonly elementInfo: SpatialPanelLayout;
  readonly narrationSettings: SpatialPanelLayout;
  readonly settings: SpatialPanelLayout;
  /** Uniform panel scale selected for the viewport orientation. */
  readonly viewportScale: Readonly<{ portrait: number; landscape: number }>;
  /** Minimum rendered body-text size, in CSS-pixel-equivalent units. */
  readonly minTextSizePx: number;
  /** Enable small DOM direction hints for panels outside the current view. */
  readonly edgeHints: boolean;
}

/** Suggested positions keep the panels outside the atom's ~27 cm diameter. */
export const spatialLayout: SpatialLayout = Object.freeze({
  mission: {
    position: { x: 0, y: 0.37, z: -0.15 },
    expandedSize: { width: 0.55, height: 0.16 },
    collapsedSize: { width: 0.55, height: 0.16 },
    tiltRadians: { x: -0.08, y: 0, z: 0 },
    facingRule: "viewer" as const,
  },
  particles: {
    position: { x: -0.36, y: 0, z: -0.15 },
    expandedSize: { width: 0.28, height: 0.38 },
    collapsedSize: { width: 0.28, height: 0.11 },
    tiltRadians: { x: 0, y: -0.08, z: 0 },
    facingRule: "viewer" as const,
  },
  elementInfo: {
    position: { x: 0.36, y: 0, z: -0.15 },
    expandedSize: { width: 0.28, height: 0.38 },
    collapsedSize: { width: 0.28, height: 0.11 },
    tiltRadians: { x: 0, y: 0.08, z: 0 },
    facingRule: "viewer" as const,
  },
  narrationSettings: {
    position: { x: 0, y: -0.37, z: -0.15 },
    expandedSize: { width: 0.5, height: 0.16 },
    collapsedSize: { width: 0.5, height: 0.11 },
    tiltRadians: { x: 0.08, y: 0, z: 0 },
    facingRule: "viewer" as const,
  },
  settings: {
    position: { x: 0.5, y: -0.57, z: -0.15 },
    expandedSize: { width: 0.34, height: 0.66 },
    collapsedSize: { width: 0.34, height: 0.11 },
    tiltRadians: { x: 0.1, y: -0.08, z: 0 },
    facingRule: "viewer" as const,
  },
  viewportScale: { portrait: 0.82, landscape: 1 },
  minTextSizePx: 18,
  edgeHints: true,
});
