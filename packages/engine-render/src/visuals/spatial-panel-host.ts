import * as THREE from "three";
import type { GlassPanel, GlassPanelState } from "./glass-panel.js";
import type { GlassPanelItem } from "./panel-layout.js";

export type SpatialPanelPhase = "move" | "down" | "up" | "cancel";

export interface SpatialPanelMount {
  readonly panel: GlassPanel;
  readonly position?: Readonly<{ x: number; y: number; z: number }>;
  readonly quaternion?: THREE.Quaternion;
  readonly scale?: number;
  readonly collapsible?: boolean;
}

export interface SpatialPanelHostOptions {
  readonly group: THREE.Group;
  readonly camera: THREE.Camera;
  readonly pointerTarget: HTMLElement;
  readonly panels: readonly SpatialPanelMount[];
  readonly onPanelAction: (inputId: string) => void;
  readonly shouldIgnorePointerTarget?: (target: EventTarget | null) => boolean;
}

interface PanelHit {
  readonly mount: SpatialPanelMount;
  readonly uv: THREE.Vector2;
  readonly inputId: string | null;
}

interface PressedPanel {
  readonly mount: SpatialPanelMount;
  readonly inputId: string | null;
  readonly headerHit: boolean;
}

/** Route panel hits ahead of atom picking and report whether the ray was consumed. */
export function consumeSpatialPanelHit(
  panelHit: boolean,
  inputId: string | null,
  onPanelAction: (inputId: string) => void,
  atomPicker: () => void,
): boolean {
  if (!panelHit) {
    atomPicker();
    return false;
  }
  if (inputId) onPanelAction(inputId);
  return true;
}

/** Mount view-only panels and route pointer, touch, and caller-provided XR rays. */
export function createSpatialPanelHost(options: SpatialPanelHostOptions): {
  update(panelId: string, state: readonly GlassPanelItem[] | GlassPanelState): void;
  setExpanded(expanded: boolean): void;
  handleRay(ray: THREE.Ray, phase: SpatialPanelPhase, sourceId?: string): boolean;
  dispose(): void;
} {
  const {
    group,
    camera,
    pointerTarget,
    panels,
    onPanelAction,
    shouldIgnorePointerTarget,
  } = options;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const pressed = new Map<string, PressedPanel>();
  const collapsed = new Map<GlassPanel, boolean>();
  let hovered: PanelHit | null = null;
  let disposed = false;

  for (const mount of panels) {
    if (mount.position) mount.panel.object3d.position.set(mount.position.x, mount.position.y, mount.position.z);
    if (mount.quaternion) mount.panel.object3d.quaternion.copy(mount.quaternion);
    if (mount.scale) mount.panel.setScale(mount.scale);
    if (mount.collapsible) {
      collapsed.set(mount.panel, true);
      mount.panel.setCollapsed(true);
    }
    group.add(mount.panel.object3d);
  }
  const setPanelCollapsed = (mount: SpatialPanelMount, next: boolean): void => {
    if (!mount.collapsible || collapsed.get(mount.panel) === next) return;
    collapsed.set(mount.panel, next);
    mount.panel.setCollapsed(next);
  };

  const panelForRay = (ray: THREE.Ray): PanelHit | null => {
    raycaster.ray.copy(ray);
    const intersections = raycaster.intersectObjects(
      panels.map(({ panel }) => panel.object3d),
      false,
    );
    const intersection = intersections.find((candidate) => candidate.uv !== undefined);
    if (!intersection?.uv) return null;
    const mount = panels.find(({ panel }) => panel.object3d === intersection.object);
    if (!mount) return null;
    return {
      mount,
      uv: intersection.uv,
      inputId: mount.panel.hitTest(intersection.uv),
    };
  };

  const updateHover = (next: PanelHit | null): void => {
    if (hovered?.mount === next?.mount && hovered?.inputId === next?.inputId) return;
    hovered?.mount.panel.update({ hoveredInputId: null });
    hovered = next;
    hovered?.mount.panel.update({ hoveredInputId: hovered.inputId });
  };

  const routeHit = (
    hit: PanelHit | null,
    phase: SpatialPanelPhase,
    sourceId: string,
    atomPicker: () => void,
  ): boolean => {
    const consumed = consumeSpatialPanelHit(
      hit !== null,
      null,
      () => undefined,
      atomPicker,
    );
    if (!hit) {
      if (phase === "move") updateHover(null);
      if (phase === "cancel" || phase === "up") clearPressed(sourceId);
      return false;
    }

    if (phase === "move") updateHover(hit);
    if (phase === "down") {
      pressed.set(sourceId, {
        mount: hit.mount,
        inputId: hit.inputId,
        headerHit: hit.uv.y >= 0.78,
      });
      if (hit.inputId) hit.mount.panel.update({ pressedInputId: hit.inputId });
    } else if (phase === "up") {
      const previous = pressed.get(sourceId);
      clearPressed(sourceId);
      if (
        previous?.mount === hit.mount &&
        previous.inputId !== null &&
        previous.inputId === hit.inputId
      ) {
        onPanelAction(hit.inputId);
      } else if (
        previous?.mount === hit.mount &&
        previous.headerHit &&
        hit.uv.y >= 0.78 &&
        hit.mount.collapsible
      ) {
        setPanelCollapsed(hit.mount, !collapsed.get(hit.mount.panel));
      }
    } else if (phase === "cancel") {
      clearPressed(sourceId);
    }
    return consumed;
  };

  const clearPressed = (sourceId: string): void => {
    const previous = pressed.get(sourceId);
    previous?.mount.panel.update({ pressedInputId: null });
    pressed.delete(sourceId);
  };

  const screenRay = (event: PointerEvent): THREE.Ray | null => {
    const bounds = pointerTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return null;
    pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    return raycaster.ray.clone();
  };

  const consumePointerEvent = (event: PointerEvent, phase: SpatialPanelPhase): void => {
    if (shouldIgnorePointerTarget?.(event.target)) return;
    const ray = screenRay(event);
    if (!ray) return;
    const consumed = routeHit(
      panelForRay(ray),
      phase,
      `pointer:${event.pointerId}`,
      () => undefined,
    );
    if (consumed) {
      if (phase === "down" && pointerTarget instanceof HTMLCanvasElement) {
        pointerTarget.setPointerCapture(event.pointerId);
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
  };
  const onPointerMove = (event: PointerEvent): void => consumePointerEvent(event, "move");
  const onPointerDown = (event: PointerEvent): void => consumePointerEvent(event, "down");
  const onPointerUp = (event: PointerEvent): void => consumePointerEvent(event, "up");
  const onPointerCancel = (event: PointerEvent): void => consumePointerEvent(event, "cancel");

  pointerTarget.addEventListener("pointermove", onPointerMove, true);
  pointerTarget.addEventListener("pointerdown", onPointerDown, true);
  pointerTarget.addEventListener("pointerup", onPointerUp, true);
  pointerTarget.addEventListener("pointercancel", onPointerCancel, true);

  return {
    update(panelId, state) {
      const mount = panels.find(({ panel }) => panel.object3d.name === panelId);
      mount?.panel.update(state);
    },
    setExpanded(expanded) {
      for (const mount of panels) {
        setPanelCollapsed(mount, !expanded);
      }
    },
    handleRay(ray, phase, sourceId = "xr:primary") {
      if (disposed) return false;
      return routeHit(panelForRay(ray), phase, sourceId, () => undefined);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      pointerTarget.removeEventListener("pointermove", onPointerMove, true);
      pointerTarget.removeEventListener("pointerdown", onPointerDown, true);
      pointerTarget.removeEventListener("pointerup", onPointerUp, true);
      pointerTarget.removeEventListener("pointercancel", onPointerCancel, true);
      for (const mount of panels) {
        group.remove(mount.panel.object3d);
        mount.panel.dispose();
      }
      pressed.clear();
      collapsed.clear();
      hovered = null;
    },
  };
}
