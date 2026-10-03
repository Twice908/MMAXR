import * as THREE from "three";
import type { PickFunction, PickResult, RayPick } from "./types.js";

export interface RaycastPickerOptions {
  camera?: THREE.Camera;
  recursive?: boolean;
  layers?: number;
  filter?: (object: THREE.Object3D) => boolean;
}

export function createRaycastPicker(
  root: THREE.Object3D,
  options: RaycastPickerOptions = {},
): PickFunction {
  const raycaster = new THREE.Raycaster();
  if (options.layers !== undefined) raycaster.layers.set(options.layers);

  const recursive = options.recursive ?? true;
  const filter = options.filter ?? (() => true);

  return (ray: RayPick): PickResult | null => {
    raycaster.set(ray.origin, ray.direction.clone().normalize());
    const intersections = raycaster.intersectObject(root, recursive);

    const hit = intersections.find((intersection) => filter(intersection.object));
    if (!hit) return null;

    let object: THREE.Object3D | null = hit.object;
    while (object && !object.userData.inputId) {
      object = object.parent;
    }

    const target = String(object?.userData.inputId ?? hit.object.uuid);

    return {
      target,
      object: object ?? hit.object,
      point: hit.point.clone(),
      distance: hit.distance,
    };
  };
}

export function createScreenRayPicker(
  camera: THREE.Camera,
  root: THREE.Object3D,
  domElement: HTMLElement,
  options: Omit<RaycastPickerOptions, "camera"> = {},
): (clientX: number, clientY: number) => string | null {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const recursive = options.recursive ?? true;
  const filter = options.filter ?? (() => true);

  return (clientX, clientY) => {
    const rect = domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(ndc, camera);
    const intersections = raycaster.intersectObject(root, recursive);
    const hit = intersections.find((intersection) => filter(intersection.object));
    if (!hit) return null;

    let object: THREE.Object3D | null = hit.object;
    while (object && !object.userData.inputId) object = object.parent;

    return String(object?.userData.inputId ?? hit.object.uuid);
  };
}
