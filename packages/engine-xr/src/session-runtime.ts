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
  readonly enabledFeatures?: Iterable<string>;
  readonly inputSources?: Iterable<Readonly<{
    readonly targetRayMode: string;
    readonly hand?: unknown;
    readonly gamepad?: unknown;
  }>>;
  readonly visibilityState?: "visible" | "visible-blurred" | "hidden";
  readonly domOverlayState?: object | null;
  readonly interactionMode?: "screen-space" | "world-space";
  readonly environmentBlendMode?: "opaque" | "additive" | "alpha-blend";
  readonly frameRate?: number;
  end(): Promise<void>;
}

export interface ArSessionRequestOptions {
  readonly optionalFeatures: readonly ArFeature[];
  readonly domOverlay?: Readonly<{ root: HTMLElement }>;
}

export interface ArSessionSystem extends ArXrCapabilitySystem {
  requestSession(
    mode: "immersive-ar" | "immersive-vr",
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

/** Runtime grant information associated with the current AR session. */
export interface ArSessionRuntimeInfo {
  readonly overlayGranted: boolean | null;
  readonly mode: "immersive-ar" | "immersive-vr" | null;
  readonly supportedModes: readonly ("immersive-ar" | "immersive-vr")[];
  readonly requestedFeatures: readonly ArFeature[];
  readonly grantedFeatures: readonly ArFeature[];
  readonly interactionMode: "screen-space" | "world-space" | null;
  readonly environmentBlendMode: "opaque" | "additive" | "alpha-blend" | null;
  readonly inputSourceTypes: readonly string[];
  readonly referenceSpaceType: "local-floor" | "local" | null;
  readonly frameRate: number | null;
}

export interface ArSessionPresentation {
  enter(session: ArSessionHandle, mode: "immersive-ar" | "immersive-vr"): Promise<void>;
  exit(): Promise<void> | void;
}

export interface ArSessionControllerOptions {
  readonly overlayRoot: HTMLElement;
  readonly presentation: ArSessionPresentation;
  readonly environment?: ArSessionEnvironment;
  readonly now?: () => number;
  readonly onStateChange?: (state: ArSessionState, sessionInfo: ArSessionRuntimeInfo) => void;
  readonly onStarted?: (
    grantedFeatures: readonly ArFeature[],
    sessionInfo: ArSessionRuntimeInfo,
  ) => void;
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
    readonly originalError?: unknown,
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
  private overlayGranted: boolean | null = null;
  private mode: "immersive-ar" | "immersive-vr" | null = null;
  private supportedModes: readonly ("immersive-ar" | "immersive-vr")[] = [];
  private requestedFeatures: readonly ArFeature[] = [];
  private grantedFeatures: readonly ArFeature[] = [];
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

  /** Read whether the active session was granted its DOM overlay. */
  get sessionInfo(): ArSessionRuntimeInfo {
    const inputSourceTypes = Array.from(
      this.session?.inputSources ?? [],
      (source) => source.hand ? "hand" : source.gamepad ? "controller" : source.targetRayMode,
    );
    return {
      overlayGranted: this.overlayGranted,
      mode: this.mode,
      supportedModes: [...this.supportedModes],
      requestedFeatures: [...this.requestedFeatures],
      grantedFeatures: [...this.grantedFeatures],
      interactionMode: this.session?.interactionMode ?? null,
      environmentBlendMode: this.session?.environmentBlendMode ?? null,
      inputSourceTypes,
      referenceSpaceType: this.mode === "immersive-vr"
        ? this.grantedFeatures.includes("local-floor") ? "local-floor" : "local"
        : this.mode === "immersive-ar" ? "local" : null,
      frameRate: this.session?.frameRate ?? null,
    };
  }

  /** Start the selected immersive mode with only its supported optional features. */
  async start(mode: "immersive-ar" | "immersive-vr" = "immersive-ar"): Promise<ArSessionState> {
    if (this.currentState.status !== "idle") {
      throw new Error(`Cannot start AR while session is ${this.currentState.status}.`);
    }

    const requestedFeatures: readonly ArFeature[] = mode === "immersive-ar"
      ? ["dom-overlay", "hand-tracking", "hit-test"]
      : ["local-floor", "hand-tracking"];
    try {
      this.mode = mode;
      this.requestedFeatures = requestedFeatures;
      this.grantedFeatures = [];
      this.transition({ type: "request", requestedFeatures });
      this.startListeningForTabVisibility();

      const capability = await detectArSupport(this.environment);
      this.supportedModes = capability.supported ? capability.modes : [];
      if (!capability.supported || !capability.modes.includes(mode)) {
        throw new ArSessionStartError(
          "unsupported",
          !capability.supported
            ? capability.reason
            : "This device or browser does not support the requested immersive mode.",
        );
      }

      const session = await this.environment.xr!.requestSession(mode, {
        optionalFeatures: requestedFeatures,
        ...(mode === "immersive-ar" ? { domOverlay: { root: this.options.overlayRoot } } : {}),
      });

      this.session = session;
      session.addEventListener("end", this.onSessionEnd);
      session.addEventListener("visibilitychange", this.onSessionVisibilityChange);

      const enabledFeatures = new Set(Array.from(session.enabledFeatures ?? []));
      const grantedFeatures = requestedFeatures.filter(
        (feature) => enabledFeatures.has(feature),
      );
      this.grantedFeatures = grantedFeatures;
      const overlayGranted = mode === "immersive-ar" && (
        grantedFeatures.includes("dom-overlay")
        || session.domOverlayState !== undefined && session.domOverlayState !== null
      );
      this.overlayGranted = overlayGranted;

      if (this.hiddenDuringRequest || this.environment.visibilityTarget?.hidden) {
        throw new ArSessionStartError(
          "tracking_lost",
          "AR paused when this page was hidden. Returning to screen mode.",
        );
      }

      this.presentationEntered = true;
      await this.options.presentation.enter(session, mode);

      this.startedAt = this.now();
      this.transition({ type: "started", grantedFeatures });
      this.options.onStarted?.(grantedFeatures, this.sessionInfo);
      return this.currentState;
    } catch (error) {
      const reasonCode = error instanceof ArSessionStartError
        ? error.reasonCode
        : errorReason(error);
      if (
        this.currentState.status !== "idle"
        || this.session !== null
        || this.presentationEntered
        || this.documentListening
      ) {
        try {
          await this.finish(reasonCode, true);
        } catch {
          // Preserve the startup error after attempting every available cleanup.
        }
      }
      if (error instanceof ArSessionStartError) {
        throw error;
      }
      throw new ArSessionStartError(
        reasonCode,
        "AR could not be started. You can keep learning in screen mode.",
        error,
      );
    }
  }

  /** End AR and restore the screen presentation without changing lesson state. */
  async stop(): Promise<void> {
    if (this.session) {
      await this.finish(null, true);
    }
  }

  private transition(event: Parameters<typeof transitionArSession>[1]): void {
    this.currentState = transitionArSession(this.currentState, event);
    this.options.onStateChange?.(this.currentState, this.sessionInfo);
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
      let cleanupError: unknown;
      const attempt = async (action: () => void | Promise<void>): Promise<void> => {
        try {
          await action();
        } catch (error) {
          cleanupError ??= error;
        }
      };
      await attempt(() => this.removeListeners());

      if (reasonCode) {
        if (
          this.currentState.status === "requesting"
          || this.currentState.status === "active"
          || this.currentState.status === "ending"
        ) {
          await attempt(() => this.transition({ type: "error", reasonCode }));
        }
        await attempt(() => this.options.onError?.(reasonCode));
      } else if (this.currentState.status === "requesting" || this.currentState.status === "active") {
        await attempt(() => this.transition({ type: "end" }));
      }

      if (endNativeSession && session) {
        await attempt(async () => session.end());
        if (cleanupError && !reasonCode) {
          if (!reasonCode && this.currentState.status === "ending") {
            await attempt(() => this.transition({ type: "error", reasonCode: "unknown" }));
            await attempt(() => this.options.onError?.("unknown"));
          }
        }
      }

      if (this.presentationEntered) {
        await attempt(() => this.options.presentation.exit());
        if (cleanupError && !reasonCode) {
          if (!reasonCode && this.currentState.status === "ending") {
            await attempt(() => this.transition({ type: "error", reasonCode: "unknown" }));
            await attempt(() => this.options.onError?.("unknown"));
          }
        }
      }

      this.presentationEntered = false;
      this.session = null;
      this.overlayGranted = null;
      this.mode = null;
      this.supportedModes = [];
      this.requestedFeatures = [];
      this.grantedFeatures = [];
      this.startedAt = null;
      this.hiddenDuringRequest = false;

      if (this.currentState.status === "error") {
        await attempt(() => this.transition({ type: "reset" }));
      } else if (this.currentState.status === "ending") {
        await attempt(() => this.transition({ type: "ended" }));
      }

      if (startedAt !== null) {
        await attempt(() => this.options.onEnded?.(Math.max(0, (this.now() - startedAt) / 1000)));
      }
      if (cleanupError && !reasonCode) {
        throw cleanupError;
      }
    }).finally(() => {
      this.finishPromise = null;
    });

    return this.finishPromise;
  }
}