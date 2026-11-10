import type { TelemetryContext } from "@mma/engine-core";
import {
  ArSessionController,
  ArSessionStartError,
  detectArSupport,
  setArActiveState,
  type ArErrorReasonCode,
  type ArSessionHandle,
  type ArSessionRuntimeInfo,
} from "@mma/engine-xr";
import { arTelemetryEventSchema, type ArTelemetryEvent } from "@mma/schema";
import { el } from "./dom.js";

/**
 * Shared AR/VR session controls for modules: Enter AR / Enter VR buttons, a consent
 * dialog, status messages, the comfort-break reminder, Exit, and session telemetry.
 * Generalised from the Atom Builder's AR controls (which stay in that module).
 */

/** Immersive session modes the controls can start. */
export type XrSessionMode = "immersive-ar" | "immersive-vr";

/** What the controls need from the renderer: hand a session over and take it back. */
export interface XrSessionRenderer {
  enterARSession(session: EventTarget, mode: XrSessionMode): Promise<void>;
  exitARSession(): Promise<void>;
}

/** Options for {@link mountXrSession}. */
export interface XrSessionOptions {
  /** Module root. It becomes the phone AR DOM overlay and gets the `ar-active` class. */
  readonly root: HTMLElement;
  /** Where the Enter AR / Enter VR buttons go (for example the model's toolbar). */
  readonly entrySlot: HTMLElement;
  /** Where the Exit button goes during phone AR (for example the AR HUD's top bar). */
  readonly exitSlot: HTMLElement;
  /** What appears in front of the student, for the consent text: "the model". */
  readonly subject: string;
  readonly renderer: XrSessionRenderer;
  readonly telemetryContext: TelemetryContext;
  readonly clock: () => string;
  readonly idGenerator: () => string;
  /** Called once when a comfort break is due (the module records `comfort_break_shown`). */
  readonly onComfortBreak?: () => void;
  /** Receives validated `ar_session_started`, `ar_session_ended` and `ar_error` events. */
  readonly onTelemetry?: (event: ArTelemetryEvent) => void;
  /** Called when a session becomes active or ends. `overlay` is true for phone AR with a DOM overlay. */
  readonly onActiveChange: (active: boolean, info: XrSessionInfo) => void;
}

/** Facts about the running session that the module's UI depends on. */
export interface XrSessionInfo {
  readonly mode: XrSessionMode;
  /** True when the DOM overlay was granted (phone AR): show the page HUD, not in-scene panels. */
  readonly overlay: boolean;
}

/** A mounted set of session controls. */
export interface XrSessionControls {
  /** Start the session flow for a mode, as the Enter buttons do (asks for consent first). */
  request(mode: XrSessionMode): void;
  /** End the running session. */
  exit(): Promise<void>;
  dispose(): Promise<void>;
}

/** Ten minutes, per the comfort rules: remind students to take a break. */
export const COMFORT_BREAK_DELAY_MS = 10 * 60 * 1000;

/** Plain-language message for a failed or ended session. */
export function xrFailureMessage(reasonCode: ArErrorReasonCode, mode: XrSessionMode): string {
  if (mode === "immersive-vr") {
    switch (reasonCode) {
      case "permission_denied":
        return "VR access was not allowed. You can keep learning in screen mode.";
      case "tracking_lost":
        return "VR tracking was lost. You are back in screen mode.";
      case "unsupported":
        return "VR is not available here. You can keep learning in screen mode.";
      case "dom_overlay_unavailable":
      case "unknown":
        return "VR could not continue. You are back in screen mode.";
    }
  }
  switch (reasonCode) {
    case "permission_denied":
      return "Camera access was not allowed. You can keep learning in screen mode.";
    case "tracking_lost":
      return "AR tracking was lost. You are back in screen mode.";
    case "unsupported":
      return "AR is not available here. You can keep learning in screen mode.";
    case "dom_overlay_unavailable":
      return "AR controls are unavailable on this device. You are back in screen mode.";
    case "unknown":
      return "AR could not continue. You are back in screen mode.";
  }
}

/** Consent dialog wording for a mode. Nothing is recorded or uploaded in either mode. */
export function xrConsentText(mode: XrSessionMode, subject: string): { title: string; body: string; start: string } {
  return mode === "immersive-vr"
    ? {
      title: `View ${subject} in VR?`,
      body: `${capitalise(subject)} and the lesson panels appear in front of you. Nothing is recorded or uploaded.`,
      start: "Start VR",
    }
    : {
      title: `View ${subject} in AR?`,
      body: `Your camera shows the real world so ${subject} can appear in front of you. Nothing is recorded or uploaded.`,
      start: "Start AR",
    };
}

/** Touch-only devices (phones, tablets) have no fine pointer. Phone VR stays hidden on them. */
export function isTouchFirstDevice(
  matchMedia: (query: string) => { matches: boolean } = (query) => globalThis.matchMedia(query),
): boolean {
  return !matchMedia("(any-pointer: fine)").matches;
}

/** Mount the session controls. Screen mode keeps working whether or not AR/VR is available. */
export function mountXrSession(options: XrSessionOptions): XrSessionControls {
  const { root } = options;
  const doc = root.ownerDocument;

  const entry = el(doc, "div", "mma-xr-entry");
  const arButton = el(doc, "button", "mma-button mma-button--primary", "Enter AR");
  const vrButton = el(doc, "button", "mma-button mma-button--secondary", "Enter VR");
  for (const [button, mode] of [[arButton, "immersive-ar"], [vrButton, "immersive-vr"]] as const) {
    button.type = "button";
    button.hidden = true;
    button.dataset.xrRequest = mode;
    entry.append(button);
  }
  options.entrySlot.append(entry);

  const support = el(doc, "p", "mma-xr-support");
  support.setAttribute("role", "status");
  support.hidden = true;
  options.entrySlot.after(support);

  const dialog = el(doc, "dialog", "mma-xr-consent mma-ui");
  dialog.setAttribute("aria-labelledby", "mma-xr-consent-title");
  const title = el(doc, "h2", "");
  title.id = "mma-xr-consent-title";
  const body = el(doc, "p", "");
  const safety = el(doc, "p", "", "Stay seated, look around you, and keep an eye on your surroundings.");
  const actions = el(doc, "div", "mma-xr-consent__actions");
  const cancel = el(doc, "button", "mma-button mma-button--secondary", "Cancel");
  cancel.type = "button";
  const start = el(doc, "button", "mma-button mma-button--primary", "Start");
  start.type = "button";
  actions.append(cancel, start);
  dialog.append(title, body, safety, actions);
  root.append(dialog);

  const status = el(doc, "p", "mma-xr-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.hidden = true;
  root.append(status);

  const breakReminder = el(doc, "p", "mma-xr-break", "Time for a short break. Look away from the screen for a minute.");
  breakReminder.setAttribute("role", "status");
  breakReminder.hidden = true;
  root.append(breakReminder);

  const exitButton = el(doc, "button", "mma-button mma-xr-exit", "Exit AR");
  exitButton.type = "button";
  exitButton.hidden = true;
  options.exitSlot.append(exitButton);

  const activeTargets = [doc.documentElement, doc.body, root];
  let disposed = false;
  let selectedMode: XrSessionMode = "immersive-ar";
  let activeMode: XrSessionMode = "immersive-ar";
  let active = false;
  let statusTimeout: ReturnType<typeof setTimeout> | null = null;
  let breakTimeout: ReturnType<typeof setTimeout> | null = null;

  const setStatus = (message: string, autoDismissMs?: number): void => {
    if (statusTimeout !== null) clearTimeout(statusTimeout);
    statusTimeout = null;
    status.textContent = message;
    status.hidden = message === "";
    if (message && autoDismissMs !== undefined) {
      statusTimeout = setTimeout(() => setStatus(""), autoDismissMs);
    }
  };

  const record = (type: "ar_session_started" | "ar_session_ended" | "ar_error", payload: Record<string, unknown>): void => {
    if (disposed) return;
    options.onTelemetry?.(arTelemetryEventSchema.parse({
      ...options.telemetryContext,
      eventId: options.idGenerator(),
      ts: options.clock(),
      device: { ...options.telemetryContext.device, mode: activeMode === "immersive-vr" ? "vr" : "ar" },
      type,
      payload,
    }));
  };

  const info = (sessionInfo: ArSessionRuntimeInfo): XrSessionInfo => ({
    mode: sessionInfo.mode ?? activeMode,
    overlay: sessionInfo.overlayGranted === true,
  });

  const controller = new ArSessionController({
    overlayRoot: root,
    presentation: {
      enter: async (session: ArSessionHandle, mode) => {
        await options.renderer.enterARSession(session as unknown as EventTarget, mode);
      },
      exit: async () => {
        await options.renderer.exitARSession();
      },
    },
    onStateChange: (state, sessionInfo) => {
      if (disposed) return;
      const inSession = state.status === "active" || state.status === "ending";
      setArActiveState(inSession, activeTargets);
      root.classList.toggle("xr-vr-active", inSession && sessionInfo.mode === "immersive-vr");
      exitButton.textContent = sessionInfo.mode === "immersive-vr" ? "Exit VR" : "Exit AR";
      exitButton.hidden = !inSession || sessionInfo.overlayGranted !== true;
      exitButton.disabled = state.status !== "active";
      arButton.disabled = state.status === "requesting" || inSession;
      vrButton.disabled = state.status === "requesting" || inSession;
      const nowActive = state.status === "active";
      if (nowActive !== active) {
        active = nowActive;
        if (!active) {
          breakReminder.hidden = true;
          if (breakTimeout !== null) clearTimeout(breakTimeout);
          breakTimeout = null;
        }
        options.onActiveChange(active, info(sessionInfo));
      }
      if (nowActive) setStatus("");
    },
    onStarted: (granted, sessionInfo) => {
      activeMode = sessionInfo.mode ?? activeMode;
      record("ar_session_started", { mode: activeMode, grantedFeatures: [...granted] });
      if (breakTimeout !== null) clearTimeout(breakTimeout);
      breakTimeout = setTimeout(() => {
        breakTimeout = null;
        if (disposed || !active) return;
        breakReminder.hidden = false;
        options.onComfortBreak?.();
      }, COMFORT_BREAK_DELAY_MS);
    },
    onEnded: (durationSec) => record("ar_session_ended", { durationSec }),
    onError: (reasonCode) => {
      record("ar_error", { reasonCode });
      if (!disposed) setStatus(xrFailureMessage(reasonCode, activeMode), 6000);
    },
  });

  const request = (mode: XrSessionMode): void => {
    selectedMode = mode;
    const text = xrConsentText(mode, options.subject);
    title.textContent = text.title;
    body.textContent = text.body;
    start.textContent = text.start;
    setStatus("");
    dialog.showModal();
  };

  const exit = async (): Promise<void> => {
    exitButton.disabled = true;
    try {
      await controller.stop();
    } catch {
      if (!disposed) setStatus("The session has ended. You are back in screen mode.", 6000);
    }
  };

  const onEntryClick = (event: MouseEvent): void => {
    const mode = (event.target as Element | null)?.closest<HTMLElement>("[data-xr-request]")?.dataset.xrRequest;
    if (mode === "immersive-ar" || mode === "immersive-vr") request(mode);
  };
  const onCancel = (): void => dialog.close();
  const onStart = (): void => {
    dialog.close();
    activeMode = selectedMode;
    setStatus(selectedMode === "immersive-vr" ? "Starting VR..." : "Starting AR...");
    void controller.start(selectedMode).catch((error: unknown) => {
      if (disposed) return;
      setStatus(xrFailureMessage(error instanceof ArSessionStartError ? error.reasonCode : "unknown", selectedMode), 6000);
    });
  };
  const onExit = (): void => void exit();
  // Taps on the DOM overlay must not also fire an XR "select" in the scene.
  const onBeforeXrSelect = (event: Event): void => event.preventDefault();

  entry.addEventListener("click", onEntryClick);
  cancel.addEventListener("click", onCancel);
  start.addEventListener("click", onStart);
  exitButton.addEventListener("click", onExit);
  root.addEventListener("beforexrselect", onBeforeXrSelect);

  void detectArSupport().then((result) => {
    if (disposed) return;
    arButton.hidden = !result.supported || !result.modes.includes("immersive-ar");
    // Phone VR needs a Cardboard-style viewer; hidden until that mode is designed (ADR 0006).
    vrButton.hidden = !result.supported || !result.modes.includes("immersive-vr") || isTouchFirstDevice();
    support.textContent = result.supported ? "" : result.reason;
    support.hidden = result.supported;
  }).catch(() => {
    if (disposed) return;
    support.textContent = "AR support could not be checked. You can keep learning in screen mode.";
    support.hidden = false;
  });

  return {
    request,
    exit,
    async dispose() {
      disposed = true;
      if (statusTimeout !== null) clearTimeout(statusTimeout);
      if (breakTimeout !== null) clearTimeout(breakTimeout);
      entry.removeEventListener("click", onEntryClick);
      cancel.removeEventListener("click", onCancel);
      start.removeEventListener("click", onStart);
      exitButton.removeEventListener("click", onExit);
      root.removeEventListener("beforexrselect", onBeforeXrSelect);
      if (dialog.open) dialog.close();
      await controller.stop();
      if (active) options.onActiveChange(false, { mode: activeMode, overlay: false });
      setArActiveState(false, activeTargets);
      for (const element of [entry, support, dialog, status, breakReminder, exitButton]) element.remove();
    },
  };
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
