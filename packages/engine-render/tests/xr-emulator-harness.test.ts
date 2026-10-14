import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  resolveArFramePlacement,
  type ArPlacementTransform,
} from "../src/screen-renderer.js";
import {
  calculateSpatialDockLayout,
  profileSettings,
} from "../src/visuals/spatial-placement.js";
import { createVrEnvironmentForSession } from "../src/visuals/vr-environment.js";

type EmulatorReferenceSpace = Readonly<{ type: "local" | "local-floor" }>;

class FakeXrSession {
  readonly enabledFeatures: ReadonlySet<string>;
  readonly inputSources = [{ hand: {} }];
  readonly requestedFeatures = ["local-floor", "hand-tracking"];
  readonly hitTestSourceRequested = false;
  lastFrame: FakeXrFrame | null = null;
  private frameCallback: ((frame: FakeXrFrame) => void) | null = null;

  constructor(referenceSpaceType: EmulatorReferenceSpace["type"]) {
    this.enabledFeatures = new Set([
      "hand-tracking",
      ...(referenceSpaceType === "local-floor" ? ["local-floor"] : []),
    ]);
  }

  async requestReferenceSpace(type: EmulatorReferenceSpace["type"]): Promise<EmulatorReferenceSpace> {
    return { type };
  }

  setAnimationLoop(callback: (frame: FakeXrFrame) => void): void {
    this.frameCallback = callback;
  }

  emitFrame(pose: FakeXrFrame["pose"]): void {
    if (!this.frameCallback) throw new Error("The fake XR render callback was not installed.");
    this.lastFrame = new FakeXrFrame(pose);
    this.frameCallback(this.lastFrame);
  }
}

class FakeXrFrame {
  lastReferenceSpace: EmulatorReferenceSpace | null = null;

  constructor(readonly pose: {
    readonly transform: {
      readonly position: Readonly<{ x: number; y: number; z: number }>;
      readonly orientation: Readonly<{ x: number; y: number; z: number; w: number }>;
    };
    readonly views: readonly unknown[];
  } | null) {}

  getViewerPose(referenceSpace: EmulatorReferenceSpace): FakeXrFrame["pose"] {
    this.lastReferenceSpace = referenceSpace;
    return this.pose;
  }
}

describe("emulated immersive XR frame lifecycle", () => {
  it.each(["local", "local-floor"] as const)(
    "waits for a valid %s pose before anchoring atom and panels",
    async (referenceSpaceType) => {
      const session = new FakeXrSession(referenceSpaceType);
      const referenceSpace = await session.requestReferenceSpace(referenceSpaceType);
      const vrEnvironment = createVrEnvironmentForSession("immersive-vr", "opaque");
      if (!vrEnvironment) throw new Error("Opaque immersive VR should have an environment.");
      const xrScene = new THREE.Scene();
      xrScene.add(vrEnvironment.root);

      const atomPlacement: { value: ArPlacementTransform | null } = { value: null };
      let firstFramePoseWasNull: boolean | null = null;
      let renderedFrames = 0;
      let viewCount: number | null = null;
      let drawnEnvironmentObjects: string[] = [];
      session.setAnimationLoop((frame) => {
        const viewerFrame = resolveArFramePlacement(frame, referenceSpace);
        if (firstFramePoseWasNull === null) firstFramePoseWasNull = viewerFrame === null;
        if (viewerFrame && !atomPlacement.value) {
          atomPlacement.value = viewerFrame.placement;
        }
        if (viewerFrame) {
          viewCount = viewerFrame.viewCount;
          drawnEnvironmentObjects = [];
          xrScene.traverse((object) => {
            if (object instanceof THREE.Mesh && object.visible) {
              drawnEnvironmentObjects.push(object.name);
            }
          });
        }
        renderedFrames += 1;
      });

      session.emitFrame(null);
      expect(atomPlacement.value).toBeNull();
      expect(firstFramePoseWasNull).toBe(true);
      expect(session.lastFrame?.lastReferenceSpace).toBe(referenceSpace);

      session.emitFrame({
        transform: {
          position: { x: 0, y: 1.6, z: 0 },
          orientation: { x: 0, y: 0, z: 0, w: 1 },
        },
        views: [{}, {}],
      });

      expect(session.enabledFeatures.has("hand-tracking")).toBe(true);
      expect(session.enabledFeatures.has("local-floor")).toBe(referenceSpaceType === "local-floor");
      expect(session.inputSources).toHaveLength(1);
      expect(session.requestedFeatures).toEqual(["local-floor", "hand-tracking"]);
      expect(session.hitTestSourceRequested).toBe(false);
      expect(renderedFrames).toBe(2);
      expect(viewCount).toBe(2);
      expect(atomPlacement.value).not.toBeNull();
      if (!atomPlacement.value) throw new Error("A valid viewer pose should place the atom.");
      expect(atomPlacement.value.position.x).toBeCloseTo(0);
      expect(atomPlacement.value.position.y).toBeCloseTo(1.45);
      expect(atomPlacement.value.position.z).toBeCloseTo(-0.8);

      const viewer = new THREE.PerspectiveCamera(42, 1.6, 0.1, 80);
      viewer.position.set(0, 1.6, 0);
      viewer.updateMatrixWorld(true);
      const frustum = new THREE.Frustum().setFromProjectionMatrix(
        new THREE.Matrix4().multiplyMatrices(viewer.projectionMatrix, viewer.matrixWorldInverse),
      );
      const atomPosition = new THREE.Vector3(
        atomPlacement.value.position.x,
        atomPlacement.value.position.y,
        atomPlacement.value.position.z,
      );
      expect(atomPosition.z).toBeLessThan(0);
      expect(frustum.containsPoint(atomPosition)).toBe(true);

      const dock = calculateSpatialDockLayout(
        1280,
        800,
        viewer.projectionMatrix.elements[5]!,
        "headset",
        true,
      );
      const dockProfile = profileSettings("headset");
      expect(dock.keys).toHaveLength(5);
      const leftEdge = -dock.rowWidthPx / 2;
      const verticalDrop = Math.tan(dockProfile.downAngleRadians) * dockProfile.distanceMeters;
      for (let index = 0; index < dock.keys.length; index += 1) {
        const xPixels = leftEdge + (index + 0.5) * dock.tabWidthPx;
        const cardCenter = new THREE.Vector3(
          xPixels / dock.pixelsPerMeter,
          1.6 - verticalDrop,
          -dockProfile.distanceMeters,
        );
        expect(cardCenter.z).toBeLessThan(0);
        expect(frustum.containsPoint(cardCenter)).toBe(true);
      }
      expect(dock.rowWidthPx).toBeLessThanOrEqual(1280 * 0.92);
      expect(dock.tabWidthPx).toBeGreaterThanOrEqual(48);
      expect(drawnEnvironmentObjects).toEqual(expect.arrayContaining([
        "vr-gradient-sky",
        "vr-dim-grid-floor",
      ]));
      expect(vrEnvironment.root.parent).toBe(xrScene);
      vrEnvironment.dispose();
    },
  );
});
