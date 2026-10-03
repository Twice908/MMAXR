export const arErrorReasonCodes = [
  "permission_denied",
  "tracking_lost",
  "unsupported",
  "dom_overlay_unavailable",
  "unknown",
] as const;

export type ArErrorReasonCode = (typeof arErrorReasonCodes)[number];
export type ArFeature = "hit-test" | "dom-overlay" | "hand-tracking";

export type ArSessionState =
  | Readonly<{ status: "idle" }>
  | Readonly<{
      status: "requesting";
      requestedFeatures: readonly ArFeature[];
    }>
  | Readonly<{
      status: "active";
      requestedFeatures: readonly ArFeature[];
      grantedFeatures: readonly ArFeature[];
    }>
  | Readonly<{ status: "ending" }>
  | Readonly<{ status: "error"; reasonCode: ArErrorReasonCode }>;

export type ArSessionEvent =
  | Readonly<{ type: "request"; requestedFeatures: readonly ArFeature[] }>
  | Readonly<{ type: "started"; grantedFeatures: readonly ArFeature[] }>
  | Readonly<{ type: "end" }>
  | Readonly<{ type: "ended" }>
  | Readonly<{ type: "error"; reasonCode: ArErrorReasonCode }>
  | Readonly<{ type: "reset" }>;

export const initialArSessionState: ArSessionState = { status: "idle" };

/** Apply one valid lifecycle event or throw when the transition is not allowed. */
export function transitionArSession(
  state: ArSessionState,
  event: ArSessionEvent,
): ArSessionState {
  switch (event.type) {
    case "request":
      if (state.status !== "idle") {
        break;
      }
      return { status: "requesting", requestedFeatures: [...event.requestedFeatures] };
    case "started":
      if (state.status !== "requesting") {
        break;
      }
      if (event.grantedFeatures.some((feature) => !state.requestedFeatures.includes(feature))) {
        throw new RangeError("Granted AR features must have been requested.");
      }
      return {
        status: "active",
        requestedFeatures: state.requestedFeatures,
        grantedFeatures: [...event.grantedFeatures],
      };
    case "end":
      if (state.status === "requesting" || state.status === "active") {
        return { status: "ending" };
      }
      break;
    case "ended":
      if (state.status === "ending") {
        return initialArSessionState;
      }
      break;
    case "error":
      if (
        state.status === "requesting"
        || state.status === "active"
        || state.status === "ending"
      ) {
        return { status: "error", reasonCode: event.reasonCode };
      }
      break;
    case "reset":
      if (state.status === "error") {
        return initialArSessionState;
      }
      break;
  }

  throw new Error(`Invalid AR session transition: ${state.status} + ${event.type}.`);
}