import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { horizonTokens } from "../src/horizon-tokens.js";
import {
  GLASS,
  getXrTextStyle,
  MODEL_LIMITS,
  PANEL_LIMITS,
  dpToMeters,
  textHeightDmm,
  xrTokens,
} from "../src/xr-tokens.js";
import {
  createSpatialButton,
  createSpatialPropertyRow,
  createSpatialStepper,
  nextStepperValue,
  nextToggleValue,
  spatialHitTargetSizeDp,
} from "../src/visuals/spatial-primitives.js";
import { SPATIAL_COMPONENT_REGISTRY } from "../src/visuals/spatial-component-registry.js";

afterEach(() => vi.unstubAllGlobals());

function stubCanvas(): {
  readonly fillText: ReturnType<typeof vi.fn>;
  readonly font: () => string;
} {
  const fillText = vi.fn();
  const context = {
    font: "",
    fillStyle: "",
    textAlign: "left" as CanvasTextAlign,
    textBaseline: "alphabetic" as CanvasTextBaseline,
    measureText: (text: string) => ({ width: text.length * 8 }),
    clearRect: vi.fn(),
    fillText,
  };
  vi.stubGlobal("document", {
    createElement: () => ({
      width: 1,
      height: 1,
      getContext: () => context,
    }),
  });
  return { fillText, font: () => context.font };
}

function linearChannel(hex: string, channel: number): number {
  const value = Number.parseInt(hex.slice(channel, channel + 2), 16) / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  return 0.2126 * linearChannel(hex, 1) +
    0.7152 * linearChannel(hex, 3) +
    0.0722 * linearChannel(hex, 5);
}

function compositeGlassLuminance(
  tint: string,
  alpha: number,
  background: string,
  brightness: number,
): number {
  const channel = (index: number): number =>
    linearChannel(tint, index) * brightness * alpha +
    linearChannel(background, index) * (1 - alpha);
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrastRatio(first: number, second: number): number {
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

describe("shared spatial primitives", () => {
  it("keeps every text style above the legibility minimum at supported distances and scale", () => {
    const styles = ["display", "title", "heading", "body", "label", "caption"] as const;
    const minimumDmm = textHeightDmm(xrTokens.typography.minimumSizeDp, 1, 1);

    for (const styleName of styles) {
      const sizeDp = getXrTextStyle(styleName).sizeDp;
      expect(textHeightDmm(sizeDp, 1, 1)).toBeGreaterThanOrEqual(minimumDmm);
      expect(textHeightDmm(sizeDp, 0.9, 1)).toBeGreaterThanOrEqual(minimumDmm);
      expect(textHeightDmm(sizeDp, 1, PANEL_LIMITS.scale.max)).toBeGreaterThanOrEqual(minimumDmm);
    }

    expect(MODEL_LIMITS.zoom.min).toBeLessThan(MODEL_LIMITS.zoom.default);
    expect(MODEL_LIMITS.zoom.default).toBeLessThan(MODEL_LIMITS.zoom.max);
  });

  it("keeps token text colors at 4.5:1 over bright and dark content glass in the brightest state", () => {
    const brightness = 1 +
      xrTokens.glass.states.hoverBrightness +
      xrTokens.glass.states.selectedBrightness;
    const textLuminances = Object.values(xrTokens.colors).map(luminance);

    for (const variant of ["panel", "card", "control", "pill"] as const) {
      const { tint } = GLASS.variants[variant];
      for (const background of ["#FFFFFF", "#000000"]) {
        const surfaceLuminance = compositeGlassLuminance(
          tint.rgb,
          tint.alpha,
          background,
          brightness,
        );
        for (const textLuminance of textLuminances) {
          expect(contrastRatio(textLuminance, surfaceLuminance)).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it("keeps pill-backed labels readable over both white and black AR backdrops", () => {
    const { tint } = GLASS.variants.pill;
    const textLuminance = luminance(xrTokens.colors.textPrimary);
    for (const backdrop of ["#FFFFFF", "#000000"]) {
      const plateLuminance = compositeGlassLuminance(
        tint.rgb,
        tint.alpha,
        backdrop,
        1 + xrTokens.glass.states.hoverBrightness,
      );
      expect(contrastRatio(textLuminance, plateLuminance)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("sizes button labels with token padding and keeps alternate labels inside", () => {
    const { font } = stubCanvas();
    const button = createSpatialButton({
      id: "narration",
      label: "Enable sound",
      alternateLabels: ["Narration On", "Narration Off"],
      variant: "pill",
      sizeDp: { widthDp: 72, heightDp: 36 },
      textStyle: "body",
    });
    const label = button.object3d.children.find((child) => child.name === "spatial-text");
    const textMesh = label?.children[0];
    if (!(textMesh instanceof THREE.Mesh) || !(textMesh.geometry instanceof THREE.PlaneGeometry)) {
      throw new Error("Spatial button label mesh is missing.");
    }
    const labelWidthDp = textMesh.geometry.parameters.width / horizonTokens.metresPerDp;
    expect(button.widthDp).toBeGreaterThanOrEqual(72);
    expect(labelWidthDp).toBeLessThanOrEqual(
      button.widthDp - xrTokens.paddingDp.control.horizontal * 2,
    );
    expect(font()).toMatch(/^normal /);
    button.setLabel("Narration Off");
    button.dispose();
  });

  it("toggles selected state unless disabled", () => {
    expect(nextToggleValue(false)).toBe(true);
    expect(nextToggleValue(true)).toBe(false);
    expect(nextToggleValue(true, true)).toBe(true);
  });

  it("clamps stepper changes at both inclusive bounds", () => {
    expect(nextStepperValue(0, -1, 0, 3)).toBe(0);
    expect(nextStepperValue(3, 1, 0, 3)).toBe(3);
    expect(nextStepperValue(1, 1, 0, 3)).toBe(2);
    expect(nextStepperValue(6, 1, 0)).toBe(7);
  });

  it("updates the stepper count and disables controls at their bounds", () => {
    const { fillText } = stubCanvas();
    const stepper = createSpatialStepper({
      id: "test-particles",
      value: 0,
      min: 0,
      max: 2,
    });
    const minus = stepper.pointerTargets.find((target) => target.id.endsWith(":minus"));
    const plus = stepper.pointerTargets.find((target) => target.id.endsWith(":plus"));
    const click = (target: typeof plus): void => {
      target?.onPointerEvent?.({
        type: "click",
        targetId: target.id,
        sourceId: "unit-test",
        source: "controller",
      });
    };

    expect(minus?.disabled).toBe(true);
    expect(plus?.disabled).toBe(false);
    click(plus);
    expect(stepper.value).toBe(1);
    expect(fillText).toHaveBeenCalledWith("1", expect.any(Number), expect.any(Number));
    click(plus);
    expect(stepper.value).toBe(2);
    expect(plus?.disabled).toBe(true);
    stepper.dispose();
  });

  it("puts particle labels and counts left of the right-aligned stepper buttons", () => {
    stubCanvas();
    const groupWidthDp = 200;
    const labelWidthDp = 80;
    const buttonSizeDp = 48;
    const stepper = createSpatialStepper({
      id: "particle-layout",
      value: 6,
      min: 0,
      max: 20,
      layout: "label-count-left",
      label: "Proton",
      labelWidthDp,
      groupWidthDp,
      buttonSizeDp,
    });
    const [label, minus, count, plus] = stepper.object3d.children;
    if (!label || !minus || !count || !plus) {
      throw new Error("Particle stepper is missing a layout element.");
    }
    const labelWidthM = dpToMeters(labelWidthDp);
    const buttonWidthM = dpToMeters(buttonSizeDp);
    const minimumGapM = dpToMeters(xrTokens.gapsDp.inline);

    expect(label.position.x).toBeCloseTo(count.position.x);
    expect(label.position.y).toBeGreaterThan(count.position.y);
    expect(label.position.y - count.position.y - dpToMeters(20)).toBeCloseTo(minimumGapM);
    expect(minus.position.x).toBeLessThan(plus.position.x);
    expect(minus.position.x - buttonWidthM / 2 -
      (label.position.x + labelWidthM / 2)).toBeGreaterThanOrEqual(minimumGapM);
    expect(plus.position.x + buttonWidthM / 2).toBeCloseTo(dpToMeters(groupWidthDp) / 2);
    stepper.dispose();
  });

  it("routes toggle state and ignores clicks while disabled", () => {
    stubCanvas();
    const onClick = vi.fn();
    const button = createSpatialButton({
      id: "captions",
      label: "Captions",
      variant: "pill",
      toggle: true,
      onClick,
    });
    const target = button.pointerTargets[0];
    if (!target) throw new Error("Toggle pointer target is missing.");
    const click = (): void => target.onPointerEvent?.({
      type: "click",
      targetId: target.id,
      sourceId: "unit-test",
      source: "touch",
    });

    click();
    expect(onClick).toHaveBeenLastCalledWith(true);
    button.setDisabled(true);
    click();
    expect(onClick).toHaveBeenCalledTimes(1);
    button.dispose();
  });

  it("renders property row labels and live values as token text", () => {
    const { fillText } = stubCanvas();
    const row = createSpatialPropertyRow({
      label: "Atomic number Z",
      value: "7",
      widthDp: 180,
      heightDp: 32,
    });
    expect(fillText.mock.calls.map(([text]) => text)).toEqual(
      expect.arrayContaining(["Atomic number Z", "7"]),
    );
    row.dispose();
  });

  it("expands invisible button hit areas to the kit minimums", () => {
    expect(spatialHitTargetSizeDp(20, 32)).toEqual({ widthDp: 48, heightDp: 48 });
    expect(spatialHitTargetSizeDp(70, 20, true)).toEqual({ widthDp: 70, heightDp: 60 });
    expect(spatialHitTargetSizeDp(20, 20).widthDp).toBe(xrTokens.sizesDp.targetMin);
  });

  it("registers one shared implementation for each requested primitive", () => {
    expect(SPATIAL_COMPONENT_REGISTRY.map(({ component }) => component)).toEqual([
      "Text",
      "Button",
      "Slider",
      "Stepper",
      "ProgressBar",
      "PropertyRow",
    ]);
  });
});
