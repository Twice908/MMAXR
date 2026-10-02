import { afterEach, describe, expect, it, vi } from "vitest";
import { detectArSupport } from "../src/capability.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("detectArSupport", () => {
  it("reports immersive AR support when the secure browser supports it", async () => {
    const isSessionSupported = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal("navigator", { xr: { isSessionSupported } });

    await expect(detectArSupport()).resolves.toEqual({ supported: true });
    expect(isSessionSupported).toHaveBeenCalledWith("immersive-ar");
  });

  it("explains when the page is not a secure context", async () => {
    const isSessionSupported = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("isSecureContext", false);
    vi.stubGlobal("navigator", { xr: { isSessionSupported } });

    await expect(detectArSupport()).resolves.toEqual({
      supported: false,
      code: "insecure_context",
      reason: "AR requires a secure page (HTTPS or localhost).",
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
    });
  });

  it("explains when immersive AR is unsupported", async () => {
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal("navigator", { xr: { isSessionSupported: vi.fn().mockResolvedValue(false) } });

    await expect(detectArSupport()).resolves.toEqual({
      supported: false,
      code: "immersive_ar_unsupported",
      reason: "This device or browser does not support immersive AR.",
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
    });
  });
});