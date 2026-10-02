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

export interface ArXrCapabilitySystem {
  isSessionSupported(mode: "immersive-ar"): Promise<boolean>;
}

export interface ArCapabilityEnvironment {
  readonly secureContext: boolean;
  readonly xr: ArXrCapabilitySystem | null;
}

interface NavigatorWithXr {
  readonly xr?: ArXrCapabilitySystem;
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

function browserCapabilityEnvironment(): ArCapabilityEnvironment {
  const browserNavigator = typeof navigator === "undefined"
    ? undefined
    : navigator as unknown as NavigatorWithXr;
  return {
    secureContext: globalThis.isSecureContext,
    xr: browserNavigator?.xr ?? null,
  };
}

/** Detect whether this browser can start an immersive AR session. */
export async function detectArSupport(
  environment = browserCapabilityEnvironment(),
): Promise<ArCapabilityResult> {
  if (!environment.secureContext) {
    return unsupported("insecure_context");
  }

  const xr = environment.xr;
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