import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createOfficialXrInputModels } from "../src/visuals/xr-input-models.js";
import {
  XR_HAND_JOINT_NAMES,
  XR_RAY_DEFAULT_LENGTH,
  XrInputVisuals,
  clampXrRayLength,
} from "../src/visuals/xr-input-visuals.js";

function makeRenderer() {
  const controllers = new Map<number, THREE.Group>();
  const grips = new Map<number, THREE.Group>();
  const hands = new Map<number, THREE.Group & { joints: Record<string, THREE.Group> }>();
  const get = <T extends THREE.Object3D>(map: Map<number, T>, index: number, make: () => T): T => {
    let value = map.get(index);
    if (!value) {
      value = make();
      map.set(index, value);
    }
    return value;
  };
  const renderer = {
    xr: {
      getController: (index: number) => get(controllers, index, () => new THREE.Group()),
      getControllerGrip: (index: number) => get(grips, index, () => new THREE.Group()),
      getHand: (index: number) => get(hands, index, () => Object.assign(new THREE.Group(), { joints: {} })),
    },
  } as unknown as THREE.WebGLRenderer;
  return { renderer, controllers, grips, hands };
}

const controllerSource = { targetRayMode: "tracked-pointer", hand: null } as unknown as XRInputSource;
const handSource = { targetRayMode: "tracked-pointer", hand: {} } as unknown as XRInputSource;

describe("clampXrRayLength", () => {
  it("defaults when there is no hit and clamps extremes", () => {
    expect(clampXrRayLength(undefined)).toBe(XR_RAY_DEFAULT_LENGTH);
    expect(clampXrRayLength(Number.NaN)).toBe(XR_RAY_DEFAULT_LENGTH);
    expect(clampXrRayLength(0)).toBeCloseTo(0.05);
    expect(clampXrRayLength(500)).toBe(10);
    expect(clampXrRayLength(2)).toBe(2);
  });
});

describe("XrInputVisuals", () => {
  it("asks three.js for each hand so joints are built, and adds every space to the scene", () => {
    const { renderer, hands } = makeRenderer();
    const scene = new THREE.Scene();
    const visuals = new XrInputVisuals(renderer, scene);
    expect(hands.size).toBe(4);
    for (const hand of hands.values()) expect(hand.parent).toBe(scene);
    visuals.dispose();
  });

  it("shows the pointer and controller model only for a connected tracked pointer", () => {
    const { renderer, controllers } = makeRenderer();
    const visuals = new XrInputVisuals(renderer, new THREE.Scene());
    const pointer = controllers.get(0)!.getObjectByName("xr-pointer-0")!;
    const model = controllers.get(0)!.getObjectByName("xr-controller-model-0")!;
    expect(pointer.visible).toBe(false);
    controllers.get(0)!.dispatchEvent({ type: "connected", data: controllerSource } as never);
    expect(pointer.visible).toBe(true);
    expect(model.visible).toBe(true);
    controllers.get(0)!.dispatchEvent({ type: "disconnected" } as never);
    expect(pointer.visible).toBe(false);
    expect(model.visible).toBe(false);
    visuals.dispose();
  });

  it("points the controller model down the same axis as the ray", () => {
    const { renderer, controllers } = makeRenderer();
    const visuals = new XrInputVisuals(renderer, new THREE.Scene());
    const controller = controllers.get(0)!;
    controller.rotation.y = 1.2;
    controller.updateMatrixWorld(true);
    const model = controller.getObjectByName("xr-controller-model-0")!;
    const ray = controller.getObjectByName("xr-pointer-ray-0") as THREE.Mesh;
    const box = (object: THREE.Object3D) => new THREE.Box3().setFromObject(object);
    const rayDirection = box(ray).getCenter(new THREE.Vector3())
      .sub(controller.getWorldPosition(new THREE.Vector3())).normalize();
    const nose = (model.children[1] as THREE.Mesh);
    const noseDirection = box(nose).getCenter(new THREE.Vector3())
      .sub(box(model.children[0]!).getCenter(new THREE.Vector3())).normalize();
    expect(noseDirection.dot(rayDirection)).toBeGreaterThan(0.99);
    visuals.dispose();
  });

  it("marks its objects so scene diagnostics skip them", () => {
    const { renderer } = makeRenderer();
    const scene = new THREE.Scene();
    const visuals = new XrInputVisuals(renderer, scene);
    expect(scene.children.every((child) => child.userData.diagnosticsIgnore === true)).toBe(true);
    visuals.dispose();
  });

  it("shows a pointer but no controller model for a hand", () => {
    const { renderer, controllers } = makeRenderer();
    const visuals = new XrInputVisuals(renderer, new THREE.Scene());
    controllers.get(1)!.dispatchEvent({ type: "connected", data: handSource } as never);
    expect(controllers.get(1)!.getObjectByName("xr-pointer-1")!.visible).toBe(true);
    expect(controllers.get(1)!.getObjectByName("xr-controller-model-1")!.visible).toBe(false);
    visuals.dispose();
  });

  it("sizes the ray and reticle from the hit distance and press state", () => {
    const { renderer, controllers } = makeRenderer();
    const visuals = new XrInputVisuals(renderer, new THREE.Scene());
    controllers.get(0)!.dispatchEvent({ type: "connected", data: controllerSource } as never);
    const ray = controllers.get(0)!.getObjectByName("xr-pointer-ray-0") as THREE.Mesh;
    const reticle = controllers.get(0)!.getObjectByName("xr-pointer-reticle-0") as THREE.Mesh;
    expect(ray.renderOrder).toBeGreaterThan(100);
    expect(reticle.renderOrder).toBeGreaterThan(ray.renderOrder);
    visuals.updatePointer(controllerSource, 0.8, false);
    expect(ray.scale.z).toBeCloseTo(0.8);
    expect(reticle.position.z).toBeCloseTo(-0.8);
    expect(reticle.visible).toBe(true);
    visuals.updatePointer(controllerSource, undefined, true);
    expect(ray.scale.z).toBe(XR_RAY_DEFAULT_LENGTH);
    expect(reticle.visible).toBe(false);
    visuals.dispose();
  });

  it("ignores pointer updates for a source it has not seen", () => {
    const { renderer } = makeRenderer();
    const visuals = new XrInputVisuals(renderer, new THREE.Scene());
    expect(() => visuals.updatePointer(controllerSource, 1, false)).not.toThrow();
    visuals.dispose();
  });

  it("draws hand joints from three.js joint poses, only when hands are shown", () => {
    const { renderer, controllers, hands } = makeRenderer();
    const scene = new THREE.Scene();
    const visuals = new XrInputVisuals(renderer, scene);
    controllers.get(0)!.dispatchEvent({ type: "connected", data: handSource } as never);
    const hand = hands.get(0)!;
    hand.visible = true;
    const joint = Object.assign(new THREE.Group(), { jointRadius: 0.01 });
    joint.position.set(0.1, 0.2, -0.3);
    hand.joints["wrist"] = joint;
    const mesh = scene.getObjectByName("xr-hand-joints-0") as THREE.InstancedMesh;

    visuals.update();
    expect(mesh.visible).toBe(false);

    visuals.setHandsVisible(true);
    visuals.update();
    expect(mesh.visible).toBe(true);
    const matrix = new THREE.Matrix4();
    mesh.getMatrixAt(XR_HAND_JOINT_NAMES.indexOf("wrist"), matrix);
    const position = new THREE.Vector3().setFromMatrixPosition(matrix);
    expect(position.x).toBeCloseTo(0.1);
    expect(position.z).toBeCloseTo(-0.3);
    mesh.getMatrixAt(XR_HAND_JOINT_NAMES.indexOf("thumb-tip"), matrix);
    expect(new THREE.Vector3().setFromMatrixScale(matrix).x).toBe(0);

    visuals.setHandsVisible(false);
    expect(mesh.visible).toBe(false);
    visuals.dispose();
  });

  it("hides everything on reset and removes its objects on dispose", () => {
    const { renderer, controllers, hands } = makeRenderer();
    const scene = new THREE.Scene();
    const visuals = new XrInputVisuals(renderer, scene);
    controllers.get(0)!.dispatchEvent({ type: "connected", data: controllerSource } as never);
    visuals.reset();
    expect(controllers.get(0)!.getObjectByName("xr-pointer-0")!.visible).toBe(false);
    visuals.dispose();
    expect(hands.get(0)!.parent).toBeNull();
    expect(scene.children).toHaveLength(0);
    expect(() => visuals.dispose()).not.toThrow();
  });

  it("attaches official models to the grip and hand spaces and hides fallbacks once they load", () => {
    const { renderer, controllers, grips, hands } = makeRenderer();
    const created: { controller: THREE.Object3D[]; hand: THREE.Object3D[] } = { controller: [], hand: [] };
    const models = {
      createControllerModel: () => {
        const model = new THREE.Object3D();
        created.controller.push(model);
        return model;
      },
      createHandModel: () => {
        const model = new THREE.Object3D();
        created.hand.push(model);
        return model;
      },
    };
    const visuals = new XrInputVisuals(renderer, new THREE.Scene(), models);
    expect(created.controller[0]!.parent).toBe(grips.get(0));
    expect(created.hand[0]!.parent).toBe(hands.get(0));

    controllers.get(0)!.dispatchEvent({ type: "connected", data: controllerSource } as never);
    const fallback = controllers.get(0)!.getObjectByName("xr-controller-model-0")!;
    visuals.update();
    expect(fallback.visible).toBe(true);
    created.controller[0]!.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    visuals.update();
    expect(fallback.visible).toBe(false);

    visuals.setHandsVisible(true);
    controllers.get(1)!.dispatchEvent({ type: "connected", data: handSource } as never);
    hands.get(1)!.visible = true;
    const joints = (visuals as unknown as { scene: THREE.Scene }).scene.getObjectByName("xr-hand-joints-1")!;
    visuals.update();
    expect(joints.visible).toBe(true);
    created.hand[1]!.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    visuals.update();
    expect(joints.visible).toBe(false);
    expect(created.hand[1]!.visible).toBe(true);
    visuals.setHandsVisible(false);
    expect(created.hand[1]!.visible).toBe(false);

    visuals.dispose();
    expect(created.controller[0]!.parent).toBeNull();
    expect(created.hand[1]!.parent).toBeNull();
  });

  it("builds official model factories without fetching anything until a source connects", () => {
    const fetchSpy = globalThis.fetch;
    let fetched = false;
    globalThis.fetch = (() => {
      fetched = true;
      return Promise.reject(new Error("offline"));
    }) as typeof fetch;
    try {
      const models = createOfficialXrInputModels("/xr-input-profiles/");
      const grip = new THREE.Group() as unknown as THREE.XRGripSpace;
      const hand = Object.assign(new THREE.Group(), { joints: {} }) as unknown as THREE.XRHandSpace;
      expect(models.createControllerModel(grip)).toBeInstanceOf(THREE.Object3D);
      expect(models.createHandModel(hand)).toBeInstanceOf(THREE.Object3D);
      expect(fetched).toBe(false);
    } finally {
      globalThis.fetch = fetchSpy;
    }
  });

  it("requests hand meshes from the generic-hand folder", async () => {
    const fetchSpy = globalThis.fetch;
    const urls: string[] = [];
    globalThis.fetch = ((input: RequestInfo | URL) => {
      urls.push(String(input instanceof Request ? input.url : input));
      return Promise.reject(new Error("offline"));
    }) as typeof fetch;
    try {
      const models = createOfficialXrInputModels("http://localhost/xr-input-profiles/");
      const hand = Object.assign(new THREE.Group(), { joints: {} }) as unknown as THREE.XRHandSpace;
      models.createHandModel(hand);
      hand.dispatchEvent({ type: "connected", data: { hand: {}, handedness: "left" } } as never);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(urls).toEqual(["http://localhost/xr-input-profiles/generic-hand/left.glb"]);
    } finally {
      globalThis.fetch = fetchSpy;
    }
  });
});
