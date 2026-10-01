import {
  mapConfirmCommand,
  mapBack,
  mapPointerSample,
  mapScaleDelta,
  type InputAction,
  type PointerGesture,
} from "./input-mapping.js";

/** Configuration for translating browser pointer events into engine actions. */
export interface ScreenInputOptions {
  readonly root: HTMLElement;
  readonly dispatch: (action: InputAction) => void;
  readonly pickTarget: (
    clientX: number,
    clientY: number,
    source?: string,
    pointerType?: string,
  ) => string | null;
  readonly onDragEnd?: () => void;
}

/**
 * Adapt mouse, pen, and touch pointer events to the device-independent action
 * vocabulary. Modules receive actions and never inspect browser events.
 */
export class ScreenInputAdapter {
  private gesture: PointerGesture | null = null;
  private readonly pointerPositions = new Map<number, { x: number; y: number }>();
  private pinchDistance: number | null = null;
  private readonly root: HTMLElement;
  private readonly dispatch: ScreenInputOptions["dispatch"];
  private readonly pickTarget: ScreenInputOptions["pickTarget"];
  private readonly onDragEnd: ScreenInputOptions["onDragEnd"];

  /** Attach delegated screen input listeners to a module root. */
  constructor(options: ScreenInputOptions) {
    this.root = options.root;
    this.dispatch = options.dispatch;
    this.pickTarget = options.pickTarget;
    this.onDragEnd = options.onDragEnd;
    this.root.addEventListener("pointerdown", this.onPointerDown);
    this.root.addEventListener("pointermove", this.onPointerMove);
    this.root.addEventListener("pointerup", this.onPointerUp);
    this.root.addEventListener("pointercancel", this.onPointerCancel);
    this.root.addEventListener("click", this.onClick);
    this.root.addEventListener("wheel", this.onWheel, { passive: false });
    this.root.addEventListener("keydown", this.onKeyDown);
  }

  /** Remove all browser listeners owned by this adapter. */
  dispose(): void {
    this.root.removeEventListener("pointerdown", this.onPointerDown);
    this.root.removeEventListener("pointermove", this.onPointerMove);
    this.root.removeEventListener("pointerup", this.onPointerUp);
    this.root.removeEventListener("pointercancel", this.onPointerCancel);
    this.root.removeEventListener("click", this.onClick);
    this.root.removeEventListener("wheel", this.onWheel);
    this.root.removeEventListener("keydown", this.onKeyDown);
    this.gesture = null;
    this.pointerPositions.clear();
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if ((event.target as Element | null)?.closest("[data-command], .narration-controls, [data-dev-events-action]")) {
      return;
    }
    this.pointerPositions.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (event.pointerType === "touch" && this.gesture?.mode === "drag" && this.pointerPositions.size > 1) {
      event.preventDefault();
      return;
    }
    if (event.pointerType === "touch" && this.pointerPositions.size === 2 && this.gesture?.mode !== "drag") {
      this.gesture = null;
      this.pinchDistance = distanceBetweenPointers(this.pointerPositions);
      this.root.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }
    const trayParticle = (event.target as Element | null)?.closest<HTMLElement>("[data-particle]")
      ?.dataset.particle;
    const target = trayParticle
      ? `tray:${trayParticle}`
      : this.pickTarget(event.clientX, event.clientY);
    const result = mapPointerSample({
      phase: "down",
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      target,
    }, this.gesture);
    this.gesture = result.gesture;
    this.emit(result.actions);
    if (this.gesture) {
      this.root.setPointerCapture(event.pointerId);
      event.preventDefault();
    }
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (this.pointerPositions.has(event.pointerId)) {
      this.pointerPositions.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (event.pointerType === "touch" && this.pointerPositions.size >= 2 && this.pinchDistance !== null) {
      const nextDistance = distanceBetweenPointers(this.pointerPositions);
      if (Math.abs(nextDistance - this.pinchDistance) >= 3) {
        this.dispatch(mapScaleDelta(nextDistance > this.pinchDistance ? -1 : 1));
        this.pinchDistance = nextDistance;
      }
      event.preventDefault();
      return;
    }
    const target = !this.gesture || this.gesture.mode === "drag"
      ? this.pickTarget(
          event.clientX,
          event.clientY,
          this.gesture?.source ?? undefined,
          event.pointerType,
        )
      : null;
    const result = mapPointerSample({
      phase: "move",
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      target,
    }, this.gesture);
    this.gesture = result.gesture;
    this.emit(result.actions);
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    const endedDrag = this.gesture?.mode === "drag" && this.gesture.pointerId === event.pointerId;
    this.pointerPositions.delete(event.pointerId);
    if (this.pointerPositions.size < 2) {
      this.pinchDistance = null;
    }
    const target = this.gesture?.mode === "drag"
      ? this.pickTarget(event.clientX, event.clientY, this.gesture.source ?? undefined, event.pointerType)
      : null;
    const result = mapPointerSample({
      phase: "up",
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      target,
    }, this.gesture);
    this.gesture = result.gesture;
    this.emit(result.actions);
    if (endedDrag) {
      this.onDragEnd?.();
    }
    if (this.root.hasPointerCapture(event.pointerId)) {
      this.root.releasePointerCapture(event.pointerId);
    }
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    const endedDrag = this.gesture?.mode === "drag" && this.gesture.pointerId === event.pointerId;
    this.pointerPositions.delete(event.pointerId);
    this.pinchDistance = null;
    const result = mapPointerSample({
      phase: "cancel",
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      target: null,
    }, this.gesture);
    this.gesture = result.gesture;
    this.emit(result.actions);
    if (endedDrag) {
      this.onDragEnd?.();
    }
  };

  private readonly onClick = (event: MouseEvent): void => {
    const button = (event.target as Element | null)?.closest<HTMLElement>("[data-command]");
    const command = button?.dataset.command;
    if (command) {
      this.dispatch(mapConfirmCommand(command));
    }
  };

  private readonly onWheel = (event: WheelEvent): void => {
    if ((event.target as Element | null)?.closest("button, select")) {
      return;
    }
    event.preventDefault();
    this.dispatch(mapScaleDelta(Math.sign(event.deltaY)));
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      this.dispatch(mapBack());
    }
  };

  private emit(actions: readonly InputAction[]): void {
    for (const action of actions) {
      this.dispatch(action);
    }
  }
}

function distanceBetweenPointers(pointers: ReadonlyMap<number, { x: number; y: number }>): number {
  const [first, second] = [...pointers.values()];
  if (!first || !second) {
    return 0;
  }
  return Math.hypot(first.x - second.x, first.y - second.y);
}