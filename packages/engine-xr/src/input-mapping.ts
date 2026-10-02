import type { EngineAction } from "@mma/engine-core";

export interface XrPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Normalized pointer data; callers translate browser and XR events into this shape. */
export interface XrPointerSample {
  readonly phase: "down" | "move" | "up" | "cancel";
  readonly pointerId: number;
  readonly target: string | null;
  readonly targetKind: "grabbable" | "selectable" | null;
  readonly position: XrPoint | null;
}

export interface XrPointerGesture {
  readonly pointerId: number;
  readonly source: string;
  readonly position: XrPoint | null;
}

export interface XrPointerMapping {
  readonly actions: readonly EngineAction[];
  readonly gesture: XrPointerGesture | null;
}

/** Map normalized XR pointer samples to serializable engine actions. */
export function mapXrPointerSample(
  sample: XrPointerSample,
  currentGesture: XrPointerGesture | null,
): XrPointerMapping {
  if (sample.phase === "down") {
    if (sample.targetKind === "grabbable" && sample.target) {
      return {
        actions: [{
          type: "grab",
          payload: { source: sample.target, pointerId: sample.pointerId },
        }],
        gesture: {
          pointerId: sample.pointerId,
          source: sample.target,
          position: sample.position,
        },
      };
    }

    return {
      actions: sample.targetKind === "selectable" && sample.target
        ? [{ type: "select", payload: { target: sample.target } }]
        : [],
      gesture: null,
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
    return sample.position
      ? {
          actions: [{
            type: "move",
            payload: {
              source: currentGesture.source,
              position: {
                x: sample.position.x,
                y: sample.position.y,
                z: sample.position.z,
              },
            },
          }],
          gesture: { ...currentGesture, position: sample.position },
        }
      : { actions: [], gesture: currentGesture };
  }

  if (sample.phase === "up" || sample.phase === "cancel") {
    return {
      actions: [{
        type: "release",
        payload: {
          source: currentGesture.source,
          target: sample.phase === "up" ? sample.target : null,
        },
      }],
      gesture: null,
    };
  }

  return { actions: [], gesture: currentGesture };
}