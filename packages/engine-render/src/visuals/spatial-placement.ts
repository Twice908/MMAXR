import * as THREE from "three";
import { spatialLayout, type SpatialPanelLayout } from "../spatial-layout.js";

export type SpatialPanelKey =
  | "mission"
  | "particles"
  | "elementInfo"
  | "narration"
  | "arControls"
  | "settings"
  | "xrDiagnostics";

export interface SpatialPanelPlacement {
  readonly position: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
  readonly size: Readonly<{ width: number; height: number }>;
  readonly scale: number;
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

/** Calculate fixed world placement from the initial viewer pose and viewport. */
export function calculateSpatialPanelPlacements(
  atomPosition: Readonly<{ x: number; y: number; z: number }>,
  initialViewerQuaternion: THREE.Quaternion,
  viewportWidth: number,
  viewportHeight: number,
): Readonly<Record<SpatialPanelKey, SpatialPanelPlacement>> {
  const scale = viewportWidth < viewportHeight
    ? spatialLayout.viewportScale.portrait
    : spatialLayout.viewportScale.landscape;
  const origin = new THREE.Vector3(atomPosition.x, atomPosition.y, atomPosition.z);
  const rotation = gravityAlignedQuaternion(initialViewerQuaternion);
  const rotateOffset = (layout: SpatialPanelLayout): THREE.Vector3 =>
    new THREE.Vector3(layout.position.x, layout.position.y, layout.position.z)
      .applyQuaternion(rotation)
      .add(origin);
  const placement = (layout: SpatialPanelLayout, expanded: boolean): SpatialPanelPlacement => ({
    position: rotateOffset(layout),
    quaternion: rotation.clone(),
    size: expanded ? layout.expandedSize : layout.collapsedSize,
    scale,
  });

  return {
    mission: placement(spatialLayout.mission, true),
    particles: placement(spatialLayout.particles, false),
    elementInfo: placement(spatialLayout.elementInfo, false),
    narration: placement(spatialLayout.narrationSettings, false),
    arControls: placement(spatialLayout.arControls, true),
    settings: placement(spatialLayout.settings, false),
    xrDiagnostics: placement(spatialLayout.xrDiagnostics, true),
  };
}
