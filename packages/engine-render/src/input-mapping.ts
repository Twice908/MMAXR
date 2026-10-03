import type { EngineAction } from "@mma/engine-core";

/** Input commands understood by modules, regardless of the physical device. */
export type InputActionType =
  | "hover"
  | "select"
  | "grab"
  | "move"
  | "release"
  | "rotate"
  | "scale"
  | "confirm"
  | "back";

/** Serializable action emitted by a screen input adapter. */
export type InputAction = EngineAction;

/** Normalized pointer information used by the pure screen input mapper. */
export interface PointerSample {
  readonly phase: "down" | "move" | "up" | "cancel";
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
  readonly target: string | null;
}

/** Ongoing pointer gesture, independent of browser event objects. */
export interface PointerGesture {
  readonly pointerId: number;
  readonly mode: "drag" | "orbit";
  readonly source: string | null;
  readonly x: number;
  readonly y: number;
}

/** Result of mapping a normalized pointer sample into module actions. */
export interface PointerMapping {
  readonly actions: readonly InputAction[];
  readonly gesture: PointerGesture | null;
}

/** Map pointer input to the shared action vocabulary without reading the DOM. */
export function mapPointerSample(
  sample: PointerSample,
  currentGesture: PointerGesture | null,
): PointerMapping {
  if (sample.phase === "down") {
    const isTrayItem = sample.target?.startsWith("tray:") ?? false;
    const gesture: PointerGesture = {
      pointerId: sample.pointerId,
      mode: isTrayItem ? "drag" : "orbit",
      source: isTrayItem ? sample.target : null,
      x: sample.x,
      y: sample.y,
    };
    return {
      actions: isTrayItem
        ? [{ type: "grab", payload: { source: sample.target, pointerId: sample.pointerId } }]
        : sample.target
          ? [{ type: "select", payload: { target: sample.target } }]
          : [],
      gesture,
    };
  }

  if (!currentGesture || currentGesture.pointerId !== sample.pointerId) {
    return {
      actions: sample.phase === "move" && sample.target
        ? [{ type: "hover", payload: { target: sample.target } }]
        : [],
      gesture: currentGesture,
    };
  }

  if (sample.phase === "move") {
    const deltaX = sample.x - currentGesture.x;
    const deltaY = sample.y - currentGesture.y;
    return {
      actions: currentGesture.mode === "drag"
        ? [{
            type: "move",
            payload: { source: currentGesture.source, x: sample.x, y: sample.y },
          }]
        : [{ type: "rotate", payload: { deltaX, deltaY } }],
      gesture: { ...currentGesture, x: sample.x, y: sample.y },
    };
  }

  if (sample.phase === "up" && currentGesture.mode === "drag") {
    return {
      actions: [{
        type: "release",
        payload: { source: currentGesture.source, target: sample.target },
      }],
      gesture: null,
    };
  }

  return { actions: [], gesture: null };
}

/** Convert a wheel or pinch distance delta to a scale action. */
export function mapScaleDelta(delta: number): InputAction {
  return { type: "scale", payload: { delta } };
}

/** Convert a labeled DOM command to a confirm action. */
export function mapConfirmCommand(command: string): InputAction {
  return { type: "confirm", payload: { command } };
}

/** Convert a back navigation request to the shared back action. */
export function mapBack(): InputAction {
  return { type: "back", payload: null };
}