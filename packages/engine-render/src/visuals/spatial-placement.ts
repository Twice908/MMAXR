import * as THREE from "three";
import { horizonTokens } from "../horizon-tokens.js";
import { spatialLayout, type SpatialDockProfile } from "../spatial-layout.js";
import { PANEL_LIMITS, xrTokens } from "../xr-tokens.js";

export type SpatialPanelKey = "mission" | "particles" | "elementInfo" | "narration" | "settings";
export type SpatialDockTabKey = Exclude<SpatialPanelKey, "settings">;
export const SPATIAL_DOCK_HINT = "Tap a tab to open it. Open Particles to build the atom.";

/** Device-specific dock placement; handheld AR/camera keeps phone-safe sizing. */
export type SpatialPresentationProfile = "handheld" | "headset";

export interface SpatialDockLayout {
  readonly pixelsPerMeter: number;
  readonly maxRowWidthPx: number;
  readonly keys: readonly SpatialPanelKey[];
  readonly rowWidthPx: number;
  readonly tabWidthPx: number;
  readonly cardWidthMeters: number;
  readonly detailWidthMeters: number;
  readonly detailHeightMeters: number;
  readonly tabHeightMeters: number;
}

export interface PanelGroupPlacement {
  readonly position: Readonly<{ x: number; y: number; z: number }>;
  readonly orientation: Readonly<{ x: number; y: number; z: number; w: number }>;
  readonly forward: Readonly<{ x: number; y: number; z: number }>;
}

/** Compute a translated group origin along its captured viewer ray. */
export function calculatePanelGroupPosition(
  viewerPosition: Readonly<{ x: number; y: number; z: number }>,
  forward: Readonly<{ x: number; y: number; z: number }>,
  distanceMeters: number,
  heightOffsetMeters = xrTokens.placement.heightOffsetMeters,
): Readonly<{ x: number; y: number; z: number }> {
  if (![viewerPosition.x, viewerPosition.y, viewerPosition.z,
    forward.x, forward.y, forward.z, distanceMeters, heightOffsetMeters]
    .every(Number.isFinite) || distanceMeters <= 0 ||
    Math.hypot(forward.x, forward.y, forward.z) === 0) {
    throw new RangeError("Panel group position requires a finite viewer ray and positive distance.");
  }
  const direction = new THREE.Vector3(forward.x, forward.y, forward.z).normalize();
  const position = new THREE.Vector3(viewerPosition.x, viewerPosition.y, viewerPosition.z)
    .addScaledVector(direction, distanceMeters)
    .add(new THREE.Vector3(0, heightOffsetMeters, 0));
  return { x: position.x, y: position.y, z: position.z };
}

/** Apply uniform scale without changing the captured group position or rotation. */
export function applyPanelGroupScale(group: THREE.Object3D, scale: number): number {
  const clamped = clampPanelGroupScale(scale);
  group.scale.setScalar(clamped);
  return clamped;
}

/** Calculate a one-time world pose from the first valid viewer pose. */
export function calculatePanelGroupPlacement(
  viewerPosition: Readonly<{ x: number; y: number; z: number }>,
  viewerOrientation: Readonly<{ x: number; y: number; z: number; w: number }>,
  distanceMeters = PANEL_LIMITS.distanceMeters.default,
  heightOffsetMeters = xrTokens.placement.heightOffsetMeters,
): PanelGroupPlacement {
  if (![viewerPosition.x, viewerPosition.y, viewerPosition.z, distanceMeters, heightOffsetMeters]
    .every(Number.isFinite) ||
    ![viewerOrientation.x, viewerOrientation.y, viewerOrientation.z, viewerOrientation.w]
      .every(Number.isFinite) ||
    distanceMeters <= 0) {
    throw new RangeError("Panel group placement requires a finite viewer pose and positive distance.");
  }
  const orientation = new THREE.Quaternion(
    viewerOrientation.x,
    viewerOrientation.y,
    viewerOrientation.z,
    viewerOrientation.w,
  ).normalize();
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(orientation).normalize();
  const position = calculatePanelGroupPosition(
    viewerPosition,
    { x: forward.x, y: forward.y, z: forward.z },
    distanceMeters,
    heightOffsetMeters,
  );
  const yaw = spatialDockOrientation(orientation);
  return {
    position,
    orientation: { x: yaw.x, y: yaw.y, z: yaw.z, w: yaw.w },
    forward: { x: forward.x, y: forward.y, z: forward.z },
  };
}

/** Clamp the two shared PanelGroup control values to their approved token ranges. */
export function clampPanelGroupDistance(distanceMeters: number): number {
  if (!Number.isFinite(distanceMeters)) throw new RangeError("Panel distance must be finite.");
  return THREE.MathUtils.clamp(
    distanceMeters,
    PANEL_LIMITS.distanceMeters.min,
    PANEL_LIMITS.distanceMeters.max,
  );
}

export function clampPanelGroupScale(scale: number): number {
  if (!Number.isFinite(scale)) throw new RangeError("Panel scale must be finite.");
  return THREE.MathUtils.clamp(scale, PANEL_LIMITS.scale.min, PANEL_LIMITS.scale.max);
}

/** Return the horizontal angular width of a centered panel at a given distance. */
export function panelHorizontalAngleDegrees(widthMeters: number, distanceMeters: number): number {
  if (![widthMeters, distanceMeters].every(Number.isFinite) || widthMeters <= 0 || distanceMeters <= 0) {
    throw new RangeError("Panel width and distance must be finite and positive.");
  }
  return THREE.MathUtils.radToDeg(2 * Math.atan(widthMeters / (2 * distanceMeters)));
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

/** Keep touch pointer picking for handheld AR while controller rays own headset input. */
export function shouldEnableSpatialPanelPointerEvents(
  requested: boolean,
  arActive: boolean,
  profile: SpatialPresentationProfile,
): boolean {
  return requested || (arActive && profile === "handheld");
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

/** Fit equal-width dock tabs in 92% of the visible viewport without paging. */
export function calculateSpatialDockLayout(
  viewportWidthPx: number,
  viewportHeightPx: number,
  projectionY: number,
  profile: SpatialPresentationProfile,
  includeSettings = false,
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
    ...(includeSettings ? ["settings" as const] : []),
  ];
  const rowWidthPx = maxRowWidthPx;
  const tabWidthPx = rowWidthPx / keys.length;
  const minimumTabTargetDp = profile === "headset"
    ? horizonTokens.primaryHandHitTargetDp
    : horizonTokens.minimumHitTargetDp;
  if (tabWidthPx < minimumTabTargetDp) {
    throw new RangeError("The viewport is too narrow for the minimum Horizon UI tab target.");
  }
  return {
    pixelsPerMeter,
    maxRowWidthPx,
    keys,
    rowWidthPx,
    tabWidthPx,
    cardWidthMeters: rowWidthPx / pixelsPerMeter,
    detailWidthMeters: rowWidthPx / pixelsPerMeter,
    detailHeightMeters: viewportHeightPx * 0.38 / pixelsPerMeter,
    tabHeightMeters: minimumTabTargetDp / pixelsPerMeter,
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

/** Calculate a world-space dock transform from a valid viewer pose. */
export function calculateSpatialDockPlacement(
  viewerPosition: Readonly<{ x: number; y: number; z: number }>,
  viewerOrientation: Readonly<{ x: number; y: number; z: number; w: number }>,
  distanceMeters: number,
  verticalOffsetMeters: number,
): Readonly<{
  position: Readonly<{ x: number; y: number; z: number }>;
  orientation: Readonly<{ x: number; y: number; z: number; w: number }>;
}> {
  const orientation = new THREE.Quaternion(
    viewerOrientation.x,
    viewerOrientation.y,
    viewerOrientation.z,
    viewerOrientation.w,
  ).normalize();
  const position = new THREE.Vector3(viewerPosition.x, viewerPosition.y, viewerPosition.z)
    .addScaledVector(
      new THREE.Vector3(0, 0, -1).applyQuaternion(orientation),
      distanceMeters,
    )
    .add(new THREE.Vector3(0, verticalOffsetMeters, 0));
  const dockOrientation = spatialDockOrientation(orientation);
  return {
    position: { x: position.x, y: position.y, z: position.z },
    orientation: {
      x: dockOrientation.x,
      y: dockOrientation.y,
      z: dockOrientation.z,
      w: dockOrientation.w,
    },
  };
}
