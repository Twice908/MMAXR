import type { DeepReadonly, EngineAction, JsonValue, Reducer } from "@mma/engine-core";
import {
  imageOfPoint,
  PlaneMirror,
  reflectRay,
  tracePlanePath,
  type Vec2,
} from "@mma/kit-physics-optics";

export const MIN_SOURCE_DISTANCE = 1;
export const MAX_SOURCE_DISTANCE = 2.6;

export interface PlaneMirrorState {
  readonly sourceDistance: number;
}

export interface PlaneMirrorSceneModel {
  readonly mirror: PlaneMirror;
  readonly object: Vec2;
  readonly eye: Vec2;
  readonly image: Vec2;
  readonly hit: Vec2;
  readonly normal: Vec2;
  readonly reflectedDirection: Vec2;
  readonly angleOfIncidence: number;
  readonly angleOfReflection: number;
}

/** Create the deterministic initial source position for the plane-mirror scene. */
export function createPlaneMirrorState(): PlaneMirrorState {
  return { sourceDistance: 1.8 };
}

/** Reduce source movement actions to a bounded, serializable scene state. */
export function createPlaneMirrorReducer(): Reducer<PlaneMirrorState, EngineAction> {
  return (state: DeepReadonly<PlaneMirrorState>, action: Readonly<EngineAction>) => {
    if (action.type !== "object/move" || !isRecord(action.payload)) {
      return { sourceDistance: state.sourceDistance };
    }
    const distance = action.payload.distance;
    if (typeof distance !== "number" || !Number.isFinite(distance)) {
      return { sourceDistance: state.sourceDistance };
    }
    return {
      sourceDistance: Math.min(MAX_SOURCE_DISTANCE, Math.max(MIN_SOURCE_DISTANCE, distance)),
    };
  };
}

function isRecord(value: JsonValue): value is { readonly [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Derive the visible ray path, reflection angles, and virtual image from the optics kit. */
export function derivePlaneMirrorScene(state: DeepReadonly<PlaneMirrorState>): PlaneMirrorSceneModel {
  const mirror = new PlaneMirror({ x: 0, y: -2.5 }, { x: 0, y: 2.5 });
  const object = { x: -state.sourceDistance, y: 0.8 };
  const eye = { x: -2.1, y: -1.2 };
  const path = tracePlanePath(object, mirror, eye);
  if (path.status !== "ok") {
    throw new Error(`Plane-mirror ray path is not visible: ${path.reason}`);
  }

  const hit = path.hits[0];
  if (!hit) {
    throw new Error("Plane-mirror ray path did not contain a reflection point.");
  }
  const incidentDirection = {
    x: hit.point.x - object.x,
    y: hit.point.y - object.y,
  };
  const reflection = reflectRay({ origin: object, direction: incidentDirection }, mirror);
  if (!reflection) {
    throw new Error("The incident ray did not intersect the plane mirror.");
  }
  const image = imageOfPoint(object, mirror).point;

  return {
    mirror,
    object,
    eye,
    image,
    hit: hit.point,
    normal: reflection.hit.normal,
    reflectedDirection: reflection.reflectedRay.direction,
    angleOfIncidence: reflection.angleOfIncidence,
    angleOfReflection: reflection.angleOfReflection,
  };
}
