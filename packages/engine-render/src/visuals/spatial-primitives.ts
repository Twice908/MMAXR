import * as THREE from "three";
import {
  dpToMeters,
  getXrTextStyle,
  xrTokens,
  type XrTextColorRole,
  type XrTextStyle,
} from "../xr-tokens.js";
import {
  createGlassSurface,
  disposeGlassSurface,
  setGlassSurfaceState,
  type GlassSurfaceState,
} from "./glass-material.js";
import { wrapPanelText } from "./panel-layout.js";
import type { SpatialPointerTarget } from "./spatial-pointer.js";

export interface SpatialPrimitive {
  readonly object3d: THREE.Group;
  readonly pointerTargets: readonly SpatialPointerTarget[];
  dispose(): void;
}

/** Minimum target bounds in dp, independent of the visible button size. */
export function spatialHitTargetSizeDp(
  widthDp: number,
  heightDp: number,
  primaryTarget = false,
): Readonly<{ widthDp: number; heightDp: number }> {
  if (![widthDp, heightDp].every((size) => Number.isFinite(size) && size > 0)) {
    throw new RangeError("Visible button dimensions must be finite and positive.");
  }
  const minimum = primaryTarget
    ? xrTokens.sizesDp.targetPrimary
    : xrTokens.sizesDp.targetMin;
  return {
    widthDp: Math.max(widthDp, minimum),
    heightDp: Math.max(heightDp, minimum),
  };
}

export interface SpatialTextOptions {
  readonly text: string;
  readonly style: XrTextStyle;
  readonly color?: XrTextColorRole;
  readonly alignment?: CanvasTextAlign;
  readonly maxWidthDp?: number;
  readonly maxHeightDp?: number;
}

export interface SpatialText extends SpatialPrimitive {
  readonly widthDp: number;
  readonly heightDp: number;
  setText(text: string): void;
}

export type SpatialButtonVariant = "pill" | "control" | "chip" | "circle";

export interface SpatialButtonOptions {
  readonly id: string;
  readonly label?: string;
  readonly alternateLabels?: readonly string[];
  readonly icon?: string;
  readonly variant: SpatialButtonVariant;
  readonly selected?: boolean;
  readonly toggle?: boolean;
  readonly disabled?: boolean;
  readonly primaryTarget?: boolean;
  readonly sizeDp?: Readonly<{ widthDp: number; heightDp: number }>;
  readonly textStyle?: XrTextStyle;
  readonly paddingDp?: Readonly<{ horizontal: number; vertical: number }>;
  readonly onClick?: (selected: boolean) => void;
  readonly onPointerEvent?: SpatialPointerTarget["onPointerEvent"];
}

export interface SpatialButton extends SpatialPrimitive {
  readonly target: SpatialPointerTarget;
  readonly widthDp: number;
  readonly heightDp: number;
  setLabel(label: string): void;
  setSelected(selected: boolean): void;
  setDisabled(disabled: boolean): void;
}

export interface SpatialStepperOptions {
  readonly id: string;
  readonly value: number;
  readonly min: number;
  /** Omit when the particle rule has no upper bound. */
  readonly max?: number;
  readonly layout?: "inline-count" | "label-count-left";
  readonly label?: string;
  readonly labelWidthDp?: number;
  readonly groupWidthDp?: number;
  readonly buttonSizeDp?: number;
  readonly onChange?: (value: number) => void;
}

export interface SpatialStepper extends SpatialPrimitive {
  readonly value: number;
  readonly widthDp: number;
  setValue(value: number): void;
}

export interface SpatialProgressBarOptions {
  readonly widthDp: number;
  readonly heightDp: number;
  readonly value: number;
  readonly max: number;
}

export interface SpatialProgressBar extends SpatialPrimitive {
  readonly widthDp: number;
  setValue(value: number): void;
}

export interface SpatialPropertyRowOptions {
  readonly label: string;
  readonly value: string;
  readonly widthDp: number;
  readonly heightDp?: number;
}

const noPointerTargets: readonly SpatialPointerTarget[] = Object.freeze([]);

function fontFor(style: XrTextStyle): string {
  const token = getXrTextStyle(style);
  const weight = token.weight === "strong" ? "bold" : "normal";
  return `${weight} ${token.sizeDp}px ${xrTokens.typography.fontFamily}`;
}

function measureTextDp(text: string, style: XrTextStyle): number {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("A 2D canvas context is required to measure spatial text.");
  context.font = fontFor(style);
  return context.measureText(text).width;
}

/** Create a token-sized text plane using the project's existing local-font stack. */
export function createSpatialText(options: SpatialTextOptions): SpatialText {
  const style = getXrTextStyle(options.style);
  const color = xrTokens.colors[options.color ?? "textPrimary"];
  const group = new THREE.Group();
  group.name = "spatial-text";
  let text = options.text;
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  const material = new THREE.MeshBasicMaterial({
    color,
    map: texture,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  if (options.maxWidthDp !== undefined &&
    (!Number.isFinite(options.maxWidthDp) || options.maxWidthDp <= 0)) {
    throw new RangeError("Spatial text maximum width must be finite and positive.");
  }
  if (options.maxHeightDp !== undefined &&
    (!Number.isFinite(options.maxHeightDp) || options.maxHeightDp <= 0)) {
    throw new RangeError("Spatial text maximum height must be finite and positive.");
  }
  let heightDp = style.lineHeightDp;
  let geometry: THREE.PlaneGeometry;
  const mesh = new THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>(
    new THREE.PlaneGeometry(dpToMeters(1), dpToMeters(heightDp)),
    material,
  );
  let widthDp = 0;

  const draw = (): void => {
    const lines = options.maxWidthDp === undefined
      ? [text]
      : wrapPanelText(
          text,
          options.maxWidthDp,
          (line) => measureTextDp(line, options.style),
        );
    const measuredWidth = Math.max(
      1,
      ...lines.map((line) => Math.ceil(measureTextDp(line, options.style))),
    );
    const widthPx = Math.max(1, Math.ceil(Math.min(
      options.maxWidthDp ?? measuredWidth,
      measuredWidth,
    )));
    const nextHeightDp = Math.max(1, Math.ceil(style.lineHeightDp * lines.length));
    if (options.maxHeightDp !== undefined && nextHeightDp > options.maxHeightDp) {
      throw new RangeError(
        `Spatial text needs ${nextHeightDp} dp for ${lines.length} lines; ` +
        `its measured height is ${options.maxHeightDp} dp.`,
      );
    }
    const heightPx = nextHeightDp;
    heightDp = heightPx;
    canvas.width = widthPx;
    canvas.height = heightPx;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("A 2D canvas context is required to render spatial text.");
    context.clearRect(0, 0, widthPx, heightPx);
    context.font = fontFor(options.style);
    context.fillStyle = "#FFFFFF";
    context.textAlign = options.alignment ?? "left";
    context.textBaseline = "middle";
    const x = options.alignment === "right" ? widthPx : options.alignment === "center" ? widthPx / 2 : 0;
    lines.forEach((line, index) => {
      context.fillText(line, x, style.lineHeightDp * index + style.lineHeightDp / 2);
    });
    texture.needsUpdate = true;
    const nextWidthDp = widthPx;
    geometry.dispose();
    geometry = new THREE.PlaneGeometry(dpToMeters(nextWidthDp), dpToMeters(heightDp));
    mesh.geometry = geometry;
    widthDp = nextWidthDp;
  };

  geometry = mesh.geometry;
  mesh.name = "spatial-text-glyphs";
  mesh.position.z = xrTokens.layers.label.zOffsetM;
  mesh.renderOrder = xrTokens.layers.label.renderOrder;
  group.add(mesh);
  draw();

  let disposed = false;
  return {
    object3d: group,
    pointerTargets: noPointerTargets,
    get widthDp() {
      return widthDp;
    },
    get heightDp() {
      return heightDp;
    },
    setText(nextText) {
      if (disposed) return;
      text = nextText;
      draw();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      texture.dispose();
      material.dispose();
      geometry.dispose();
      group.removeFromParent();
    },
  };
}

function buttonSize(
  variant: SpatialButtonVariant,
  label: string,
  alternateLabels: readonly string[],
  textStyle: XrTextStyle,
  paddingDp: Readonly<{ horizontal: number; vertical: number }>,
  sizeDp?: Readonly<{ widthDp: number; heightDp: number }>,
): Readonly<{ widthDp: number; heightDp: number }> {
  if (sizeDp && ![sizeDp.widthDp, sizeDp.heightDp]
    .every((size) => Number.isFinite(size) && size > 0)) {
    throw new RangeError("Spatial button dimensions must be finite and positive.");
  }
  const heightDp = Math.max(
    sizeDp?.heightDp ?? 0,
    sizeDp ? 0 : xrTokens.sizesDp.targetMin,
    getXrTextStyle(textStyle).lineHeightDp + paddingDp.vertical * 2,
  );
  const textWidthDp = Math.max(
    measureTextDp(label, textStyle),
    ...alternateLabels.map((alternateLabel) => measureTextDp(alternateLabel, textStyle)),
  ) +
    paddingDp.horizontal * 2;
  const intrinsicWidthDp = variant === "circle"
    ? Math.max(heightDp, textWidthDp)
    : Math.max(sizeDp ? 0 : xrTokens.sizesDp.targetMin, textWidthDp, variant === "chip" ? heightDp : 0);
  const widthDp = Math.max(sizeDp?.widthDp ?? 0, intrinsicWidthDp);
  return { widthDp, heightDp };
}

function createHitArea(
  id: string,
  widthDp: number,
  heightDp: number,
  primaryTarget: boolean,
): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const hitSize = spatialHitTargetSizeDp(widthDp, heightDp, primaryTarget);
  const geometry = new THREE.PlaneGeometry(
    dpToMeters(hitSize.widthDp),
    dpToMeters(hitSize.heightDp),
  );
  const material = new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const hitArea = new THREE.Mesh(geometry, material);
  hitArea.name = `spatial-hit-area-${id}`;
  hitArea.userData.spatialTargetId = id;
  hitArea.renderOrder = -1;
  return hitArea;
}

/** Create one liquid-glass button shape with optional toggle state and hit-area expansion. */
export function createSpatialButton(options: SpatialButtonOptions): SpatialButton {
  const label = [options.icon, options.label].filter(Boolean).join(" ");
  if (!options.id || !label) {
    throw new TypeError("Spatial buttons require an id and a label or icon.");
  }
  const textStyle = options.textStyle ?? "label";
  const paddingDp = options.paddingDp ?? xrTokens.paddingDp.control;
  if (![paddingDp.horizontal, paddingDp.vertical]
    .every((size) => Number.isFinite(size) && size >= 0)) {
    throw new RangeError("Spatial button padding must be finite and non-negative.");
  }
  const { widthDp, heightDp } = buttonSize(
    options.variant,
    label,
    options.alternateLabels ?? [],
    textStyle,
    paddingDp,
    options.sizeDp,
  );
  const widthM = dpToMeters(widthDp);
  const heightM = dpToMeters(heightDp);
  const group = new THREE.Group();
  group.name = `spatial-button-${options.id}`;
  const glassVariant = options.variant === "pill" ? "pill" : "control";
  const surface = createGlassSurface(glassVariant, { width: widthM, height: heightM });
  surface.name = `spatial-button-surface-${options.id}`;
  group.add(surface);
  const labelWidthDp = widthDp - paddingDp.horizontal * 2;
  const labelHeightDp = heightDp - paddingDp.vertical * 2;
  const text = createSpatialText({
    text: label,
    style: textStyle,
    alignment: "center",
    maxWidthDp: labelWidthDp,
    maxHeightDp: labelHeightDp,
  });
  text.object3d.position.z = xrTokens.layers.label.zOffsetM;
  group.add(text.object3d);
  const hitArea = createHitArea(options.id, widthDp, heightDp, options.primaryTarget ?? false);
  group.add(hitArea);
  let selected = options.selected ?? false;
  let disabled = options.disabled ?? false;
  let hovered = false;
  let pressed = false;
  const applyState = (): void => {
    const state: GlassSurfaceState = { hover: hovered, pressed, selected, disabled };
    setGlassSurfaceState(surface, state);
  };
  const target: SpatialPointerTarget = {
    id: options.id,
    object3d: hitArea,
    get disabled() {
      return disabled;
    },
    onPointerEvent(event) {
      options.onPointerEvent?.(event);
      if (event.type !== "click" || disabled) return;
      if (options.toggle) selected = nextToggleValue(selected, disabled);
      applyState();
      options.onClick?.(selected);
    },
    setState(next) {
      hovered = next.hover ?? hovered;
      pressed = next.pressed ?? pressed;
      selected = next.selected ?? selected;
      disabled = next.disabled ?? disabled;
      applyState();
    },
  };
  applyState();
  let disposed = false;
  return {
    object3d: group,
    pointerTargets: [target],
    target,
    widthDp,
    heightDp,
    setLabel(nextLabel) {
      if (!nextLabel) {
        throw new TypeError("Spatial button labels must not be empty.");
      }
      const nextText = [options.icon, nextLabel].filter(Boolean).join(" ");
      text.setText(nextText);
    },
    setSelected(next) {
      selected = next;
      applyState();
    },
    setDisabled(next) {
      disabled = next;
      applyState();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      text.dispose();
      disposeGlassSurface(surface);
      hitArea.geometry.dispose();
      hitArea.material.dispose();
      group.removeFromParent();
    },
  };
}

/** Clamp one stepper increment to its declared inclusive bounds. */
export function nextStepperValue(
  value: number,
  delta: -1 | 1,
  min: number,
  max?: number,
  step = 1,
): number {
  if (![value, min, step].every(Number.isFinite) ||
    (max !== undefined && (!Number.isFinite(max) || min > max)) || step <= 0) {
    throw new RangeError("Stepper values must be finite, ordered, and use a positive step.");
  }
  return THREE.MathUtils.clamp(value + delta * step, min, max ?? Number.MAX_VALUE);
}

/** Apply a toggle click unless the control is disabled. */
export function nextToggleValue(selected: boolean, disabled = false): boolean {
  return disabled ? selected : !selected;
}

/** Compose minus and plus glass buttons around a live count label. */
export function createSpatialStepper(options: SpatialStepperOptions): SpatialStepper {
  if (!Number.isFinite(options.value) || !Number.isFinite(options.min) ||
    (options.max !== undefined &&
      (!Number.isFinite(options.max) || options.min > options.max ||
        options.value > options.max)) ||
    options.value < options.min) {
    throw new RangeError("Stepper value must be within finite, ordered bounds.");
  }
  const group = new THREE.Group();
  group.name = `spatial-stepper-${options.id}`;
  const countPlacement = options.layout ?? "inline-count";
  const labelWidthDp = options.labelWidthDp;
  const groupWidthDp = options.groupWidthDp;
  if (countPlacement === "label-count-left" &&
    (!options.label ||
      labelWidthDp === undefined || !Number.isFinite(labelWidthDp) || labelWidthDp <= 0 ||
      groupWidthDp === undefined || !Number.isFinite(groupWidthDp) || groupWidthDp <= 0)) {
    throw new RangeError("A left-aligned particle stepper requires a label and measured bounds.");
  }
  const countText = createSpatialText({
    text: String(options.value),
    style: "body",
    ...(countPlacement === "label-count-left" && labelWidthDp !== undefined
      ? { maxWidthDp: labelWidthDp, alignment: "left" as const }
      : {}),
  });
  const labelText = countPlacement === "label-count-left" && labelWidthDp !== undefined
    ? createSpatialText({
        text: options.label!,
        style: "body",
        maxWidthDp: labelWidthDp,
      })
    : null;
  const buttonSizeDp = options.buttonSizeDp ?? xrTokens.sizesDp.targetMin;
  if (!Number.isFinite(buttonSizeDp) || buttonSizeDp <= 0) {
    throw new RangeError("Stepper button size must be finite and positive.");
  }
  const buttonSize = { widthDp: buttonSizeDp, heightDp: buttonSizeDp };
  const buttonPaddingDp = xrTokens.spacingDp[0]!;
  const minus = createSpatialButton({
    id: `${options.id}:minus`,
    label: "−",
    variant: "circle",
    sizeDp: buttonSize,
    textStyle: "body",
    paddingDp: { horizontal: buttonPaddingDp, vertical: buttonPaddingDp },
    onClick: () => setValue(nextStepperValue(value, -1, options.min, options.max)),
  });
  const plus = createSpatialButton({
    id: `${options.id}:plus`,
    label: "+",
    variant: "circle",
    sizeDp: buttonSize,
    textStyle: "body",
    paddingDp: { horizontal: buttonPaddingDp, vertical: buttonPaddingDp },
    onClick: () => setValue(nextStepperValue(value, 1, options.min, options.max)),
  });
  let value = options.value;
  const widestCountDp = Math.max(
    measureTextDp(String(options.min), "body"),
    measureTextDp(String(options.max ?? options.value), "body"),
  );
  const gapM = dpToMeters(xrTokens.gapsDp.inline);
  const buttonWidthM = dpToMeters(buttonSizeDp);
  const resolvedLabelWidthDp = labelWidthDp ?? 0;
  const minimumLabelCountWidthDp =
    resolvedLabelWidthDp + xrTokens.gapsDp.inline * 2 + buttonSizeDp * 2;
  if (countPlacement === "label-count-left" &&
    (groupWidthDp ?? 0) < minimumLabelCountWidthDp) {
    throw new RangeError("Particle stepper bounds are narrower than its measured controls.");
  }
  const widthDp = countPlacement === "label-count-left"
    ? groupWidthDp!
    : buttonSizeDp * 2 + xrTokens.gapsDp.inline * 2 + widestCountDp;
  const positionParts = (): void => {
    if (countPlacement === "label-count-left") {
      const fullWidthM = dpToMeters(widthDp);
      const labelWidthM = dpToMeters(resolvedLabelWidthDp);
      const minusX = fullWidthM / 2 - buttonWidthM - gapM - buttonWidthM / 2;
      const labelLineHeightM = dpToMeters(getXrTextStyle("body").lineHeightDp);
      const labelStackGapM = dpToMeters(xrTokens.gapsDp.inline);
      const labelOffsetM = (labelLineHeightM + labelStackGapM) / 2;
      labelText!.object3d.position.set(
        -fullWidthM / 2 + labelWidthM / 2,
        labelOffsetM,
        0,
      );
      countText.object3d.position.set(
        -fullWidthM / 2 + labelWidthM / 2,
        -labelOffsetM,
        0,
      );
      minus.object3d.position.x = minusX;
      plus.object3d.position.x = fullWidthM / 2 - buttonWidthM / 2;
      return;
    }
    const countWidthM = dpToMeters(widestCountDp);
    minus.object3d.position.x = -(buttonWidthM + gapM + countWidthM) / 2;
    countText.object3d.position.x = -countWidthM / 2;
    plus.object3d.position.x = (buttonWidthM + gapM + countWidthM) / 2;
  };
  positionParts();
  group.add(
    ...(labelText ? [labelText.object3d] : []),
    minus.object3d,
    countText.object3d,
    plus.object3d,
  );
  const setValue = (next: number): void => {
    const changed = next !== value;
    value = THREE.MathUtils.clamp(next, options.min, options.max ?? Number.MAX_VALUE);
    countText.setText(String(value));
    positionParts();
    if (changed) options.onChange?.(value);
    minus.setDisabled(value <= options.min);
    plus.setDisabled(options.max !== undefined && value >= options.max);
  };
  setValue(value);
  let disposed = false;
  return {
    object3d: group,
    pointerTargets: [...minus.pointerTargets, ...plus.pointerTargets],
    get value() {
      return value;
    },
    widthDp,
    setValue,
    dispose() {
      if (disposed) return;
      disposed = true;
      minus.dispose();
      plus.dispose();
      countText.dispose();
      labelText?.dispose();
      group.removeFromParent();
    },
  };
}

/** Compose a translucent glass track and a token-colored glass fill. */
export function createSpatialProgressBar(options: SpatialProgressBarOptions): SpatialProgressBar {
  if (!Number.isFinite(options.widthDp) || options.widthDp <= 0 ||
    !Number.isFinite(options.heightDp) || options.heightDp <= 0 ||
    !Number.isFinite(options.value) || !Number.isFinite(options.max) || options.max <= 0) {
    throw new RangeError("Progress dimensions must be positive and values finite.");
  }
  const group = new THREE.Group();
  group.name = "spatial-progress-bar";
  const widthM = dpToMeters(options.widthDp);
  const heightM = dpToMeters(options.heightDp);
  const track = createGlassSurface("pill", { width: widthM, height: heightM });
  const fill = createGlassSurface("pill", { width: widthM, height: heightM }, { reduced: true });
  group.add(track, fill);
  const setValue = (value: number): void => {
    if (!Number.isFinite(value)) throw new RangeError("Progress value must be finite.");
    const fraction = THREE.MathUtils.clamp(value / options.max, 0, 1);
    fill.scale.x = fraction;
    fill.position.x = -(widthM * (1 - fraction)) / 2;
    setGlassSurfaceState(fill, { selected: true });
  };
  setValue(options.value);
  let disposed = false;
  return {
    object3d: group,
    pointerTargets: noPointerTargets,
    widthDp: options.widthDp,
    setValue,
    dispose() {
      if (disposed) return;
      disposed = true;
      disposeGlassSurface(track);
      disposeGlassSurface(fill);
      group.removeFromParent();
    },
  };
}

/** Compose paired token-styled text and a glass hairline divider. */
export function createSpatialPropertyRow(options: SpatialPropertyRowOptions): SpatialPrimitive {
  if (!Number.isFinite(options.widthDp) || options.widthDp <= 0 ||
    (options.heightDp !== undefined && (!Number.isFinite(options.heightDp) || options.heightDp <= 0))) {
    throw new RangeError("Property row dimensions must be finite and positive.");
  }
  const group = new THREE.Group();
  group.name = "spatial-property-row";
  const value = createSpatialText({
    text: options.value,
    style: "body",
    color: "textPrimary",
    alignment: "right",
  });
  const labelWidthDp = Math.max(
    1,
    options.widthDp - value.widthDp - xrTokens.gapsDp.inline,
  );
  const label = createSpatialText({
    text: options.label,
    style: "body",
    color: "textSecondary",
    maxWidthDp: labelWidthDp,
  });
  const totalWidthM = dpToMeters(options.widthDp);
  const valueWidthM = dpToMeters(value.widthDp);
  const labelWidthM = dpToMeters(label.widthDp);
  const rowHeightM = dpToMeters(Math.max(
    options.heightDp ?? 0,
    label.heightDp,
    value.heightDp,
  ));
  label.object3d.position.x = -totalWidthM / 2 + labelWidthM / 2;
  value.object3d.position.x = totalWidthM / 2 - valueWidthM / 2;
  const ruleHeightM = dpToMeters(xrTokens.borders.hairlineDp);
  const rule = createGlassSurface("control", { width: totalWidthM, height: ruleHeightM });
  rule.position.y = -rowHeightM / 2;
  rule.position.z = xrTokens.layers.control.zOffsetM;
  group.add(label.object3d, value.object3d, rule);
  let disposed = false;
  return {
    object3d: group,
    pointerTargets: noPointerTargets,
    dispose() {
      if (disposed) return;
      disposed = true;
      label.dispose();
      value.dispose();
      disposeGlassSurface(rule);
      group.removeFromParent();
    },
  };
}
