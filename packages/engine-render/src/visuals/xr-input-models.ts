import type * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { XRControllerModelFactory } from "three/examples/jsm/webxr/XRControllerModelFactory.js";
import { XRHandModelFactory } from "three/examples/jsm/webxr/XRHandModelFactory.js";

/**
 * Creates the official device models for XR input sources. Each `create*` call returns an
 * object that stays empty until its model has loaded for the connected source, then
 * contains (and animates) the model. Callers treat an empty object as "not loaded yet".
 */
export interface XrInputModelFactories {
  /** Attach a controller model that follows `grip`; buttons and sticks animate from the gamepad. */
  createControllerModel(grip: THREE.XRGripSpace): THREE.Object3D;
  /** Attach a skinned hand mesh driven by the joints of `hand`. */
  createHandModel(hand: THREE.XRHandSpace): THREE.Object3D;
}

/** Folder, under the models path, that holds Meta's generic hand meshes. */
export const XR_HAND_MODEL_FOLDER = "generic-hand";

/**
 * Load official WebXR Input Profiles models (Meta Quest Touch controllers and the generic
 * hand) from a local folder laid out like `@webxr-input-profiles/assets/dist/profiles`:
 * `profilesList.json`, then `<profile-id>/profile.json`, `left.glb` and `right.glb`.
 *
 * Models are only requested when a matching source connects in an XR session. A source
 * whose profile is not in the local list gets no model, and the caller keeps its fallback.
 */
export function createOfficialXrInputModels(modelsPath: string): XrInputModelFactories {
  const base = modelsPath.replace(/\/+$/, "");
  const handPath = `${base}/${XR_HAND_MODEL_FOLDER}/`;
  const controllers = new XRControllerModelFactory(new GLTFLoader());
  controllers.setPath(base);
  // The hand loader needs its own path: three.js's XRHandMeshModel loads `<handedness>.glb`
  // relative to the loader it is given and never sets that loader's path itself.
  const hands = new XRHandModelFactory(new GLTFLoader().setPath(handPath));
  hands.setPath(handPath);
  return {
    createControllerModel: (grip) => controllers.createControllerModel(grip),
    createHandModel: (hand) => hands.createHandModel(hand, "mesh"),
  };
}
