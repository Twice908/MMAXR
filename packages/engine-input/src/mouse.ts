import { PointerAdapterBase, type PointerAdapterOptions } from "./pointer-base.js";

export interface MouseInputOptions extends PointerAdapterOptions {
  rotateSensitivity?: number;
  wheelScaleSensitivity?: number;
}

export class MouseInputAdapter extends PointerAdapterBase {
  private readonly rotateSensitivity: number;
  private readonly wheelScaleSensitivity: number;
  private active = false;
  private target: string | null = null;
  private traySource: string | null = null;
  private x = 0;
  private y = 0;

  constructor(options: MouseInputOptions) {
    super(options);
    this.rotateSensitivity = options.rotateSensitivity ?? 0.01;
    this.wheelScaleSensitivity = options.wheelScaleSensitivity ?? 0.001;

    this.root.addEventListener("mousedown", this.onDown);
    this.root.addEventListener("mousemove", this.onMove);
    this.root.addEventListener("mouseup", this.onUp);
    this.root.addEventListener("mouseleave", this.onLeave);
    this.root.addEventListener("wheel", this.onWheel, { passive: false });
    this.root.addEventListener("contextmenu", this.onContextMenu);
  }

  override dispose(): void {
    this.root.removeEventListener("mousedown", this.onDown);
    this.root.removeEventListener("mousemove", this.onMove);
    this.root.removeEventListener("mouseup", this.onUp);
    this.root.removeEventListener("mouseleave", this.onLeave);
    this.root.removeEventListener("wheel", this.onWheel);
    this.root.removeEventListener("contextmenu", this.onContextMenu);
    super.dispose();
  }

  private readonly onDown = (event: MouseEvent): void => {
    if (event.button !== 0) return;
    this.active = true;
    this.x = event.clientX;
    this.y = event.clientY;
    this.traySource = this.traySourceFor(event.target);
    this.target = this.pickTarget(
      event.clientX,
      event.clientY,
      this.traySource ?? undefined,
      "mouse",
    );

    if (this.traySource) {
      this.dispatcher.emit({
        type: "grab",
        payload: {
          source: this.traySource,
          target: this.target,
          x: this.x,
          y: this.y,
        },
      });
      return;
    }

    if (this.target) {
      this.dispatcher.emit({
        type: "select",
        payload: { source: "mouse", target: this.target, x: this.x, y: this.y },
      });
    }

  };

  private readonly onMove = (event: MouseEvent): void => {
    const target = this.pickTarget(
      event.clientX,
      event.clientY,
      this.traySource ?? undefined,
      "mouse",
    );
    if (!this.active) {
      if (target) {
        this.dispatcher.emit({
          type: "hover",
          payload: { source: "mouse", target, x: event.clientX, y: event.clientY },
        });
      }
      return;
    }

    const dx = event.clientX - this.x;
    const dy = event.clientY - this.y;
    this.x = event.clientX;
    this.y = event.clientY;

    if (this.traySource) {
      this.target = target;
      this.dispatcher.emit({
        type: "move",
        payload: {
          source: this.traySource,
          target,
          x: event.clientX,
          y: event.clientY,
          deltaX: dx,
          deltaY: dy,
        },
      });
      return;
    }

    if (this.target) {
      this.dispatcher.emit({
        type: "move",
        payload: {
          source: "mouse",
          target: this.target,
          x: event.clientX,
          y: event.clientY,
          deltaX: dx,
          deltaY: dy,
        },
      });
    } else {
      this.dispatcher.emit({
        type: "rotate",
        payload: {
          source: "mouse",
          deltaX: dx * this.rotateSensitivity,
          deltaY: dy * this.rotateSensitivity,
        },
      });
    }
  };

  private readonly onUp = (event: MouseEvent): void => {
    if (event.button !== 0) return;
    if (this.traySource) {
      const target = this.pickTarget(
        event.clientX,
        event.clientY,
        this.traySource,
        "mouse",
      );
      this.dispatcher.emit({
        type: "release",
        payload: {
          source: this.traySource,
          target,
          x: event.clientX,
          y: event.clientY,
        },
      });
    } else if (this.target) {
      this.dispatcher.emit({
        type: "release",
        payload: { source: "mouse", target: this.target, x: event.clientX, y: event.clientY },
      });
    }
    this.active = false;
    this.target = null;
    this.traySource = null;
  };

  private readonly onLeave = (): void => {
    if (this.active && this.traySource) {
      this.dispatcher.emit({
        type: "release",
        payload: { source: this.traySource, target: null, cancelled: true },
      });
    } else if (this.active && this.target) {
      this.dispatcher.emit({
        type: "release",
        payload: { source: "mouse", target: this.target, cancelled: true },
      });
    }
    this.active = false;
    this.target = null;
    this.traySource = null;
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.dispatcher.emit({
      type: "scale",
      payload: {
        source: "mouse",
        delta: event.deltaY * this.wheelScaleSensitivity,
      },
    });
  };

  private readonly onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };
}
