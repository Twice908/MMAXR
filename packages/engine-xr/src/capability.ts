export type ArCapabilityFailure =
  | Readonly<{
      supported: false;
      code: "insecure_context";
      reason: "AR requires a secure page (HTTPS or localhost).";
    }>
  | Readonly<{
      supported: false;
      code: "webxr_unavailable";
      reason: "This browser does not provide WebXR.";
    }>
  | Readonly<{
      supported: false;
      code: "immersive_ar_unsupported";
      reason: "This device or browser does not support immersive AR.";
    }>;

export type ArCapabilityResult = Readonly<{ supported: true }> | ArCapabilityFailure;

interface ArXrSystem {
  isSessionSupported(mode: "immersive-ar"): Promise<boolean>;
}

interface NavigatorWithXr extends Navigator {
  readonly xr?: ArXrSystem;
}

function unsupported(
  code: ArCapabilityFailure["code"],
): ArCapabilityFailure {
  switch (code) {
    case "insecure_context":
      return {
        supported: false,
        code,
        reason: "AR requires a secure page (HTTPS or localhost).",
      };
    case "webxr_unavailable":
      return { supported: false, code, reason: "This browser does not provide WebXR." };
    case "immersive_ar_unsupported":
      return {
        supported: false,
        code,
        reason: "This device or browser does not support immersive AR.",
      };
  }
}

/** Detect whether this browser can start an immersive AR session. */
export async function detectArSupport(): Promise<ArCapabilityResult> {
  if (!globalThis.isSecureContext) {
    return unsupported("insecure_context");
  }

  const browserNavigator = typeof navigator === "undefined"
    ? undefined
    : navigator as NavigatorWithXr;
  const xr = browserNavigator?.xr;
  if (!xr) {
    return unsupported("webxr_unavailable");
  }

  try {
    return await xr.isSessionSupported("immersive-ar")
      ? { supported: true }
      : unsupported("immersive_ar_unsupported");
  } catch {
    return unsupported("immersive_ar_unsupported");
  }
}