import { horizonTokens } from "./horizon-tokens.js";

/** Spatial panel dimensions and placement, expressed in metres and radians. */
/** Projection-based sizing and viewer-relative placement for a spatial dock. */
export interface SpatialDockProfile {
  readonly distanceMeters: number;
  readonly downAngleRadians: number;
  readonly cardWidthPx: number;
  readonly compactHeightPx: number;
  readonly gapPx: number;
  readonly pagerButtonPx: number;
  readonly detailWidthPx: number;
  readonly detailHeightFraction: number;
}

/** A rectangle expressed in the reference shell-width coordinate system. */
export interface NormalizedSpatialSurfaceRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Physical size and centered panel position derived from normalized reference data. */
export interface SpatialSurfaceGeometry {
  readonly xMeters: number;
  readonly yMeters: number;
  readonly widthMeters: number;
  readonly heightMeters: number;
}

/** Convert top-left-origin shell-width fractions into centered, Y-up metres. */
export function spatialSurfaceGeometry(
  rect: NormalizedSpatialSurfaceRect,
  shellWidthMeters: number,
): SpatialSurfaceGeometry {
  if (!Number.isFinite(shellWidthMeters) || shellWidthMeters <= 0 ||
    !Number.isFinite(rect.x) || !Number.isFinite(rect.y) ||
    !Number.isFinite(rect.width) || rect.width <= 0 ||
    !Number.isFinite(rect.height) || rect.height <= 0) {
    throw new RangeError("Spatial surface layout must use finite positive dimensions.");
  }
  return {
    xMeters: (rect.x + rect.width / 2 - 0.5) * shellWidthMeters,
    yMeters: (0.5 - rect.y - rect.height / 2) * shellWidthMeters,
    widthMeters: rect.width * shellWidthMeters,
    heightMeters: rect.height * shellWidthMeters,
  };
}

/** Spatial layout centered around the atom's AR anchor at the origin. */
export interface SpatialLayout {
  readonly arPlacement: Readonly<{
    readonly viewerForwardMeters: number;
    readonly viewerDownMeters: number;
    readonly minimumDistanceMeters: number;
    readonly maximumDistanceMeters: number;
    readonly moveMetersPerSecond: number;
    readonly reticleRadiusMeters: number;
  }>;
  /** Minimum rendered body-text size, in CSS-pixel-equivalent units. */
  readonly minTextSizePx: number;
  readonly minControlSizePx: number;
  /** Minimum primary-control target for hand-tracked use, in dp. */
  readonly minPrimaryHandControlSizeDp: number;
  readonly dockProfiles: Readonly<{
    readonly handheld: SpatialDockProfile;
    readonly headset: SpatialDockProfile;
  }>;
  /** Enable small DOM direction hints for panels outside the current view. */
  readonly edgeHints: boolean;
}

/** Reject invalid projection/layout parameters during module initialization. */
export function validateSpatialDockProfile(
  profile: SpatialDockProfile,
  minimumControlSizePx = horizonTokens.minimumHitTargetDp,
): void {
  if (!Number.isFinite(minimumControlSizePx) || minimumControlSizePx <= 0) {
    throw new RangeError("The minimum dock control size must be finite and positive.");
  }
  const positive = [
    profile.distanceMeters,
    profile.cardWidthPx,
    profile.compactHeightPx,
    profile.gapPx,
    profile.pagerButtonPx,
    profile.detailWidthPx,
  ];
  if (positive.some((value) => !Number.isFinite(value) || value <= 0) ||
    profile.cardWidthPx < minimumControlSizePx ||
    profile.compactHeightPx < minimumControlSizePx ||
    profile.pagerButtonPx < minimumControlSizePx ||
    profile.detailWidthPx < minimumControlSizePx) {
    throw new RangeError("Spatial dock dimensions must be positive and meet the minimum control size.");
  }
  if (
    !Number.isFinite(profile.downAngleRadians) ||
    profile.downAngleRadians < 0 ||
    profile.downAngleRadians >= Math.PI / 2 ||
    !Number.isFinite(profile.detailHeightFraction) ||
    profile.detailHeightFraction <= 0 ||
    profile.detailHeightFraction >= 1
  ) {
    throw new RangeError("Spatial dock angle and detail height fraction are outside their valid ranges.");
  }
}

/** Validate the shared kit minimums and every configured dock profile. */
export function validateSpatialLayout(layout: SpatialLayout): void {
  if (
    !Number.isFinite(layout.minTextSizePx) ||
    layout.minTextSizePx < 16 ||
    !Number.isFinite(layout.minControlSizePx) ||
    layout.minControlSizePx < horizonTokens.minimumHitTargetDp ||
    !Number.isFinite(layout.minPrimaryHandControlSizeDp) ||
    layout.minPrimaryHandControlSizeDp < horizonTokens.primaryHandHitTargetDp
  ) {
    throw new RangeError("Spatial layout does not meet Horizon UI text and hit-target minimums.");
  }
  validateSpatialDockProfile(layout.dockProfiles.handheld, layout.minControlSizePx);
  validateSpatialDockProfile(layout.dockProfiles.headset, layout.minControlSizePx);
}

/** Shared projection and placement constraints for the spatial dock. */
export const spatialLayout: SpatialLayout = Object.freeze({
  arPlacement: {
    viewerForwardMeters: 0.8,
    viewerDownMeters: 0.15,
    minimumDistanceMeters: 0.35,
    maximumDistanceMeters: 1.5,
    moveMetersPerSecond: 0.45,
    reticleRadiusMeters: 0.035,
  },
  minTextSizePx: 16,
  minControlSizePx: horizonTokens.minimumHitTargetDp,
  minPrimaryHandControlSizeDp: horizonTokens.primaryHandHitTargetDp,
  dockProfiles: {
    handheld: {
      distanceMeters: 0.7,
      downAngleRadians: 25 * Math.PI / 180,
      cardWidthPx: 104,
      compactHeightPx: 72,
      gapPx: 8,
      pagerButtonPx: 48,
      detailWidthPx: 360,
      detailHeightFraction: 0.75,
    },
    headset: {
      distanceMeters: 1,
      downAngleRadians: 15 * Math.PI / 180,
      cardWidthPx: 132,
      compactHeightPx: 88,
      gapPx: 14,
      pagerButtonPx: 48,
      detailWidthPx: 520,
      detailHeightFraction: 0.72,
    },
  },
  edgeHints: false,
});

validateSpatialLayout(spatialLayout);
