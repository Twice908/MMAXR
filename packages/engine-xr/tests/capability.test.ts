import { afterEach, describe, expect, it, vi } from "vitest";
import { detectArSupport } from "../src/capability.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("detectArSupport", () => {
  it.each([
    [true, false, ["immersive-ar"]],
    [false, true, ["immersive-vr"]],
    [true, true, ["immersive-ar", "immersive-vr"]],
  ] as const)("lists supported immersive modes (%s, %s)", async (ar, vr, modes) => {
    const isSessionSupported = vi.fn()
      .mockImplementation((mode: string) => Promise.resolve(mode === "immersive-ar" ? ar : vr));
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal("navigator", { xr: { isSessionSupported } });

    await expect(detectArSupport()).resolves.toEqual({ supported: true, modes });
    expect(isSessionSupported).toHaveBeenCalledWith("immersive-ar");
    expect(isSessionSupported).toHaveBeenCalledWith("immersive-vr");
  });

  it("explains when the page is not a secure context", async () => {
    const isSessionSupported = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("isSecureContext", false);
    vi.stubGlobal("navigator", { xr: { isSessionSupported } });

    await expect(detectArSupport()).resolves.toEqual({
      supported: false,
      code: "insecure_context",
      reason: "AR requires a secure page (HTTPS or localhost).",
      modes: [],
    });
    expect(isSessionSupported).not.toHaveBeenCalled();
  });

  it("explains when WebXR is unavailable", async () => {
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal("navigator", {});

    await expect(detectArSupport()).resolves.toEqual({
      supported: false,
      code: "webxr_unavailable",
      reason: "This browser does not provide WebXR.",
      modes: [],
    });
  });

  it("explains when immersive AR is unsupported", async () => {
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal("navigator", { xr: { isSessionSupported: vi.fn().mockResolvedValue(false) } });

    await expect(detectArSupport()).resolves.toEqual({
      supported: false,
      code: "immersive_ar_unsupported",
      reason: "This device or browser does not support immersive AR.",
      modes: [],
    });
  });

  it("treats a rejected support check as unsupported", async () => {
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal("navigator", {
      xr: { isSessionSupported: vi.fn().mockRejectedValue(new Error("unsupported")) },
    });

    await expect(detectArSupport()).resolves.toMatchObject({
      supported: false,
      code: "immersive_ar_unsupported",
      modes: [],
    });
  });
});