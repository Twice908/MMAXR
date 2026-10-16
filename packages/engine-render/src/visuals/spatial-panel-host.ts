import * as THREE from "three";
import type { InputAction } from "@mma/engine-input";
import type { GlassPanel, GlassPanelState } from "./glass-panel.js";
import type { GlassPanelItem } from "./panel-layout.js";
import type {
  SpatialPointerEvent,
  SpatialPointerSource,
  SpatialPointerTarget,
} from "./spatial-pointer.js";

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
  readonly pointerTargets?: readonly SpatialPointerTarget[];
  readonly onPanelAction: (inputId: string) => void;
  readonly onPointerEvent?: (event: SpatialPointerEvent) => void;
  readonly enablePointerEvents?: boolean;
  readonly onPanelSelection?: (selectionId: string) => void;
  readonly shouldIgnorePointerTarget?: (target: EventTarget | null) => boolean;
  /** Receive the shared action vocabulary for particle-token ray gestures. */
  readonly onSpatialInput?: (action: InputAction) => void;
  readonly onWheel?: (ray: THREE.Ray, deltaY: number) => boolean;
}

interface PanelHit {
  readonly mount: SpatialPanelMount;
  readonly uv: THREE.Vector2;
  readonly inputId: string | null;
  readonly distance: number;
}

interface PointerTargetHit {
  readonly target: SpatialPointerTarget;
  readonly point: THREE.Vector3;
  readonly distance: number;
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
  handleRay(
    ray: THREE.Ray,
    phase: SpatialPanelPhase,
    sourceId?: string,
    source?: SpatialPointerSource,
    gestureMode?: "rotate" | "pan",
    zoomDelta?: number,
  ): boolean;
  dispose(): void;
} {
  const {
    group,
    camera,
    pointerTarget,
    panels,
    pointerTargets = [],
    onPanelAction,
    onPointerEvent,
    enablePointerEvents = true,
    onPanelSelection,
    shouldIgnorePointerTarget,
    onSpatialInput,
    onWheel,
  } = options;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const pressed = new Map<string, PressedPanel>();
  const capturedPointerIds = new Set<number>();
  const particleDrags = new Map<string, string>();
  const hoveredTargets = new Map<string, SpatialPointerTarget>();
  const hoveredTargetSources = new Map<string, SpatialPointerSource>();
  const hoveredTargetCounts = new Map<SpatialPointerTarget, number>();
  const pressedTargets = new Map<string, SpatialPointerTarget>();
  const pressedTargetSources = new Map<string, SpatialPointerSource>();
  const collapsed = new Map<GlassPanel, boolean>();
  const panelObjects = panels.map(({ panel }) => panel.object3d);
  const pointerTargetObjects = pointerTargets.map(({ object3d }) => object3d);
  const pointerTargetsById = new Map(pointerTargets.map((target) => [target.id, target]));
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
      panelObjects,
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
      distance: intersection.distance,
    };
  };

  const targetForRay = (ray: THREE.Ray): PointerTargetHit | null => {
    if (pointerTargets.length === 0) return null;
    raycaster.ray.copy(ray);
    const intersection = raycaster.intersectObjects(
      pointerTargetObjects,
      false,
    )[0];
    if (!intersection) return null;
    const target = pointerTargets.find((candidate) => candidate.object3d === intersection.object);
    return target
      ? { target, point: intersection.point, distance: intersection.distance }
      : null;
  };

  const dispatchPointerEvent = (
    targetId: string,
    type: SpatialPointerEvent["type"],
    sourceId: string,
    source: SpatialPointerSource,
    value?: number,
    cancelled?: boolean,
    context?: Pick<SpatialPointerEvent,
      "point" | "ray" | "button" | "shiftKey" | "clientX" | "clientY" | "gestureMode" | "zoomDelta">,
  ): void => {
    const event = {
      type,
      targetId,
      sourceId,
      source,
      ...(value === undefined ? {} : { value }),
      ...(cancelled === undefined ? {} : { cancelled }),
      ...context,
    } satisfies SpatialPointerEvent;
    pointerTargetsById.get(targetId)?.onPointerEvent?.(event);
    onPointerEvent?.(event);
  };

  const updateTargetHover = (
    sourceId: string,
    source: SpatialPointerSource,
    next: SpatialPointerTarget | null,
    context?: Pick<SpatialPointerEvent,
      "point" | "ray" | "button" | "shiftKey" | "clientX" | "clientY" | "gestureMode" | "zoomDelta">,
  ): void => {
    const previous = hoveredTargets.get(sourceId) ?? null;
    if (previous === next) return;
    if (previous) {
      dispatchPointerEvent(previous.id, "leave", sourceId, source, undefined, undefined, context);
      const remainingHovers = (hoveredTargetCounts.get(previous) ?? 1) - 1;
      if (remainingHovers <= 0) {
        hoveredTargetCounts.delete(previous);
        previous.setState({ hover: false });
      } else {
        hoveredTargetCounts.set(previous, remainingHovers);
      }
      hoveredTargets.delete(sourceId);
      hoveredTargetSources.delete(sourceId);
    }
    if (next) {
      hoveredTargets.set(sourceId, next);
      hoveredTargetSources.set(sourceId, source);
      hoveredTargetCounts.set(next, (hoveredTargetCounts.get(next) ?? 0) + 1);
      next.setState({ hover: true });
      dispatchPointerEvent(next.id, "enter", sourceId, source, undefined, undefined, context);
    }
  };

  const routePointerTarget = (
    hit: PointerTargetHit | null,
    phase: SpatialPanelPhase,
    sourceId: string,
    source: SpatialPointerSource,
    ray: THREE.Ray,
    pointerEvent?: PointerEvent,
    gestureMode?: "rotate" | "pan",
    zoomDelta?: number,
  ): boolean => {
    const target = hit?.target ?? null;
    const context = {
      ...(hit ? { point: { x: hit.point.x, y: hit.point.y, z: hit.point.z } } : {}),
      ray,
      ...(pointerEvent ? {
        button: pointerEvent.button,
        shiftKey: pointerEvent.shiftKey,
        clientX: pointerEvent.clientX,
        clientY: pointerEvent.clientY,
      } : {}),
      ...(gestureMode ? { gestureMode } : {}),
      ...(zoomDelta === undefined ? {} : { zoomDelta }),
    } satisfies Pick<SpatialPointerEvent,
      "point" | "ray" | "button" | "shiftKey" | "clientX" | "clientY" | "gestureMode" | "zoomDelta">;
    updateTargetHover(sourceId, source, phase === "cancel" ? null : target, context);
    const previous = pressedTargets.get(sourceId) ?? null;
    if (phase === "move") {
      if (previous) {
        previous.setState({ dragging: true });
        dispatchPointerEvent(
          previous.id,
          "drag",
          sourceId,
          source,
          previous.getPointerValue?.(ray) ?? undefined,
          undefined,
          context,
        );
        const particle = particleDrags.get(sourceId);
        if (particle) dispatchParticleDrag("move", particle, sourceId, ray);
        return true;
      }
      if (target) {
        dispatchPointerEvent(
          target.id,
          "move",
          sourceId,
          source,
          target.getPointerValue?.(ray) ?? undefined,
          undefined,
          context,
        );
      }
      return target !== null;
    }
    if (phase === "down") {
      if (!target) return false;
      if (target.disabled) return true;
      pressedTargets.set(sourceId, target);
      target.setState({ pressed: true });
      const particle = particleForToken(target.id);
      if (particle) {
        particleDrags.set(sourceId, particle);
        dispatchParticleDrag("down", particle, sourceId, ray);
      }
      dispatchPointerEvent(
        target.id,
        "down",
        sourceId,
        source,
        target.getPointerValue?.(ray) ?? undefined,
        undefined,
        context,
      );
      pressedTargetSources.set(sourceId, source);
      return true;
    }
    if (phase === "up") {
      if (!previous) return target !== null;
      previous.setState({ pressed: false, dragging: false });
      dispatchPointerEvent(
        previous.id,
        "up",
        sourceId,
        source,
        previous.getPointerValue?.(ray) ?? undefined,
        undefined,
        context,
      );
      pressedTargets.delete(sourceId);
      pressedTargetSources.delete(sourceId);
      const particle = particleDrags.get(sourceId);
      if (particle) {
        dispatchParticleDrag("up", particle, sourceId, ray);
        particleDrags.delete(sourceId);
      } else if (previous === target && !previous.disabled) {
        dispatchPointerEvent(previous.id, "click", sourceId, source, undefined, undefined, context);
      }
      return true;
    }
    if (previous) {
      previous.setState({ pressed: false, dragging: false });
      dispatchPointerEvent(
        previous.id,
        "up",
        sourceId,
        source,
        previous.getPointerValue?.(ray) ?? undefined,
        true,
        context,
      );
      const particle = particleDrags.get(sourceId);
      if (particle) {
        dispatchParticleDrag("cancel", particle, sourceId, ray);
        particleDrags.delete(sourceId);
      }
      pressedTargets.delete(sourceId);
      pressedTargetSources.delete(sourceId);
      return true;
    }
    return target !== null;
  };

  const updateHover = (
    next: PanelHit | null,
    sourceId: string,
    source: SpatialPointerSource,
  ): void => {
    if (hovered?.mount === next?.mount && hovered?.inputId === next?.inputId) return;
    if (hovered) {
      dispatchPointerEvent(
        hovered.inputId ?? hovered.mount.panel.object3d.name,
        "leave",
        sourceId,
        source,
      );
    }
    hovered?.mount.panel.update({ hoveredInputId: null });
    hovered = next;
    hovered?.mount.panel.update({ hoveredInputId: hovered.inputId });
    if (hovered) {
      dispatchPointerEvent(
        hovered.inputId ?? hovered.mount.panel.object3d.name,
        "enter",
        sourceId,
        source,
      );
    }
  };

  const routeHit = (
    hit: PanelHit | null,
    phase: SpatialPanelPhase,
    sourceId: string,
    source: SpatialPointerSource,
    atomPicker: () => void,
  ): boolean => {
    const consumed = consumeSpatialPanelHit(
      hit !== null,
      null,
      () => undefined,
      atomPicker,
    );
    if (!hit) {
      if (phase === "move") {
        updateHover(null, sourceId, source);
        const activePress = pressed.get(sourceId);
        if (activePress?.inputId) {
          dispatchPointerEvent(activePress.inputId, "drag", sourceId, source);
        }
      }
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
      updateHover(hit, sourceId, source);
      const activePress = pressed.get(sourceId);
      if (activePress?.inputId) {
        dispatchPointerEvent(activePress.inputId, "drag", sourceId, source);
      }
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
      if (hit.inputId) dispatchPointerEvent(hit.inputId, "down", sourceId, source);
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
        dispatchPointerEvent(hit.inputId, "up", sourceId, source);
        dispatchPointerEvent(hit.inputId, "click", sourceId, source);
        onPanelAction(hit.inputId);
      } else if (previous?.inputId) {
        dispatchPointerEvent(previous.inputId, "up", sourceId, source);
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
      const activePress = pressed.get(sourceId);
      if (activePress?.inputId) dispatchPointerEvent(activePress.inputId, "up", sourceId, source);
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

  const screenRay = (event: Pick<MouseEvent, "clientX" | "clientY">): THREE.Ray | null => {
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
    const sourceId = `pointer:${event.pointerId}`;
    const source: SpatialPointerSource = event.pointerType === "touch"
      ? "touch"
      : event.pointerType === "pen"
        ? "pen"
        : "mouse";
    const targetHit = targetForRay(ray);
    const panelHit = panelForRay(ray);
    const captured = pressedTargets.has(sourceId);
    const targetWins = captured ||
      (targetHit !== null && (!panelHit || targetHit.distance <= panelHit.distance));
    const targetConsumed = routePointerTarget(
      targetWins ? targetHit : null,
      phase,
      sourceId,
      source,
      ray,
      event,
    );
    if (targetConsumed) {
      if (phase === "down" && "setPointerCapture" in pointerTarget) {
        pointerTarget.setPointerCapture(event.pointerId);
        capturedPointerIds.add(event.pointerId);
      }
      if (phase === "up" || phase === "cancel") releaseCapturedPointer(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return;
    }
    const consumed = routeHit(panelHit, phase, sourceId, source, () => undefined);
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
  const handleWheel = (event: WheelEvent): void => {
    if (shouldIgnorePointerTarget?.(event.target)) return;
    const ray = screenRay(event);
    if (!ray) return;
    const targetHit = targetForRay(ray);
    const panelHit = panelForRay(ray);
    if (
      targetHit?.target.id === "model-stage" &&
      (!panelHit || targetHit.distance <= panelHit.distance) &&
      onWheel?.(ray, event.deltaY)
    ) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
  };
  const onContextMenu = (event: MouseEvent): void => {
    const ray = screenRay(event);
    if (ray && targetForRay(ray)?.target.id === "model-stage") event.preventDefault();
  };

  const setPointerEventsEnabled = (enabled: boolean): void => {
    if (disposed || pointerEventsEnabled === enabled) return;
    pointerEventsEnabled = enabled;
    if (!enabled) {
      for (const pointerId of capturedPointerIds) {
        const sourceId = `pointer:${pointerId}`;
        clearPressed(sourceId);
        const target = pressedTargets.get(sourceId);
        if (target) {
          target.setState({ pressed: false, dragging: false });
          dispatchPointerEvent(
            target.id,
            "up",
            sourceId,
            pressedTargetSources.get(sourceId) ?? "mouse",
            undefined,
            true,
          );
          pressedTargets.delete(sourceId);
          pressedTargetSources.delete(sourceId);
        }
        const particle = particleDrags.get(sourceId);
        if (particle) {
          dispatchParticleDrag("cancel", particle, sourceId, new THREE.Ray());
          particleDrags.delete(sourceId);
        }
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
      pointerTarget.addEventListener("wheel", handleWheel, { capture: true, passive: false });
      pointerTarget.addEventListener("contextmenu", onContextMenu, true);
    } else {
      pointerTarget.removeEventListener("pointermove", onPointerMove, true);
      pointerTarget.removeEventListener("pointerdown", onPointerDown, true);
      pointerTarget.removeEventListener("pointerup", onPointerUp, true);
      pointerTarget.removeEventListener("pointercancel", onPointerCancel, true);
      pointerTarget.removeEventListener("wheel", handleWheel, true);
      pointerTarget.removeEventListener("contextmenu", onContextMenu, true);
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
    handleRay(ray, phase, sourceId = "xr:primary", source = "xr", gestureMode, zoomDelta) {
      if (disposed) return false;
      const targetHit = targetForRay(ray);
      const panelHit = panelForRay(ray);
      const captured = pressedTargets.has(sourceId);
      const targetWins = captured ||
        (targetHit !== null && (!panelHit || targetHit.distance <= panelHit.distance));
      const targetConsumed = routePointerTarget(
        targetWins ? targetHit : null,
        phase,
        sourceId,
        source,
        ray,
        undefined,
        gestureMode,
        zoomDelta,
      );
      if (targetConsumed) return true;
      return routeHit(panelHit, phase, sourceId, source, () => undefined);
    },
    dispose() {
      if (disposed) return;
      for (const [sourceId, particle] of particleDrags) {
        dispatchParticleDrag("cancel", particle, sourceId, new THREE.Ray());
      }
      particleDrags.clear();
      for (const [sourceId, target] of pressedTargets) {
        target.setState({ pressed: false, dragging: false });
        dispatchPointerEvent(
          target.id,
          "up",
          sourceId,
          pressedTargetSources.get(sourceId) ?? "xr",
          undefined,
          true,
        );
      }
      pressedTargets.clear();
      pressedTargetSources.clear();
      for (const [sourceId, target] of hoveredTargets) {
        target.setState({ hover: false });
        dispatchPointerEvent(target.id, "leave", sourceId, hoveredTargetSources.get(sourceId) ?? "xr");
      }
      hoveredTargets.clear();
      hoveredTargetSources.clear();
      hoveredTargetCounts.clear();
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
