import * as THREE from "three";
import { spatialLayout, type SpatialPanelLayout } from "../spatial-layout.js";

export type SpatialPanelKey = "mission" | "particles" | "elementInfo" | "narration" | "settings";

export interface SpatialPanelPlacement {
  readonly position: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
  readonly size: Readonly<{ width: number; height: number }>;
  readonly scale: number;
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
  const rotation = initialViewerQuaternion.clone();
  const rotateOffset = (layout: SpatialPanelLayout): THREE.Vector3 =>
    new THREE.Vector3(layout.position.x, layout.position.y, layout.position.z)
      .applyQuaternion(rotation)
      .add(origin);
  const placement = (layout: SpatialPanelLayout, expanded: boolean): SpatialPanelPlacement => ({
    position: rotateOffset(layout),
    quaternion: rotation.clone().multiply(new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        layout.tiltRadians.x,
        layout.tiltRadians.y,
        layout.tiltRadians.z,
      ),
    )),
    size: expanded ? layout.expandedSize : layout.collapsedSize,
    scale,
  });

  return {
    mission: placement(spatialLayout.mission, true),
    particles: placement(spatialLayout.particles, false),
    elementInfo: placement(spatialLayout.elementInfo, false),
    narration: placement(spatialLayout.narrationSettings, false),
    settings: placement(spatialLayout.settings, false),
  };
}
