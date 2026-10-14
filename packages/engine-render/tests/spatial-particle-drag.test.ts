import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createSpatialPanelHost } from "../src/visuals/spatial-panel-host.js";
import type { GlassPanel } from "../src/visuals/glass-panel.js";

describe("spatial particle panel drags", () => {
  it("starts a shared input drag from a token hit and continues beyond the panel", () => {
    const panelMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 1),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    );
    panelMesh.position.z = -2;
    const panel: GlassPanel = {
      object3d: panelMesh,
      update: () => undefined,
      hitTest: (uv) => uv.x >= 0.45 && uv.x <= 0.55 ? "particle:token:proton" : null,
      setCollapsed: () => undefined,
      setPage: () => undefined,
      setScale: () => undefined,
      dispose: () => undefined,
    };
    const group = new THREE.Group();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 20);
    camera.updateMatrixWorld(true);
    const actions: Array<{ type: string; payload: unknown }> = [];
    const host = createSpatialPanelHost({
      group,
      camera,
      pointerTarget: new EventTarget() as HTMLElement,
      panels: [{ panel }],
      onPanelAction: () => undefined,
      onSpatialInput: (action) => actions.push(action),
      enablePointerEvents: false,
    });
    const centerRay = new THREE.Ray(
      new THREE.Vector3(),
      new THREE.Vector3(0, 0, -1),
    );
    const offPanelRay = new THREE.Ray(
      new THREE.Vector3(),
      new THREE.Vector3(0.9, 0, -0.4).normalize(),
    );

    expect(host.handleRay(centerRay, "down", "touch:1")).toBe(true);
    expect(host.handleRay(offPanelRay, "move", "touch:1")).toBe(true);
    expect(host.handleRay(offPanelRay, "up", "touch:1")).toBe(true);
    expect(actions.map(({ type }) => type)).toEqual(["grab", "move", "release"]);
    expect(actions[0]?.payload).toMatchObject({
      source: "tray:proton",
      spatialParticleDrag: true,
    });
    expect(actions[1]?.payload).toMatchObject({
      source: "tray:proton",
      spatialParticleDrag: true,
    });

    host.dispose();
    panelMesh.geometry.dispose();
    (panelMesh.material as THREE.Material).dispose();
  });

  it("releases an active token gesture as cancelled when the host ends", () => {
    const panelMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 1),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    );
    panelMesh.position.z = -2;
    const panel: GlassPanel = {
      object3d: panelMesh,
      update: () => undefined,
      hitTest: () => "particle:token:electron",
      setCollapsed: () => undefined,
      setPage: () => undefined,
      setScale: () => undefined,
      dispose: () => undefined,
    };
    const actions: Array<{ type: string; payload: unknown }> = [];
    const host = createSpatialPanelHost({
      group: new THREE.Group(),
      camera: new THREE.PerspectiveCamera(42, 1, 0.1, 20),
      pointerTarget: new EventTarget() as HTMLElement,
      panels: [{ panel }],
      onPanelAction: () => undefined,
      onSpatialInput: (action) => actions.push(action),
      enablePointerEvents: false,
    });

    const ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, 0, -1));
    host.handleRay(ray, "down", "xr:hand");
    host.handleRay(ray, "cancel", "xr:hand");
    host.handleRay(ray, "down", "xr:hand");
    host.dispose();

    expect(actions.map(({ type }) => type)).toEqual(["grab", "release", "grab", "release"]);
    expect(actions[1]?.payload).toMatchObject({
      source: "tray:electron",
      cancelled: true,
    });
    expect(actions[3]?.payload).toMatchObject({
      source: "tray:electron",
      cancelled: true,
    });
    panelMesh.geometry.dispose();
    (panelMesh.material as THREE.Material).dispose();
  });
});
