import * as THREE from "three";
import type { InputAction } from "@mma/engine-input";
import type { GlassPanel, GlassPanelState } from "./glass-panel.js";
import type { GlassPanelItem } from "./panel-layout.js";

export type SpatialPanelPhase = "move" | "down" | "up" | "cancel";

export interface SpatialPanelMount {
  readonly panel: GlassPanel;
  readonly position?: Readonly<{ x: number; y: number; z: number }>;
  readonly quaternion?: THREE.Quaternion;
  readonly scale?: number;
  readonly collapsible?: boolean;
  readonly selectionId?: string;
}

export interface SpatialPanelHostOptions {
  readonly group: THREE.Group;
  readonly camera: THREE.Camera;
  readonly pointerTarget: HTMLElement;
  readonly panels: readonly SpatialPanelMount[];
  readonly onPanelAction: (inputId: string) => void;
  readonly enablePointerEvents?: boolean;
  readonly onPanelSelection?: (selectionId: string) => void;
  readonly shouldIgnorePointerTarget?: (target: EventTarget | null) => boolean;
  /** Receive the shared action vocabulary for particle-token ray gestures. */
  readonly onSpatialInput?: (action: InputAction) => void;
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
  /** Enable or remove browser-pointer listeners without disabling XR ray input. */
  setPointerEventsEnabled(enabled: boolean): void;
  handleRay(ray: THREE.Ray, phase: SpatialPanelPhase, sourceId?: string): boolean;
  dispose(): void;
} {
  const {
    group,
    camera,
    pointerTarget,
    panels,
    onPanelAction,
    enablePointerEvents = true,
    onPanelSelection,
    shouldIgnorePointerTarget,
    onSpatialInput,
  } = options;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const pressed = new Map<string, PressedPanel>();
  const capturedPointerIds = new Set<number>();
  const particleDrags = new Map<string, string>();
  const collapsed = new Map<GlassPanel, boolean>();
  let hovered: PanelHit | null = null;
  let disposed = false;
  let pointerEventsEnabled = false;

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
      const draggingParticle = particleDrags.get(sourceId);
      if (draggingParticle) {
        dispatchParticleDrag(phase, draggingParticle, sourceId, raycaster.ray);
        if (phase === "up" || phase === "cancel") particleDrags.delete(sourceId);
        return true;
      }
      return false;
    }

    if (phase === "move") {
      updateHover(hit);
      const draggingParticle = particleDrags.get(sourceId);
      if (draggingParticle) {
        dispatchParticleDrag("move", draggingParticle, sourceId, raycaster.ray);
        return true;
      }
    }
    if (phase === "down") {
      pressed.set(sourceId, {
        mount: hit.mount,
        inputId: hit.inputId,
        headerHit: hit.uv.y >= 0.78,
      });
      if (hit.inputId) hit.mount.panel.update({ pressedInputId: hit.inputId });
      const particle = particleForToken(hit.inputId);
      if (particle) {
        particleDrags.set(sourceId, particle);
        dispatchParticleDrag("down", particle, sourceId, raycaster.ray);
      }
    } else if (phase === "up") {
      const previous = pressed.get(sourceId);
      clearPressed(sourceId);
      const draggingParticle = particleDrags.get(sourceId);
      if (draggingParticle) {
        dispatchParticleDrag("up", draggingParticle, sourceId, raycaster.ray);
        particleDrags.delete(sourceId);
      } else if (
        previous?.mount === hit.mount &&
        previous.inputId !== null &&
        previous.inputId === hit.inputId
      ) {
        onPanelAction(hit.inputId);
      } else if (
        previous?.mount === hit.mount &&
        previous.mount.selectionId &&
        previous.mount === hit.mount
      ) {
        onPanelSelection?.(previous.mount.selectionId);
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
      const draggingParticle = particleDrags.get(sourceId);
      if (draggingParticle) {
        dispatchParticleDrag("cancel", draggingParticle, sourceId, raycaster.ray);
        particleDrags.delete(sourceId);
      }
    }
    return consumed || particleDrags.has(sourceId);
  };

  const dispatchParticleDrag = (
    phase: SpatialPanelPhase,
    particle: string,
    sourceId: string,
    ray: THREE.Ray,
  ): void => {
    const rayPayload = {
      rayOriginX: ray.origin.x,
      rayOriginY: ray.origin.y,
      rayOriginZ: ray.origin.z,
      rayDirectionX: ray.direction.x,
      rayDirectionY: ray.direction.y,
      rayDirectionZ: ray.direction.z,
    };
    const source = `tray:${particle}`;
    if (phase === "down") {
      onSpatialInput?.({
        type: "grab",
        payload: { source, sourceId, spatialParticleDrag: true, ...rayPayload },
      });
    } else if (phase === "move") {
      onSpatialInput?.({
        type: "move",
        payload: { source, sourceId, spatialParticleDrag: true, ...rayPayload },
      });
    } else {
      onSpatialInput?.({
        type: "release",
        payload: {
          source,
          sourceId,
          spatialParticleDrag: true,
          cancelled: phase === "cancel",
          ...rayPayload,
        },
      });
    }
  };

  const clearPressed = (sourceId: string): void => {
    const previous = pressed.get(sourceId);
    previous?.mount.panel.update({ pressedInputId: null });
    pressed.delete(sourceId);
  };

  const releaseCapturedPointer = (pointerId: number): void => {
    if (!capturedPointerIds.delete(pointerId)) return;
    if (
      "hasPointerCapture" in pointerTarget &&
      pointerTarget.hasPointerCapture(pointerId)
    ) {
      pointerTarget.releasePointerCapture(pointerId);
    }
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
      if (phase === "down" && "setPointerCapture" in pointerTarget) {
        pointerTarget.setPointerCapture(event.pointerId);
        capturedPointerIds.add(event.pointerId);
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
  };
  const onPointerMove = (event: PointerEvent): void => consumePointerEvent(event, "move");
  const onPointerDown = (event: PointerEvent): void => consumePointerEvent(event, "down");
  const onPointerUp = (event: PointerEvent): void => {
    consumePointerEvent(event, "up");
    releaseCapturedPointer(event.pointerId);
  };
  const onPointerCancel = (event: PointerEvent): void => {
    consumePointerEvent(event, "cancel");
    releaseCapturedPointer(event.pointerId);
  };

  const setPointerEventsEnabled = (enabled: boolean): void => {
    if (disposed || pointerEventsEnabled === enabled) return;
    pointerEventsEnabled = enabled;
    if (!enabled) {
      for (const pointerId of capturedPointerIds) {
        clearPressed(`pointer:${pointerId}`);
        releaseCapturedPointer(pointerId);
      }
      for (const [sourceId, particle] of particleDrags) {
        if (!sourceId.startsWith("pointer:")) continue;
        dispatchParticleDrag("cancel", particle, sourceId, new THREE.Ray());
        particleDrags.delete(sourceId);
      }
    }
    if (enabled) {
      pointerTarget.addEventListener("pointermove", onPointerMove, true);
      pointerTarget.addEventListener("pointerdown", onPointerDown, true);
      pointerTarget.addEventListener("pointerup", onPointerUp, true);
      pointerTarget.addEventListener("pointercancel", onPointerCancel, true);
    } else {
      pointerTarget.removeEventListener("pointermove", onPointerMove, true);
      pointerTarget.removeEventListener("pointerdown", onPointerDown, true);
      pointerTarget.removeEventListener("pointerup", onPointerUp, true);
      pointerTarget.removeEventListener("pointercancel", onPointerCancel, true);
    }
  };
  setPointerEventsEnabled(enablePointerEvents);

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
    setPointerEventsEnabled,
    handleRay(ray, phase, sourceId = "xr:primary") {
      if (disposed) return false;
      return routeHit(panelForRay(ray), phase, sourceId, () => undefined);
    },
    dispose() {
      if (disposed) return;
      for (const [sourceId, particle] of particleDrags) {
        dispatchParticleDrag("cancel", particle, sourceId, new THREE.Ray());
      }
      particleDrags.clear();
      setPointerEventsEnabled(false);
      disposed = true;
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

function particleForToken(inputId: string | null): string | null {
  const match = /^particle:token:(proton|neutron|electron)$/.exec(inputId ?? "");
  return match?.[1] ?? null;
}
