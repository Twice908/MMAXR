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
    }>
  | Readonly<{
      supported: false;
      code: "immersive_mode_unsupported";
      reason: "This device or browser does not support the requested immersive mode.";
    }>;

export type ImmersiveMode = "immersive-ar" | "immersive-vr";
export type ArCapabilityResult =
  | Readonly<{ supported: true; modes: readonly ImmersiveMode[] }>
  | (ArCapabilityFailure & Readonly<{ modes: readonly [] }>);

export interface ArXrCapabilitySystem {
  isSessionSupported(mode: ImmersiveMode): Promise<boolean>;
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
    case "immersive_mode_unsupported":
      return {
        supported: false,
        code,
        reason: "This device or browser does not support the requested immersive mode.",
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

/** Detect supported immersive AR and VR modes in this secure browser. */
export async function detectArSupport(
  environment = browserCapabilityEnvironment(),
): Promise<ArCapabilityResult> {
  if (!environment.secureContext) {
    return { ...unsupported("insecure_context"), modes: [] };
  }

  const xr = environment.xr;
  if (!xr) {
    return { ...unsupported("webxr_unavailable"), modes: [] };
  }

  const [ar, vr] = await Promise.all([
    xr.isSessionSupported("immersive-ar").catch(() => false),
    xr.isSessionSupported("immersive-vr").catch(() => false),
  ]);
  const modes: ImmersiveMode[] = [];
  if (ar) modes.push("immersive-ar");
  if (vr) modes.push("immersive-vr");
  return modes.length > 0
    ? { supported: true, modes }
    : { ...unsupported("immersive_ar_unsupported"), modes: [] };
}