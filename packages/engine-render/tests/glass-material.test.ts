import { describe, expect, it } from "vitest";
import {
  createGlassSurface,
  disposeGlassSurface,
  setGlassSurfaceState,
  updateGlassSurfaceUniforms,
} from "../src/visuals/glass-material.js";
import { xrTokens } from "../src/xr-tokens.js";

describe("shared glass surfaces", () => {
  it("reuses one transparent premultiplied shader material per variant", () => {
    const first = createGlassSurface("panel", { width: 1, height: 0.5 });
    const second = createGlassSurface("panel", { width: 0.5, height: 0.25 });
    const control = createGlassSurface("control", { width: 0.5, height: 0.25 });

    expect(first.material).toBe(second.material);
    expect(control.material).not.toBe(first.material);
    expect(first.material.transparent).toBe(true);
    expect(first.material.depthWrite).toBe(false);
    expect(first.material.premultipliedAlpha).toBe(true);
    expect(first.material.fragmentShader).toContain("roundedRectDistance");
    expect(first.renderOrder).toBe(xrTokens.layers.panel.renderOrder);
    disposeGlassSurface(first);
    disposeGlassSurface(second);
    disposeGlassSurface(control);
  });

  it("keeps state uniforms isolated per surface while using the shared material", () => {
    const surface = createGlassSurface("control", { width: 1, height: 0.25 }, { reduced: true });
    setGlassSurfaceState(surface, {
      hover: true,
      pressed: true,
      dragging: true,
      selected: true,
      disabled: true,
    });
    updateGlassSurfaceUniforms(surface);

    expect(surface.material.uniforms.hover?.value).toBe(1);
    expect(surface.material.uniforms.pressed?.value).toBe(1);
    expect(surface.material.uniforms.dragging?.value).toBe(1);
    expect(surface.material.uniforms.selected?.value).toBe(1);
    expect(surface.material.uniforms.disabled?.value).toBe(1);
    expect(surface.material.uniforms.reduced?.value).toBe(1);
    expect(surface.material.uniforms.size?.value.toArray()).toEqual([1, 0.25]);
    expect(surface.material.uniformsNeedUpdate).toBe(true);

    disposeGlassSurface(surface);
  });

  it("rejects invalid physical dimensions", () => {
    expect(() => createGlassSurface("panel", { width: 0, height: 1 })).toThrow(RangeError);
    expect(() => createGlassSurface("panel", { width: 1, height: Number.NaN })).toThrow(RangeError);
  });
});
