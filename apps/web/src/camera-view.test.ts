import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  cameraViewErrorReason,
  detectCameraViewCapability,
  isAndroidCameraDevice,
  requestCameraOrientationPermission,
  stopCameraStream,
} from "./camera-view.js";

describe("camera view capability", () => {
  const unsupportedAr = async () => false;

  it("checks secure context and camera access before querying immersive AR", async () => {
    const supportsImmersiveAr = vi.fn(unsupportedAr);
    await expect(detectCameraViewCapability({
      secureContext: false,
      hasFinePointer: true,
      supportsImmersiveAr,
      getUserMedia: vi.fn(),
    })).resolves.toMatchObject({ available: false, reason: expect.stringContaining("secure page") });
    await expect(detectCameraViewCapability({
      secureContext: true,
      hasFinePointer: true,
      supportsImmersiveAr,
      getUserMedia: null,
    })).resolves.toMatchObject({ available: false, reason: expect.stringContaining("camera access") });
    expect(supportsImmersiveAr).not.toHaveBeenCalled();
  });

  it("keeps camera view available on a fine-pointer desktop even when XR reports AR support", async () => {
    await expect(detectCameraViewCapability({
      secureContext: true,
      hasFinePointer: true,
      supportsImmersiveAr: async () => true,
      getUserMedia: vi.fn(),
    })).resolves.toEqual({ available: true, reason: "" });
  });

  it("hides camera view on a touch-first device when immersive AR is available", async () => {
    await expect(detectCameraViewCapability({
      secureContext: true,
      hasFinePointer: false,
      supportsImmersiveAr: async () => true,
      getUserMedia: vi.fn(),
    })).resolves.toMatchObject({
      available: false,
      reason: "Use AR for camera-based viewing on this device.",
    });
  });
});

describe("camera view motion permission", () => {
  it("gates Android camera layout by the Android user agent only", () => {
    expect(isAndroidCameraDevice("Mozilla/5.0 (Linux; Android 14; Pixel)")).toBe(true);
    expect(isAndroidCameraDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)")).toBe(false);
    expect(isAndroidCameraDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(false);
  });

  it("requests orientation permission from the supplied camera-start view", async () => {
    const requestPermission = vi.fn().mockResolvedValue("granted");
    const view = {
      DeviceOrientationEvent: { requestPermission },
    } as unknown as Window;
    await expect(requestCameraOrientationPermission(view)).resolves.toBe(true);
    expect(requestPermission).toHaveBeenCalledOnce();
  });

  it("uses drag fallback when orientation is unavailable or permission is denied", async () => {
    await expect(requestCameraOrientationPermission(null)).resolves.toBe(false);
    const requestPermission = vi.fn().mockResolvedValue("denied");
    const view = {
      DeviceOrientationEvent: { requestPermission },
    } as unknown as Window;
    await expect(requestCameraOrientationPermission(view)).resolves.toBe(false);
  });
});

describe("camera stream cleanup", () => {
  it("stops every track and detaches the video", () => {
    const first = { onended: vi.fn(), stop: vi.fn() };
    const second = { onended: vi.fn(), stop: vi.fn() };
    const stream = {
      getTracks: () => [first, second],
    } as unknown as MediaStream;
    const video = {
      pause: vi.fn(),
      srcObject: stream,
      remove: vi.fn(),
    } as unknown as HTMLVideoElement;

    stopCameraStream(stream, video);

    expect(first.stop).toHaveBeenCalledOnce();
    expect(second.stop).toHaveBeenCalledOnce();
    expect(first.onended).toBeNull();
    expect(second.onended).toBeNull();
    expect(video.pause).toHaveBeenCalledOnce();
    expect(video.srcObject).toBeNull();
    expect(video.remove).toHaveBeenCalledOnce();
  });

  it.each([
    ["NotAllowedError", "permission_denied"],
    ["NotFoundError", "no_camera"],
    ["NotReadableError", "camera_in_use"],
    ["AbortError", "device_unavailable"],
  ] as const)("maps %s to %s", (name, reason) => {
    expect(cameraViewErrorReason(Object.assign(new Error(), { name }))).toBe(reason);
  });
});

describe("camera view privacy boundary", () => {
  it("does not use frame capture, recording, or image capture APIs", async () => {
    const source = await readFile(new URL("./camera-view.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/\b(?:drawImage|getImageData|captureStream|MediaRecorder|ImageCapture)\b/);
  });
});
