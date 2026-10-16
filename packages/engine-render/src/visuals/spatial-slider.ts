import * as THREE from "three";
import { PANEL_LIMITS, dpToMeters, xrTokens } from "../xr-tokens.js";
import {
  createGlassSurface,
  disposeGlassSurface,
  setGlassSurfaceState,
} from "./glass-material.js";
import { createSpatialText } from "./spatial-primitives.js";
import type { SpatialPointerTarget } from "./spatial-pointer.js";

export type SpatialSliderOrientation = "horizontal" | "vertical";

export interface SpatialSliderOptions {
  readonly id: string;
  readonly label: string;
  readonly orientation: SpatialSliderOrientation;
  readonly min: number;
  readonly max: number;
  readonly value: number;
  readonly disabled?: boolean;
  readonly onChange?: (value: number) => void;
}

export interface SpatialSlider {
  readonly object3d: THREE.Group;
  readonly pointerTargets: readonly SpatialPointerTarget[];
  readonly target: SpatialPointerTarget;
  readonly widthDp: number;
  readonly heightDp: number;
  readonly value: number;
  setValue(value: number): void;
  setDisabled(disabled: boolean): void;
  dispose(): void;
}

/** Map a pointer fraction to a clamped slider value. */
export function spatialSliderValueFromFraction(
  fraction: number,
  min: number,
  max: number,
): number {
  if (![fraction, min, max].every(Number.isFinite) || min >= max) {
    throw new RangeError("Slider fraction and range must be finite with increasing bounds.");
  }
  return min + THREE.MathUtils.clamp(fraction, 0, 1) * (max - min);
}

/** Expand the perpendicular hit dimension to 48 dp at the smallest group scale. */
export function spatialSliderHitAreaSizeDp(
  orientation: SpatialSliderOrientation,
  lengthDp: number,
  thicknessDp: number,
  minimumGroupScale = PANEL_LIMITS.scale.min,
): Readonly<{ widthDp: number; heightDp: number }> {
  if (![lengthDp, thicknessDp, minimumGroupScale]
    .every((value) => Number.isFinite(value) && value > 0)) {
    throw new RangeError("Slider hit dimensions and group scale must be finite and positive.");
  }
  const crossDp = Math.max(thicknessDp, xrTokens.sizesDp.targetMin / minimumGroupScale);
  return orientation === "horizontal"
    ? { widthDp: lengthDp, heightDp: crossDp }
    : { widthDp: crossDp, heightDp: lengthDp };
}

/** Build a glass range control whose padded target remains usable at minimum group scale. */
export function createSpatialSlider(options: SpatialSliderOptions): SpatialSlider {
  if (!options.id || !options.label ||
    !Number.isFinite(options.min) || !Number.isFinite(options.max) ||
    !Number.isFinite(options.value) || options.min >= options.max ||
    options.value < options.min || options.value > options.max) {
    throw new RangeError("Slider requires a label and a value within finite, increasing bounds.");
  }

  const { orientation } = options;
  const lengthDp = xrTokens.sizesDp.sliderTrack.length;
  const thicknessDp = xrTokens.sizesDp.sliderTrack.thickness;
  const thumbLongDp = xrTokens.sizesDp.sliderThumb.width;
  const thumbShortDp = xrTokens.sizesDp.sliderThumb.height;
  const trackLengthM = dpToMeters(lengthDp);
  const trackThicknessM = dpToMeters(thicknessDp);
  const thumbLongM = dpToMeters(thumbLongDp);
  const thumbShortM = dpToMeters(thumbShortDp);
  const group = new THREE.Group();
  group.name = `spatial-slider-${options.id}`;

  const track = createGlassSurface("sliderTrack", {
    width: orientation === "horizontal" ? trackLengthM : trackThicknessM,
    height: orientation === "horizontal" ? trackThicknessM : trackLengthM,
  });
  track.name = `spatial-slider-track-${options.id}`;
  const thumb = createGlassSurface("sliderThumb", {
    width: orientation === "horizontal" ? thumbLongM : thumbShortM,
    height: orientation === "horizontal" ? thumbShortM : thumbLongM,
  });
  thumb.name = `spatial-slider-thumb-${options.id}`;
  const fill = createGlassSurface("sliderThumb", {
    width: orientation === "horizontal" ? trackLengthM : trackThicknessM,
    height: orientation === "horizontal" ? trackThicknessM : trackLengthM,
  });
  fill.name = `spatial-slider-fill-${options.id}`;
  const hitSizeDp = spatialSliderHitAreaSizeDp(
    orientation,
    lengthDp,
    thicknessDp,
  );
  const hitArea = new THREE.Mesh(
    new THREE.PlaneGeometry(
      dpToMeters(hitSizeDp.widthDp),
      dpToMeters(hitSizeDp.heightDp),
    ),
    new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );
  hitArea.name = `spatial-slider-hit-area-${options.id}`;
  hitArea.renderOrder = -1;
  const label = createSpatialText({ text: options.label, style: "label" });
  const labelPlate = createGlassSurface("pill", {
    width: dpToMeters(label.widthDp + xrTokens.paddingDp.control.horizontal * 2),
    height: dpToMeters(label.heightDp + xrTokens.paddingDp.control.vertical * 2),
  });
  labelPlate.name = `spatial-slider-label-plate-${options.id}`;
  const labelGapM = dpToMeters(xrTokens.gapsDp.inline);
  if (orientation === "horizontal") {
    label.object3d.position.set(
      -dpToMeters(label.widthDp) / 2,
      -(trackThicknessM / 2 + dpToMeters(label.heightDp) / 2 + labelGapM),
      0,
    );
  } else {
    label.object3d.position.set(
      -dpToMeters(label.widthDp) / 2,
      trackLengthM / 2 + dpToMeters(label.heightDp) / 2 + labelGapM,
      0,
    );
  }
  labelPlate.position.set(
    label.object3d.position.x,
    label.object3d.position.y,
    xrTokens.layers.control.zOffsetM,
  );
  group.add(track, fill, thumb, hitArea, labelPlate, label.object3d);

  let value = options.value;
  let disabled = options.disabled ?? false;
  let hovered = false;
  let pressed = false;
  let dragging = false;
  const applyState = (): void => {
    setGlassSurfaceState(thumb, { hover: hovered, pressed, dragging, disabled });
  };
  const setValue = (next: number, notify = true): void => {
    if (!Number.isFinite(next)) throw new RangeError("Slider value must be finite.");
    const clamped = THREE.MathUtils.clamp(next, options.min, options.max);
    const changed = clamped !== value;
    value = clamped;
    const fraction = (value - options.min) / (options.max - options.min);
    const offset = (fraction - 0.5) * trackLengthM;
    fill.scale.set(
      orientation === "horizontal" ? fraction : 1,
      orientation === "vertical" ? fraction : 1,
      1,
    );
    fill.position.set(
      orientation === "horizontal" ? -trackLengthM * (1 - fraction) / 2 : 0,
      orientation === "vertical" ? -trackLengthM * (1 - fraction) / 2 : 0,
      xrTokens.layers.control.zOffsetM,
    );
    fill.visible = fraction > 0;
    thumb.position.set(
      orientation === "horizontal" ? offset : 0,
      orientation === "vertical" ? offset : 0,
      xrTokens.layers.label.zOffsetM,
    );
    if (changed && notify) options.onChange?.(value);
  };

  const target: SpatialPointerTarget = {
    id: options.id,
    object3d: hitArea,
    get disabled() {
      return disabled;
    },
    getPointerValue(ray) {
      hitArea.updateWorldMatrix(true, false);
      const center = hitArea.getWorldPosition(new THREE.Vector3());
      const normal = new THREE.Vector3(0, 0, 1).transformDirection(hitArea.matrixWorld);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, center);
      const worldPoint = ray.intersectPlane(plane, new THREE.Vector3());
      if (!worldPoint) return null;
      const localPoint = hitArea.worldToLocal(worldPoint);
      const coordinate = orientation === "horizontal" ? localPoint.x : localPoint.y;
      return THREE.MathUtils.clamp(coordinate / trackLengthM + 0.5, 0, 1);
    },
    onPointerEvent(event) {
      if (disabled) return;
      if ((event.type === "down" || event.type === "drag") && event.value !== undefined) {
        setValue(spatialSliderValueFromFraction(event.value, options.min, options.max));
      }
      if (event.type === "down") {
        pressed = true;
        dragging = false;
      } else if (event.type === "drag") {
        dragging = true;
      } else if (event.type === "up") {
        pressed = false;
        dragging = false;
      }
      applyState();
    },
    setState(next) {
      hovered = next.hover ?? hovered;
      pressed = next.pressed ?? pressed;
      dragging = next.dragging ?? dragging;
      disabled = next.disabled ?? disabled;
      applyState();
    },
  };

  setValue(options.value, false);
  applyState();
  let disposed = false;
  return {
    object3d: group,
    pointerTargets: [target],
    target,
    widthDp: hitSizeDp.widthDp,
    heightDp: hitSizeDp.heightDp,
    get value() {
      return value;
    },
    setValue(next) {
      setValue(next);
    },
    setDisabled(next) {
      disabled = next;
      applyState();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      label.dispose();
      disposeGlassSurface(labelPlate);
      disposeGlassSurface(fill);
      disposeGlassSurface(track);
      disposeGlassSurface(thumb);
      hitArea.geometry.dispose();
      (hitArea.material as THREE.Material).dispose();
      group.removeFromParent();
    },
  };
}
