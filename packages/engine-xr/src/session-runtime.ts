import {
  detectArSupport,
  type ArCapabilityEnvironment,
  type ArXrCapabilitySystem,
} from "./capability.js";
import {
  initialArSessionState,
  transitionArSession,
  type ArErrorReasonCode,
  type ArFeature,
  type ArSessionState,
} from "./session.js";

export interface ArSessionHandle extends EventTarget {
  readonly enabledFeatures?: readonly string[];
  readonly visibilityState?: "visible" | "visible-blurred" | "hidden";
  readonly domOverlayState?: object | null;
  end(): Promise<void>;
}

export interface ArSessionRequestOptions {
  readonly optionalFeatures: readonly ArFeature[];
  readonly domOverlay: Readonly<{ root: HTMLElement }>;
}

export interface ArSessionSystem extends ArXrCapabilitySystem {
  requestSession(
    mode: "immersive-ar",
    options: ArSessionRequestOptions,
  ): Promise<ArSessionHandle>;
}

export interface ArVisibilityTarget {
  readonly hidden: boolean;
  addEventListener(type: "visibilitychange", listener: EventListener): void;
  removeEventListener(type: "visibilitychange", listener: EventListener): void;
}

export interface ArSessionEnvironment extends ArCapabilityEnvironment {
  readonly xr: ArSessionSystem | null;
  readonly visibilityTarget: ArVisibilityTarget | null;
}

export interface ArSessionPresentation {
  enter(session: ArSessionHandle): Promise<void>;
  exit(): Promise<void> | void;
}

export interface ArSessionControllerOptions {
  readonly overlayRoot: HTMLElement;
  readonly presentation: ArSessionPresentation;
  readonly environment?: ArSessionEnvironment;
  readonly now?: () => number;
  readonly onStateChange?: (state: ArSessionState) => void;
  readonly onStarted?: (grantedFeatures: readonly ArFeature[]) => void;
  readonly onEnded?: (durationSec: number) => void;
  readonly onError?: (reasonCode: ArErrorReasonCode) => void;
}

interface NavigatorWithXr {
  readonly xr?: ArSessionSystem;
}

/** A user-facing failure to begin or continue the AR session. */
export class ArSessionStartError extends Error {
  constructor(
    readonly reasonCode: ArErrorReasonCode,
    message: string,
  ) {
    super(message);
    this.name = "ArSessionStartError";
  }
}

function browserEnvironment(): ArSessionEnvironment {
  const browserNavigator = typeof navigator === "undefined"
    ? undefined
    : navigator as unknown as NavigatorWithXr;
  return {
    secureContext: globalThis.isSecureContext,
    xr: browserNavigator?.xr ?? null,
    visibilityTarget: typeof document === "undefined" ? null : document,
  };
}

function errorReason(error: unknown): ArErrorReasonCode {
  if (error && typeof error === "object" && "name" in error) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return "permission_denied";
    }
    if (error.name === "NotSupportedError") {
      return "unsupported";
    }
  }
  return "unknown";
}

/** Own the browser AR session lifecycle and delegate rendering through a presentation port. */
export class ArSessionController {
  private readonly environment: ArSessionEnvironment;
  private readonly now: () => number;
  private currentState: ArSessionState = initialArSessionState;
  private session: ArSessionHandle | null = null;
  private startedAt: number | null = null;
  private presentationEntered = false;
  private hiddenDuringRequest = false;
  private finishPromise: Promise<void> | null = null;
  private documentListening = false;

  private readonly onSessionEnd = (): void => {
    void this.finish(null, false);
  };

  private readonly onSessionVisibilityChange = (): void => {
    if (this.session?.visibilityState === "hidden") {
      void this.finish("tracking_lost", true);
    }
  };

  private readonly onDocumentVisibilityChange = (): void => {
    if (!this.environment.visibilityTarget?.hidden) {
      return;
    }
    if (this.currentState.status === "requesting" && !this.session) {
      this.hiddenDuringRequest = true;
    } else if (this.session) {
      void this.finish("tracking_lost", true);
    }
  };

  constructor(private readonly options: ArSessionControllerOptions) {
    this.environment = options.environment ?? browserEnvironment();
    this.now = options.now ?? (() => performance.now());
  }

  get state(): ArSessionState {
    return this.currentState;
  }

  /** Request AR with a DOM overlay and start the provided presentation adapter. */
  async start(): Promise<ArSessionState> {
    if (this.currentState.status !== "idle") {
      throw new Error(`Cannot start AR while session is ${this.currentState.status}.`);
    }

    const requestedFeatures: readonly ArFeature[] = ["dom-overlay", "hand-tracking"];
    this.transition({ type: "request", requestedFeatures });
    this.startListeningForTabVisibility();

    const capability = await detectArSupport(this.environment);
    if (!capability.supported) {
      await this.finish("unsupported", false);
      throw new ArSessionStartError("unsupported", capability.reason);
    }

    let session: ArSessionHandle;
    try {
      session = await this.environment.xr!.requestSession("immersive-ar", {
        optionalFeatures: requestedFeatures,
        domOverlay: { root: this.options.overlayRoot },
      });
    } catch (error) {
      const reasonCode = errorReason(error);
      await this.finish(reasonCode, false);
      throw new ArSessionStartError(reasonCode, "AR could not be started. You can keep learning in screen mode.");
    }

    this.session = session;
    session.addEventListener("end", this.onSessionEnd);
    session.addEventListener("visibilitychange", this.onSessionVisibilityChange);

    const grantedFeatures = requestedFeatures.filter(
      (feature) => session.enabledFeatures?.includes(feature) === true,
    );
    const overlayGranted = grantedFeatures.includes("dom-overlay")
      || session.domOverlayState !== undefined && session.domOverlayState !== null;
    if (!overlayGranted) {
      await this.finish("dom_overlay_unavailable", true);
      throw new ArSessionStartError(
        "dom_overlay_unavailable",
        "AR controls are unavailable on this device. Returning to screen mode.",
      );
    }

    if (this.hiddenDuringRequest || this.environment.visibilityTarget?.hidden) {
      await this.finish("tracking_lost", true);
      throw new ArSessionStartError("tracking_lost", "AR paused when this page was hidden. Returning to screen mode.");
    }

    try {
      this.presentationEntered = true;
      await this.options.presentation.enter(session);
    } catch {
      await this.finish("unknown", true);
      throw new ArSessionStartError("unknown", "AR could not be displayed. You can keep learning in screen mode.");
    }

    this.startedAt = this.now();
    this.transition({ type: "started", grantedFeatures });
    this.options.onStarted?.(grantedFeatures);
    return this.currentState;
  }

  /** End AR and restore the screen presentation without changing lesson state. */
  async stop(): Promise<void> {
    if (this.session) {
      await this.finish(null, true);
    }
  }

  private transition(event: Parameters<typeof transitionArSession>[1]): void {
    this.currentState = transitionArSession(this.currentState, event);
    this.options.onStateChange?.(this.currentState);
  }

  private startListeningForTabVisibility(): void {
    if (this.documentListening || !this.environment.visibilityTarget) {
      return;
    }
    this.environment.visibilityTarget.addEventListener("visibilitychange", this.onDocumentVisibilityChange);
    this.documentListening = true;
  }

  private removeListeners(): void {
    if (this.documentListening) {
      this.environment.visibilityTarget?.removeEventListener("visibilitychange", this.onDocumentVisibilityChange);
      this.documentListening = false;
    }
    this.session?.removeEventListener("end", this.onSessionEnd);
    this.session?.removeEventListener("visibilitychange", this.onSessionVisibilityChange);
  }

  private finish(reasonCode: ArErrorReasonCode | null, endNativeSession: boolean): Promise<void> {
    if (this.finishPromise) {
      return this.finishPromise;
    }

    this.finishPromise = Promise.resolve().then(async () => {
      const session = this.session;
      const startedAt = this.startedAt;
      this.removeListeners();

      if (reasonCode) {
        if (
          this.currentState.status === "requesting"
          || this.currentState.status === "active"
          || this.currentState.status === "ending"
        ) {
          this.transition({ type: "error", reasonCode });
        }
        this.options.onError?.(reasonCode);
      } else if (this.currentState.status === "requesting" || this.currentState.status === "active") {
        this.transition({ type: "end" });
      }

      if (endNativeSession && session) {
        try {
          await session.end();
        } catch {
          if (!reasonCode && this.currentState.status === "ending") {
            this.transition({ type: "error", reasonCode: "unknown" });
            this.options.onError?.("unknown");
          }
        }
      }

      if (this.presentationEntered) {
        try {
          await this.options.presentation.exit();
        } catch {
          if (!reasonCode && this.currentState.status === "ending") {
            this.transition({ type: "error", reasonCode: "unknown" });
            this.options.onError?.("unknown");
          }
        }
      }

      this.presentationEntered = false;
      this.session = null;
      this.startedAt = null;
      this.hiddenDuringRequest = false;

      if (this.currentState.status === "error") {
        this.transition({ type: "reset" });
      } else if (this.currentState.status === "ending") {
        this.transition({ type: "ended" });
      }

      if (startedAt !== null) {
        this.options.onEnded?.(Math.max(0, (this.now() - startedAt) / 1000));
      }
    }).finally(() => {
      this.finishPromise = null;
    });

    return this.finishPromise;
  }
}