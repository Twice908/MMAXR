import { PointerAdapterBase, type PointerAdapterOptions } from "./pointer-base.js";
import { distance2D } from "./utils.js";

export interface TouchInputOptions extends PointerAdapterOptions {
  pinchSensitivity?: number;
  dragThresholdPx?: number;
}

export class TouchInputAdapter extends PointerAdapterBase {
  private readonly pinchSensitivity: number;
  private readonly dragThresholdPx: number;
  private readonly touches = new Map<number, { x: number; y: number }>();
  private activeTarget: string | null = null;
  private activePointerId: number | null = null;
  private traySource: string | null = null;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragging = false;
  private pinchDistance: number | null = null;

  constructor(options: TouchInputOptions) {
    super(options);
    this.pinchSensitivity = options.pinchSensitivity ?? 0.008;
    this.dragThresholdPx = options.dragThresholdPx ?? 4;

    this.root.addEventListener("pointerdown", this.onDown, { passive: false });
    this.root.addEventListener("pointermove", this.onMove, { passive: false });
    this.root.addEventListener("pointerup", this.onUp, { passive: false });
    this.root.addEventListener("pointercancel", this.onCancel, { passive: false });
  }

  override dispose(): void {
    this.root.removeEventListener("pointerdown", this.onDown);
    this.root.removeEventListener("pointermove", this.onMove);
    this.root.removeEventListener("pointerup", this.onUp);
    this.root.removeEventListener("pointercancel", this.onCancel);
    this.touches.clear();
    this.activeTarget = null;
    this.activePointerId = null;
    this.traySource = null;
    this.dragStartX = 0;
    this.dragStartY = 0;
    super.dispose();
  }

  private readonly onDown = (event: PointerEvent): void => {
    if (event.pointerType !== "touch") return;

    this.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.touches.size === 1) {
      this.activePointerId = event.pointerId;
      this.dragStartX = event.clientX;
      this.dragStartY = event.clientY;
      this.traySource = this.traySourceFor(event.target);
      this.activeTarget = this.pickTarget(
        event.clientX,
        event.clientY,
        this.traySource ?? undefined,
        "touch",
      );
      this.dragging = false;
      if (this.traySource) {
        this.dispatcher.emit({
          type: "grab",
          payload: {
            source: this.traySource,
            target: this.activeTarget,
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
          },
        });
      } else if (this.activeTarget) {
        this.dispatcher.emit({
          type: "select",
          payload: { source: "touch", target: this.activeTarget, pointerId: event.pointerId },
        });
      }
      this.root.setPointerCapture(event.pointerId);
    } else if (this.touches.size === 2) {
      this.pinchDistance = this.currentPinchDistance();
      this.dragging = false;
      event.preventDefault();
    }
  };

  private readonly onMove = (event: PointerEvent): void => {
    if (event.pointerType !== "touch" || !this.touches.has(event.pointerId)) return;
    const previous = this.touches.get(event.pointerId)!;
    this.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.touches.size >= 2 && this.pinchDistance !== null) {
      const next = this.currentPinchDistance();
      const delta = next - this.pinchDistance;
      if (Math.abs(delta) >= 1) {
        this.dispatcher.emit({
          type: "scale",
          payload: {
            source: "touch",
            delta: -delta * this.pinchSensitivity,
            distance: next,
          },
        });
        this.pinchDistance = next;
      }
      event.preventDefault();
      return;
    }

    if (event.pointerId !== this.activePointerId) return;

    if (this.traySource) {
      const target = this.pickTarget(event.clientX, event.clientY, this.traySource, "touch");
      this.activeTarget = target;
      const moved = Math.hypot(event.clientX - this.dragStartX, event.clientY - this.dragStartY);
      if (moved >= this.dragThresholdPx) this.dragging = true;
      if (this.dragging) {
        this.dispatcher.emit({
          type: "move",
          payload: {
            source: this.traySource,
            target,
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
          },
        });
        event.preventDefault();
      }
      return;
    }

    const moved = Math.hypot(event.clientX - this.dragStartX, event.clientY - this.dragStartY);
    if (moved >= this.dragThresholdPx) this.dragging = true;

    if (this.dragging) {
      this.dispatcher.emit({
        type: "rotate",
        payload: {
          source: "touch",
          deltaX: event.clientX - previous.x,
          deltaY: event.clientY - previous.y,
        },
      });
      event.preventDefault();
    }
  };

  private readonly onUp = (event: PointerEvent): void => {
    if (event.pointerType !== "touch") return;
    const wasActive = event.pointerId === this.activePointerId;
    this.touches.delete(event.pointerId);

    if (this.touches.size < 2) this.pinchDistance = null;

    if (wasActive && this.traySource) {
      const target = this.pickTarget(event.clientX, event.clientY, this.traySource, "touch");
      this.dispatcher.emit({
        type: "release",
        payload: {
          source: this.traySource,
          target,
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
        },
      });
    } else if (wasActive && this.activeTarget) {
      this.dispatcher.emit({
        type: "release",
        payload: {
          source: "touch",
          target: this.activeTarget,
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
        },
      });
    }

    if (wasActive) {
      this.activePointerId = null;
      this.activeTarget = null;
      this.traySource = null;
      this.dragStartX = 0;
      this.dragStartY = 0;
      this.dragging = false;
    }

    if (this.root.hasPointerCapture(event.pointerId)) {
      this.root.releasePointerCapture(event.pointerId);
    }
  };

  private readonly onCancel = (event: PointerEvent): void => {
    if (event.pointerType !== "touch") return;
    const target = this.activeTarget;
    const traySource = this.traySource;
    this.touches.delete(event.pointerId);
    if (traySource) {
      this.dispatcher.emit({
        type: "release",
        payload: { source: traySource, target: null, pointerId: event.pointerId, cancelled: true },
      });
    } else if (target) {
      this.dispatcher.emit({
        type: "release",
        payload: { source: "touch", target, pointerId: event.pointerId, cancelled: true },
      });
    }
    this.activePointerId = null;
    this.activeTarget = null;
    this.traySource = null;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.dragging = false;
    this.pinchDistance = null;
  };

  private currentPinchDistance(): number {
    const values = [...this.touches.values()];
    if (values.length < 2) return 0;
    return distance2D(values[0]!, values[1]!);
  }
}
