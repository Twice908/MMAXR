import * as THREE from "three";
import type { XrInputModelFactories } from "./xr-input-models.js";

/** The 25 joints of a WebXR hand, in the order used for the joint instance mesh. */
export const XR_HAND_JOINT_NAMES = [
  "wrist",
  "thumb-metacarpal", "thumb-phalanx-proximal", "thumb-phalanx-distal", "thumb-tip",
  "index-finger-metacarpal", "index-finger-phalanx-proximal", "index-finger-phalanx-intermediate",
  "index-finger-phalanx-distal", "index-finger-tip",
  "middle-finger-metacarpal", "middle-finger-phalanx-proximal", "middle-finger-phalanx-intermediate",
  "middle-finger-phalanx-distal", "middle-finger-tip",
  "ring-finger-metacarpal", "ring-finger-phalanx-proximal", "ring-finger-phalanx-intermediate",
  "ring-finger-phalanx-distal", "ring-finger-tip",
  "pinky-finger-metacarpal", "pinky-finger-phalanx-proximal", "pinky-finger-phalanx-intermediate",
  "pinky-finger-phalanx-distal", "pinky-finger-tip",
] as const satisfies readonly XRHandJoint[];

/** Default visual ray length in metres when nothing is hit. */
export const XR_RAY_DEFAULT_LENGTH = 1.5;
const XR_RAY_MIN_LENGTH = 0.05;
const XR_RAY_MAX_LENGTH = 10;
/** Input sources three.js can expose at once (two controllers or hands, plus spare slots). */
const SLOT_COUNT = 4;
// Both colours stay readable on the light VR room and on passthrough.
/** Drawn after panels, labels and the atom so the whole ray up to its hit stays visible. */
const POINTER_RENDER_ORDER = 1000;
const RAY_COLOR = 0x42a5f5;
const RAY_COLOR_PRESSED = 0x0d47a1;

/** Clamp a ray length so the visual never vanishes or runs away. */
export function clampXrRayLength(length: number | undefined): number {
  if (length === undefined || !Number.isFinite(length)) return XR_RAY_DEFAULT_LENGTH;
  return Math.min(XR_RAY_MAX_LENGTH, Math.max(XR_RAY_MIN_LENGTH, length));
}

interface Slot {
  readonly controller: THREE.XRTargetRaySpace;
  readonly grip: THREE.XRGripSpace;
  readonly hand: THREE.XRHandSpace;
  readonly pointer: THREE.Group;
  readonly ray: THREE.Mesh;
  readonly reticle: THREE.Mesh;
  /** Procedural stand-in, shown until the official controller model has loaded. */
  readonly controllerModel: THREE.Group;
  /** Procedural joint skeleton, shown until the official hand mesh has loaded. */
  readonly joints: THREE.InstancedMesh;
  /** Official controller model on the grip space; empty until loaded. */
  readonly officialController: THREE.Object3D | null;
  /** Official skinned hand mesh on the hand space; empty until loaded. */
  readonly officialHand: THREE.Object3D | null;
  readonly cleanup: () => void;
  inputSource: XRInputSource | null;
}

/** Whether an optional model object has finished loading (factories leave it empty until then). */
function isLoaded(model: THREE.Object3D | null): boolean {
  return model !== null && model.children.length > 0;
}

/**
 * View-only visuals for XR input. The browser does not draw controllers or hands, so the
 * app must. With model factories, the official device models are shown (Meta Quest Touch
 * controllers, the generic hand mesh); until a model loads, or if it cannot load, a
 * procedural stand-in is shown instead. Every source also gets a pointer ray and reticle.
 */
export class XrInputVisuals {
  private readonly slots: Slot[] = [];
  private readonly rayGeometry = new THREE.BoxGeometry(0.004, 0.004, 1).translate(0, 0, -0.5);
  private readonly reticleGeometry = new THREE.RingGeometry(0.009, 0.018, 24);
  // Controller stand-in: a body behind the ray origin and a nose cone pointing down the ray
  // (local -Z of the target ray space), so the model visibly points where the ray goes.
  private readonly bodyGeometry = new THREE.CylinderGeometry(0.016, 0.02, 0.11, 16)
    .rotateX(Math.PI / 2)
    .translate(0, 0, 0.055);
  private readonly noseGeometry = new THREE.ConeGeometry(0.016, 0.035, 16)
    .rotateX(-Math.PI / 2)
    .translate(0, 0, -0.0175);
  private readonly jointGeometry = new THREE.SphereGeometry(1, 8, 6);
  private readonly rayMaterial = new THREE.MeshBasicMaterial({
    color: RAY_COLOR,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    // A ray ends at its first hit, so nothing can legitimately sit in front of it.
    depthTest: false,
  });
  private readonly reticleMaterial = new THREE.MeshBasicMaterial({
    color: 0x1565c0,
    transparent: true,
    opacity: 0.95,
    side: THREE.DoubleSide,
    depthTest: false,
  });
  private readonly controllerMaterial = new THREE.MeshBasicMaterial({
    color: 0x90caf9,
    transparent: true,
    opacity: 0.75,
  });
  private readonly jointMaterial = new THREE.MeshBasicMaterial({
    color: 0xb3e5fc,
    transparent: true,
    opacity: 0.85,
  });
  private readonly scratchMatrix = new THREE.Matrix4();
  private readonly scratchScale = new THREE.Vector3();
  private readonly identityQuaternion = new THREE.Quaternion();
  private handsVisible = false;
  private disposed = false;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Object3D,
    private readonly models?: XrInputModelFactories,
  ) {
    for (let index = 0; index < SLOT_COUNT; index += 1) this.slots.push(this.createSlot(index));
  }

  /** Show or hide hand models. Hide them in passthrough AR, where the real hands are visible. */
  setHandsVisible(visible: boolean): void {
    this.handsVisible = visible;
    for (const slot of this.slots) {
      if (!visible) slot.joints.visible = false;
      if (slot.officialHand) slot.officialHand.visible = visible;
    }
  }

  /** Size the ray and reticle for the source that produced `inputSource`. */
  updatePointer(
    inputSource: XRInputSource,
    hitDistance: number | undefined,
    pressed: boolean,
  ): void {
    const slot = this.slots.find((candidate) => candidate.inputSource === inputSource);
    if (!slot) return;
    const length = clampXrRayLength(hitDistance);
    slot.ray.scale.z = length;
    slot.reticle.position.z = -length;
    slot.reticle.visible = hitDistance !== undefined;
    slot.reticle.scale.setScalar(pressed ? 0.7 : 1);
    (slot.ray.material as THREE.MeshBasicMaterial).color.setHex(pressed ? RAY_COLOR_PRESSED : RAY_COLOR);
  }

  /**
   * Choose official model or fallback per source, and refresh fallback hand joints from
   * three.js's joint poses. Call once per XR frame, before render.
   */
  update(): void {
    if (this.disposed) return;
    for (const slot of this.slots) {
      const source = slot.inputSource;
      const pointingController = source !== null && source.hand == null && slot.pointer.visible;
      slot.controllerModel.visible = pointingController && !isLoaded(slot.officialController);
      const tracked = this.handsVisible && source?.hand != null && slot.hand.visible &&
        !isLoaded(slot.officialHand);
      slot.joints.visible = tracked;
      if (!tracked) continue;
      XR_HAND_JOINT_NAMES.forEach((name, index) => {
        const joint = slot.hand.joints[name];
        if (!joint || !joint.visible) {
          this.scratchMatrix.makeScale(0, 0, 0);
        } else {
          const radius = Math.max(0.004, joint.jointRadius ?? 0.008);
          this.scratchMatrix.compose(
            joint.position,
            this.identityQuaternion,
            this.scratchScale.setScalar(radius),
          );
        }
        slot.joints.setMatrixAt(index, this.scratchMatrix);
      });
      slot.joints.instanceMatrix.needsUpdate = true;
    }
  }

  /** Hide everything and forget connected sources, for the end of a session. */
  reset(): void {
    for (const slot of this.slots) {
      slot.inputSource = null;
      slot.pointer.visible = false;
      slot.controllerModel.visible = false;
      slot.joints.visible = false;
    }
  }

  /** Remove all objects and free GPU resources. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const slot of this.slots) {
      slot.cleanup();
      slot.controller.removeFromParent();
      slot.grip.removeFromParent();
      slot.hand.removeFromParent();
      slot.joints.removeFromParent();
      slot.joints.dispose();
      for (const model of [slot.officialController, slot.officialHand]) {
        if (!model) continue;
        model.removeFromParent();
        model.traverse((object) => {
          const mesh = object as THREE.Mesh;
          mesh.geometry?.dispose();
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const material of materials) material?.dispose();
        });
      }
    }
    this.slots.length = 0;
    this.rayGeometry.dispose();
    this.reticleGeometry.dispose();
    this.bodyGeometry.dispose();
    this.noseGeometry.dispose();
    this.jointGeometry.dispose();
    this.rayMaterial.dispose();
    this.reticleMaterial.dispose();
    this.controllerMaterial.dispose();
    this.jointMaterial.dispose();
  }

  private createSlot(index: number): Slot {
    const controller = this.renderer.xr.getController(index);
    const grip = this.renderer.xr.getControllerGrip(index);
    // three.js only builds the joint hierarchy for a hand it was asked for before connection.
    const hand = this.renderer.xr.getHand(index);

    const pointer = new THREE.Group();
    pointer.name = `xr-pointer-${index}`;
    pointer.visible = false;
    const ray = new THREE.Mesh(this.rayGeometry, this.rayMaterial.clone());
    ray.name = `xr-pointer-ray-${index}`;
    ray.scale.z = XR_RAY_DEFAULT_LENGTH;
    ray.renderOrder = POINTER_RENDER_ORDER;
    const reticle = new THREE.Mesh(this.reticleGeometry, this.reticleMaterial);
    reticle.name = `xr-pointer-reticle-${index}`;
    reticle.visible = false;
    reticle.renderOrder = POINTER_RENDER_ORDER + 1;
    pointer.add(ray, reticle);
    controller.add(pointer);

    const controllerModel = new THREE.Group();
    controllerModel.name = `xr-controller-model-${index}`;
    controllerModel.visible = false;
    controllerModel.add(
      new THREE.Mesh(this.bodyGeometry, this.controllerMaterial),
      new THREE.Mesh(this.noseGeometry, this.controllerMaterial),
    );
    // Attached to the target ray, not the grip, so model and ray can never disagree.
    controller.add(controllerModel);

    const joints = new THREE.InstancedMesh(this.jointGeometry, this.jointMaterial, XR_HAND_JOINT_NAMES.length);
    joints.name = `xr-hand-joints-${index}`;
    joints.frustumCulled = false;
    joints.visible = false;

    // Official models follow the grip (controllers) and the joints (hands); three.js poses both.
    const officialController = this.models?.createControllerModel(grip) ?? null;
    if (officialController) {
      officialController.name = `xr-controller-official-${index}`;
      grip.add(officialController);
    }
    const officialHand = this.models?.createHandModel(hand) ?? null;
    if (officialHand) {
      officialHand.name = `xr-hand-official-${index}`;
      officialHand.visible = this.handsVisible;
      hand.add(officialHand);
    }

    for (const object of [controller, grip, hand, joints]) object.userData.diagnosticsIgnore = true;
    this.scene.add(controller, grip, hand, joints);

    const slot: Slot = {
      controller,
      grip,
      hand,
      pointer,
      ray,
      reticle,
      controllerModel,
      joints,
      officialController,
      officialHand,
      inputSource: null,
      cleanup: () => {
        controller.removeEventListener("connected", onConnected);
        controller.removeEventListener("disconnected", onDisconnected);
        (ray.material as THREE.Material).dispose();
      },
    };

    const onConnected = (event: { data?: XRInputSource }): void => {
      const source = event.data;
      if (!source) return;
      slot.inputSource = source;
      const pointing = source.targetRayMode === "tracked-pointer" || source.targetRayMode === "gaze";
      pointer.visible = pointing;
      controllerModel.visible = pointing && source.hand == null;
    };
    const onDisconnected = (): void => {
      slot.inputSource = null;
      pointer.visible = false;
      controllerModel.visible = false;
      joints.visible = false;
    };
    controller.addEventListener("connected", onConnected as never);
    controller.addEventListener("disconnected", onDisconnected);
    return slot;
  }
}
