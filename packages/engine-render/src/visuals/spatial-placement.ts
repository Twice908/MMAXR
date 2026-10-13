import * as THREE from "three";
import { spatialLayout, type SpatialDockProfile } from "../spatial-layout.js";

export type SpatialPanelKey = "mission" | "particles" | "elementInfo" | "narration" | "settings";

/** Device-specific dock placement; handheld AR/camera keeps phone-safe sizing. */
export type SpatialPresentationProfile = "handheld" | "headset";

export interface SpatialDockLayout {
  readonly pixelsPerMeter: number;
  readonly maxRowWidthPx: number;
  readonly visibleCount: number;
  readonly pageCount: number;
  readonly keys: readonly SpatialPanelKey[];
  readonly rowWidthPx: number;
  readonly cardWidthMeters: number;
  readonly compactHeightMeters: number;
  readonly detailWidthMeters: number;
  readonly detailHeightMeters: number;
  readonly gapMeters: number;
  readonly pagerButtonMeters: number;
}

/** Toggle one detail card while preserving the single-open-card invariant. */
export function toggleSpatialDockSelection(
  active: SpatialPanelKey | null,
  selected: SpatialPanelKey,
): SpatialPanelKey | null {
  return active === selected ? null : selected;
}

/** Flatten a viewer pose to a yaw-only orientation, using world up as the up axis. */
export function gravityAlignedQuaternion(viewerQuaternion: THREE.Quaternion): THREE.Quaternion {
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(viewerQuaternion);
  forward.y = 0;
  if (forward.lengthSq() < 1e-8) {
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(viewerQuaternion);
    right.y = 0;
    if (right.lengthSq() < 1e-8) return new THREE.Quaternion();
    right.normalize();
    return new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      Math.atan2(-right.z, right.x),
    );
  }
  forward.normalize();
  return new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    Math.atan2(-forward.x, -forward.z),
  );
}

/** Keep screen-space phone AR on its existing layout and select headset sizing for VR. */
export function selectSpatialPresentationProfile(
  mode: "immersive-ar" | "immersive-vr" | "camera",
  interactionMode?: string,
): SpatialPresentationProfile {
  return mode === "immersive-vr" || interactionMode === "world-space" ? "headset" : "handheld";
}

/** Compute CSS pixels per metre at a depth using the vertical projection scale. */
export function pixelsPerMeterAtDepth(
  viewportHeightPx: number,
  distanceMeters: number,
  verticalFovRadians?: number,
  projectionY?: number,
): number {
  if (!Number.isFinite(viewportHeightPx) || viewportHeightPx <= 0 ||
    !Number.isFinite(distanceMeters) || distanceMeters <= 0) {
    throw new RangeError("Viewport height and projection distance must be finite and positive.");
  }
  if (verticalFovRadians !== undefined &&
    (!Number.isFinite(verticalFovRadians) || verticalFovRadians <= 0 || verticalFovRadians >= Math.PI)) {
    throw new RangeError("Vertical field of view must be finite and between zero and pi.");
  }
  const projectionScale = projectionY ?? (
    verticalFovRadians === undefined ? NaN : 1 / Math.tan(verticalFovRadians / 2)
  );
  if (!Number.isFinite(projectionScale) || projectionScale <= 0) {
    throw new RangeError("A valid vertical field of view or projection scale is required.");
  }
  return viewportHeightPx * projectionScale / (2 * distanceMeters);
}

/** Fit the dock row in 92% of the viewport, paging rather than shrinking targets. */
export function calculateSpatialDockLayout(
  viewportWidthPx: number,
  viewportHeightPx: number,
  projectionY: number,
  profile: SpatialPresentationProfile,
  page = 0,
): SpatialDockLayout {
  if (!Number.isFinite(viewportWidthPx) || viewportWidthPx <= 0) {
    throw new RangeError("Viewport width must be finite and positive.");
  }
  const settings = profileSettings(profile);
  const pixelsPerMeter = pixelsPerMeterAtDepth(
    viewportHeightPx,
    settings.distanceMeters,
    undefined,
    projectionY,
  );
  const maxRowWidthPx = viewportWidthPx * 0.92;
  const keys: readonly SpatialPanelKey[] = [
    "mission",
    "particles",
    "elementInfo",
    "narration",
    "settings",
  ];
  const allCardsWidth = keys.length * settings.cardWidthPx + (keys.length - 1) * settings.gapPx;
  const visibleCount = allCardsWidth <= maxRowWidthPx
    ? keys.length
    : Math.max(1, Math.min(keys.length, Math.floor(
      (maxRowWidthPx - 2 * settings.pagerButtonPx - 3 * settings.gapPx) /
        (settings.cardWidthPx + settings.gapPx),
    )));
  const pageCount = Math.ceil(keys.length / visibleCount);
  const safePage = Math.min(Math.max(0, Math.floor(page)), pageCount - 1);
  const visibleKeys = keys.slice(safePage * visibleCount, (safePage + 1) * visibleCount);
  const pagerWidth = visibleCount < keys.length
    ? 2 * settings.pagerButtonPx + 2 * settings.gapPx
    : 0;
  const rowWidthPx = visibleKeys.length * settings.cardWidthPx +
    Math.max(0, visibleKeys.length - 1) * settings.gapPx +
    pagerWidth;
  return {
    pixelsPerMeter,
    maxRowWidthPx,
    visibleCount,
    pageCount,
    keys: visibleKeys,
    rowWidthPx,
    cardWidthMeters: settings.cardWidthPx / pixelsPerMeter,
    compactHeightMeters: settings.compactHeightPx / pixelsPerMeter,
    detailWidthMeters: Math.min(settings.detailWidthPx, maxRowWidthPx) / pixelsPerMeter,
    detailHeightMeters: viewportHeightPx * settings.detailHeightFraction / pixelsPerMeter,
    gapMeters: settings.gapPx / pixelsPerMeter,
    pagerButtonMeters: settings.pagerButtonPx / pixelsPerMeter,
  };
}

/** Read the validated device profile from the shared spatial layout. */
export function profileSettings(profile: SpatialPresentationProfile): SpatialDockProfile {
  return profile === "headset"
    ? spatialLayout.dockProfiles.headset
    : spatialLayout.dockProfiles.handheld;
}

/** Return an upright yaw-only orientation for the dock row. */
export function spatialDockOrientation(viewerQuaternion: THREE.Quaternion): THREE.Quaternion {
  return gravityAlignedQuaternion(viewerQuaternion);
}
