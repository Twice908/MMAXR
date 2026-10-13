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
  minimumControlSizePx = 44,
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
  minTextSizePx: 18,
  minControlSizePx: 44,
  dockProfiles: {
    handheld: {
      distanceMeters: 0.75,
      downAngleRadians: 25 * Math.PI / 180,
      cardWidthPx: 104,
      compactHeightPx: 72,
      gapPx: 8,
      pagerButtonPx: 44,
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

validateSpatialDockProfile(spatialLayout.dockProfiles.handheld);
validateSpatialDockProfile(spatialLayout.dockProfiles.headset);
