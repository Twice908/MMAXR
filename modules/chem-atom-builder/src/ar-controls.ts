import type { TelemetryContext } from "@mma/engine-core";
import { shouldShowSpatialSettingsFallback, type ScreenSceneRenderer } from "@mma/engine-render";
import {
  ArSessionController,
  ArSessionStartError,
  detectArSupport,
  setArActiveState,
  type ArErrorReasonCode,
  type ArSessionHandle,
  type ArSessionRuntimeInfo,
} from "@mma/engine-xr";
import { arTelemetryEventSchema } from "@mma/schema";

export interface ArControlsOptions {
  readonly root: HTMLElement;
  readonly renderer: ScreenSceneRenderer;
  readonly telemetryContext: TelemetryContext;
  readonly clock: () => string;
  readonly idGenerator: () => string;
  readonly getActiveMissionId: () => string | null;
  readonly publishComfortBreakShown: (missionId: string | null) => void;
  readonly recordLocalEvent: (type: string, timestamp: string, detail: string) => void;
  readonly onSpatialActiveChange?: (
    active: boolean,
    sessionInfo: ArSessionRuntimeInfo,
    session: ArSessionHandle | null,
  ) => void;
  readonly onSpatialExpandedChange?: (expanded: boolean) => void;
  readonly diagnostics?: boolean;
}

const comfortBreakDelayMs = 10 * 60 * 1000;

export interface XrDiagnosticsData {
  readonly supportedModes: readonly string[];
  readonly requestedFeatures: readonly string[];
  readonly grantedFeatures: readonly string[];
  readonly overlayGranted: boolean | null;
  readonly interactionMode: string | null;
  readonly environmentBlendMode: string | null;
  readonly inputSourceTypes: readonly string[];
  readonly referenceSpaceType: string | null;
  readonly frameRate: number | null;
  readonly lastErrorMessage?: string | null;
  readonly lastErrorStack?: string | null;
}

/** Build a PII-free, copyable XR support and session report. */
export function buildXrDiagnosticsText(data: XrDiagnosticsData): string {
  return [
    `Supported session modes: ${data.supportedModes.join(", ") || "none"}`,
    `Requested features: ${data.requestedFeatures.join(", ") || "none"}`,
    `Granted features: ${data.grantedFeatures.join(", ") || "none"}`,
    `DOM overlay granted: ${data.overlayGranted === null ? "unknown" : data.overlayGranted ? "yes" : "no"}`,
    `Interaction mode: ${data.interactionMode ?? "unavailable"}`,
    `Environment blend mode: ${data.environmentBlendMode ?? "unavailable"}`,
    `Input sources: ${data.inputSourceTypes.join(", ") || "none"}`,
    `Reference space: ${data.referenceSpaceType ?? "unavailable"}`,
    `Frame rate: ${data.frameRate === null ? "unavailable" : `${data.frameRate} Hz`}`,
    `Last XR error: ${data.lastErrorMessage || "none"}`,
    `Last XR error stack:\n${data.lastErrorStack || "unavailable"}`,
  ].join("\n");
}

function diagnosticErrorDetails(error: unknown): { message: string; stack: string } {
  const cause = error instanceof ArSessionStartError ? error.originalError : undefined;
  const source = cause ?? error;
  const redact = (text: string): string => text
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted]")
    .replace(/\b\+?\d[\d .()-]{8,}\d\b/g, "[redacted]")
    .replace(/([?&][\w.-]+=)[^&\s)]+/g, "$1[redacted]")
    .replace(/\/Users\/[^/\s)]+/g, "/Users/[redacted]");
  if (source instanceof Error) {
    return {
      message: redact(source.message || source.name),
      stack: redact(source.stack ?? `${source.name}: ${source.message}`),
    };
  }
  return { message: redact(String(source)), stack: "unavailable" };
}

/** Enable temporary XR diagnostics only for an explicit URL query flag. */
export function isXrDiagnosticsEnabled(search: string): boolean {
  return new URLSearchParams(search).get("xrdebug") === "1";
}

/** Schedule one comfort reminder and return a function that cancels it. */
export function scheduleComfortBreakReminder(onReminder: () => void): () => void {
  const timeout = globalThis.setTimeout(onReminder, comfortBreakDelayMs);
  return () => globalThis.clearTimeout(timeout);
}

/** Mount the supported-device AR controls without coupling AR to lesson state. */
export function mountArControls(options: ArControlsOptions): () => Promise<void> {
  const { root, renderer } = options;
  const builder = root.querySelector<HTMLElement>(".atom-builder");
  const sceneHeading = root.querySelector<HTMLElement>(".scene-heading");
  if (!builder || !sceneHeading) {
    throw new Error("The Atom Builder AR controls could not find their host elements.");
  }

  const actions = document.createElement("div");
  actions.className = "scene-actions";
  actions.innerHTML = `
    <button type="button" class="ar-start" data-ar-action="explain" data-session-mode="immersive-ar" hidden>Enter AR</button>
    <button type="button" class="ar-start" data-ar-action="explain" data-session-mode="immersive-vr" hidden>Enter VR</button>
  `;
  sceneHeading.append(actions);

  const supportMessage = document.createElement("p");
  supportMessage.id = "ar-support-message";
  supportMessage.className = "ar-support-message";
  supportMessage.setAttribute("role", "status");
  supportMessage.setAttribute("aria-live", "polite");
  supportMessage.hidden = true;
  sceneHeading.after(supportMessage);

  const dialog = document.createElement("dialog");
  dialog.id = "ar-confirmation";
  dialog.className = "ar-confirmation";
  dialog.setAttribute("aria-labelledby", "ar-confirmation-title");
  dialog.innerHTML = `
    <h2 id="ar-confirmation-title">View the atom in AR?</h2>
    <p id="ar-confirmation-description">Your camera shows the real world so the atom can appear in front of you. Nothing is recorded or uploaded.</p>
    <p>Stay seated, look around you, and keep an eye on your surroundings.</p>
    <div class="ar-confirmation-actions">
      <button type="button" aria-label="Cancel" data-ar-action="cancel">Cancel</button>
      <button type="button" aria-label="Start session" data-ar-action="start">Start</button>
    </div>
  `;
  builder.append(dialog);

  const status = document.createElement("div");
  status.id = "ar-status";
  status.className = "ar-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.hidden = true;
  root.append(status);

  const arPanel = document.createElement("section");
  arPanel.className = "ar-overlay-panel is-collapsed";
  arPanel.setAttribute("aria-label", "Lesson controls");
  arPanel.hidden = true;
  arPanel.innerHTML = `
    <header class="ar-panel-heading">
      <p class="ar-panel-mission-title" id="ar-panel-mission-title"></p>
      <button type="button" data-ar-action="reset-view">Reset view</button>
      <button type="button" data-ar-action="panel-toggle" aria-expanded="false">Show panel</button>
    </header>
  `;
  builder.append(arPanel);

  const panelContents = [
    root.querySelector<HTMLElement>("#lesson-panel"),
    root.querySelector<HTMLElement>(".narration-hud"),
    root.querySelector<HTMLElement>("#assessment-card"),
    root.querySelector<HTMLElement>("#lesson-summary"),
    root.querySelector<HTMLElement>("#free-play-status"),
    root.querySelector<HTMLElement>(".particle-rail"),
  ];
  if (panelContents.some((element) => !element)) {
    throw new Error("The Atom Builder lesson controls could not be found.");
  }
  const panelPlacements = panelContents.map((element) => {
    const parent = element!.parentNode;
    if (!parent) {
      throw new Error("An Atom Builder lesson control is detached.");
    }
    return { element: element!, parent, nextSibling: element!.nextSibling };
  });
  const panelToggle = arPanel.querySelector<HTMLButtonElement>("[data-ar-action='panel-toggle']");
  const panelMissionTitle = arPanel.querySelector<HTMLElement>("#ar-panel-mission-title");
  if (!panelToggle || !panelMissionTitle) {
    throw new Error("The AR lesson panel could not be created.");
  }
  let panelMounted = false;
  const setPanelCollapsed = (collapsed: boolean): void => {
    arPanel.classList.toggle("is-collapsed", collapsed);
    panelToggle.textContent = collapsed ? "Show panel" : "Hide panel";
    panelToggle.setAttribute("aria-expanded", String(!collapsed));
    options.onSpatialExpandedChange?.(!collapsed);
  };
  const mountPanel = (showDomOverlay: boolean): void => {
    if (panelMounted) {
      return;
    }
    for (const { element } of panelPlacements) {
      arPanel.append(element);
    }
    arPanel.hidden = !showDomOverlay;
    setPanelCollapsed(true);
    panelMounted = true;
  };
  const unmountPanel = (): void => {
    if (!panelMounted) {
      return;
    }
    for (const { element, parent, nextSibling } of [...panelPlacements].reverse()) {
      parent.insertBefore(element, nextSibling?.parentNode === parent ? nextSibling : null);
    }
    arPanel.hidden = true;
    arPanel.classList.add("is-collapsed");
    panelMounted = false;
  };

  const exitButton = document.createElement("button");
  exitButton.type = "button";
  exitButton.className = "ar-exit";
  exitButton.dataset.arAction = "exit";
  exitButton.textContent = "Exit AR";
  exitButton.hidden = true;
  root.append(exitButton);

  const settingsFallbackButton = document.createElement("button");
  settingsFallbackButton.type = "button";
  settingsFallbackButton.className = "spatial-settings-fallback ar-spatial-settings-fallback";
  settingsFallbackButton.textContent = "Settings";
  settingsFallbackButton.hidden = true;
  root.append(settingsFallbackButton);

  const debugEnabled = isXrDiagnosticsEnabled(globalThis.location?.search ?? "");
  const diagnostics = debugEnabled ? document.createElement("section") : null;
  const diagnosticsText = debugEnabled ? document.createElement("pre") : null;
  const diagnosticsCopy = debugEnabled ? document.createElement("button") : null;
  if (diagnostics) {
    diagnostics.className = "ar-diagnostics";
    diagnostics.setAttribute("aria-label", "AR diagnostics");
    diagnostics.setAttribute("role", "region");
    diagnostics.hidden = false;
    diagnostics.style.cssText = "position:fixed;z-index:1000;right:12px;bottom:12px;max-width:min(34rem,90vw);padding:12px;border:1px solid rgba(255,255,255,.84);border-radius:16px;background:rgba(255,255,255,.96);color:#272331;font:12px/1.4 monospace;white-space:pre-wrap;backdrop-filter:blur(12px)";
    if (diagnosticsText && diagnosticsCopy) {
      diagnosticsText.id = "xr-debug-report";
      diagnosticsText.style.cssText = "margin:0;white-space:pre-wrap";
      diagnosticsCopy.type = "button";
      diagnosticsCopy.textContent = "Copy report";
      diagnosticsCopy.dataset.arAction = "copy-xr-report";
      diagnostics.append(diagnosticsText, diagnosticsCopy);
    }
    root.append(diagnostics);
  }

  const startButton = actions.querySelector<HTMLButtonElement>(
    "[data-ar-action='explain'][data-session-mode='immersive-ar']",
  );
  const vrButton = actions.querySelector<HTMLButtonElement>(
    "[data-ar-action='explain'][data-session-mode='immersive-vr']",
  );
  const confirmationTitle = dialog.querySelector<HTMLElement>("#ar-confirmation-title");
  const confirmationDescription = dialog.querySelector<HTMLElement>("#ar-confirmation-description");
  const confirmStartButton = dialog.querySelector<HTMLButtonElement>("[data-ar-action='start']");
  if (!startButton || !vrButton || !confirmationTitle || !confirmationDescription || !confirmStartButton) {
    throw new Error("The immersive session controls could not be created.");
  }

  let disposed = false;
  const activeTargets = [document.documentElement, document.body, root];
  let sessionState = "idle";
  let spatialActive = false;
  let activeXrSession: ArSessionHandle | null = null;
  let selectedMode: "immersive-ar" | "immersive-vr" = "immersive-ar";
  let activeMode: "immersive-ar" | "immersive-vr" = "immersive-ar";
  let telemetryMode: "immersive-ar" | "immersive-vr" = "immersive-ar";
  let grantedFeatures: readonly string[] = [];
  let supportedModes: readonly string[] = [];
  let latestSessionInfo: ArSessionRuntimeInfo | null = null;
  let lastXrErrorMessage: string | null = null;
  let lastXrErrorStack: string | null = null;
  let diagnosticsRefresh: ReturnType<typeof globalThis.setInterval> | null = null;
  let xrInputSession: ArSessionHandle | null = null;
  let statusDismissTimeout: ReturnType<typeof globalThis.setTimeout> | null = null;
  const updateDiagnostics = (): string => {
    const report = buildXrDiagnosticsText({
      supportedModes,
      requestedFeatures: latestSessionInfo?.requestedFeatures ?? [],
      grantedFeatures,
      overlayGranted: latestSessionInfo?.overlayGranted ?? null,
      interactionMode: latestSessionInfo?.interactionMode ?? null,
      environmentBlendMode: latestSessionInfo?.environmentBlendMode ?? null,
      inputSourceTypes: latestSessionInfo?.inputSourceTypes ?? [],
      referenceSpaceType: latestSessionInfo?.referenceSpaceType ?? null,
      frameRate: latestSessionInfo?.frameRate ?? null,
      lastErrorMessage: lastXrErrorMessage,
      lastErrorStack: lastXrErrorStack,
    });
    if (diagnosticsText) diagnosticsText.textContent = report;
    root.dispatchEvent(new Event("mma:xr-diagnostics-update"));
    return report;
  };
  const onInputSourcesChange = (): void => {
    latestSessionInfo = controller.sessionInfo;
    updateDiagnostics();
  };
  let cancelComfortBreak: (() => void) | null = null;
  const setStatus = (message: string, autoDismissMs?: number): void => {
    if (statusDismissTimeout !== null) globalThis.clearTimeout(statusDismissTimeout);
    statusDismissTimeout = null;
    status.textContent = message;
    status.hidden = message.length === 0;
    if (message && autoDismissMs !== undefined) {
      statusDismissTimeout = globalThis.setTimeout(() => {
        statusDismissTimeout = null;
        setStatus("");
      }, autoDismissMs);
    }
  };
  const recordEvent = (type: "ar_session_started" | "ar_session_ended" | "ar_error", payload: Record<string, unknown>): void => {
    if (disposed) {
      return;
    }
    const event = arTelemetryEventSchema.parse({
      ...options.telemetryContext,
      eventId: options.idGenerator(),
      ts: options.clock(),
      device: {
        ...options.telemetryContext.device,
        mode: (type === "ar_session_ended" ? telemetryMode : activeMode) === "immersive-vr" ? "vr" : "ar",
      },
      type,
      payload,
    });
    const detail = "grantedFeatures" in event.payload
      ? event.payload.grantedFeatures.join(", ") || "none"
      : "durationSec" in event.payload
        ? `${event.payload.durationSec.toFixed(1)} seconds`
        : "reasonCode" in event.payload
          ? event.payload.reasonCode
          : "-";
    options.recordLocalEvent(event.type, event.ts, detail);
  };
  const controller = new ArSessionController({
    overlayRoot: root,
    presentation: {
      enter: async (session, mode) => {
        activeXrSession = session;
        await renderer.enterARSession(session, mode);
      },
      exit: async () => {
        await renderer.exitARSession();
        activeXrSession = null;
      },
    },
    onStateChange: (state, sessionInfo) => {
      if (disposed) {
        return;
      }
      const inAr = state.status === "active" || state.status === "ending";
      const spatialShouldBeActive = state.status === "active";
      sessionState = state.status;
      latestSessionInfo = sessionInfo;
      grantedFeatures = state.status === "active" ? state.grantedFeatures : [];
      setArActiveState(inAr, activeTargets);
      if (inAr) {
        mountPanel(sessionInfo.overlayGranted === true);
      } else {
        if (state.status === "idle") {
          activeMode = "immersive-ar";
        }
        unmountPanel();
        breakReminder.hidden = true;
        cancelComfortBreak?.();
        cancelComfortBreak = null;
      }
      exitButton.textContent = sessionInfo.mode === "immersive-vr" ? "Exit VR" : "Exit AR";
      exitButton.hidden = !inAr || sessionInfo.overlayGranted !== true;
      settingsFallbackButton.hidden = sessionInfo.overlayGranted !== true
        || !shouldShowSpatialSettingsFallback(spatialShouldBeActive, false);
      exitButton.disabled = state.status !== "active";
      startButton.disabled = state.status === "requesting" || inAr;
      vrButton.disabled = state.status === "requesting" || inAr;
      if (diagnostics) {
        diagnostics.hidden = inAr && sessionInfo.overlayGranted === false;
        if (inAr) updateDiagnostics();
      }
      if (spatialActive !== spatialShouldBeActive) {
        spatialActive = spatialShouldBeActive;
        options.onSpatialActiveChange?.(
          spatialActive,
          sessionInfo,
          spatialActive ? activeXrSession : null,
        );
      }
      if (diagnostics) {
        diagnostics.hidden = inAr && sessionInfo.overlayGranted === false;
        if (!inAr) {
          if (diagnosticsRefresh !== null) globalThis.clearInterval(diagnosticsRefresh);
          diagnosticsRefresh = null;
          xrInputSession?.removeEventListener("inputsourceschange", onInputSourcesChange);
          xrInputSession = null;
        } else {
          if (activeXrSession !== xrInputSession) {
            xrInputSession?.removeEventListener("inputsourceschange", onInputSourcesChange);
            xrInputSession = activeXrSession;
            xrInputSession?.addEventListener("inputsourceschange", onInputSourcesChange);
          }
          updateDiagnostics();
          if (diagnosticsRefresh === null) {
            diagnosticsRefresh = globalThis.setInterval(() => {
              latestSessionInfo = controller.sessionInfo;
              updateDiagnostics();
            }, 1000);
          }
        }
      }
      if (state.status === "active") {
        setStatus("");
      }
    },
    onStarted: (grantedFeatures, sessionInfo) => {
      activeMode = sessionInfo.mode ?? "immersive-ar";
      recordEvent("ar_session_started", {
        mode: activeMode,
        grantedFeatures: [...grantedFeatures],
      });
      cancelComfortBreak?.();
      cancelComfortBreak = scheduleComfortBreakReminder(() => {
        cancelComfortBreak = null;
        if (disposed || sessionState !== "active") {
          return;
        }
        options.publishComfortBreakShown(options.getActiveMissionId());
        const reminder = root.querySelector<HTMLElement>("#ar-break-reminder");
        if (reminder) {
          reminder.hidden = false;
        }
      });
    },
    onEnded: (durationSec) => recordEvent("ar_session_ended", { durationSec }),
    onError: (reasonCode) => {
      recordEvent("ar_error", { reasonCode });
      if (!disposed) {
        setStatus(arFailureMessage(reasonCode, activeMode), 6000);
      }
    },
  });
  const onSpatialRuntimeError = (event: Event): void => {
    if (disposed) return;
    const details = diagnosticErrorDetails((event as CustomEvent<unknown>).detail);
    lastXrErrorMessage = details.message;
    lastXrErrorStack = details.stack;
    updateDiagnostics();
    void controller.stop().then(() => {
      if (!disposed) setStatus(arFailureMessage("unknown", activeMode), 6000);
    }).catch(() => {
      if (!disposed) setStatus(arFailureMessage("unknown", activeMode), 6000);
    });
  };
  root.addEventListener("mma:xr-runtime-error", onSpatialRuntimeError);

  if (diagnostics) {
    updateDiagnostics();
  }

  const breakReminder = document.createElement("div");
  breakReminder.id = "ar-break-reminder";
  breakReminder.className = "ar-break-reminder";
  breakReminder.setAttribute("role", "status");
  breakReminder.setAttribute("aria-live", "polite");
  breakReminder.textContent = "Take a short break";
  breakReminder.hidden = true;
  root.append(breakReminder);

  const onAction = (event: MouseEvent): void => {
    const action = (event.target as Element | null)
      ?.closest<HTMLElement>("[data-ar-action]")?.dataset.arAction;
    if (action === "explain") {
      selectedMode = (event.target as Element | null)
        ?.closest<HTMLElement>("[data-session-mode]")?.dataset.sessionMode === "immersive-vr"
        ? "immersive-vr"
        : "immersive-ar";
      const isVr = selectedMode === "immersive-vr";
      confirmationTitle.textContent = isVr ? "View the atom in VR?" : "View the atom in AR?";
      confirmationDescription.textContent = isVr
        ? "The atom and lesson panels appear in front of you. Nothing is recorded or uploaded."
        : "Your camera shows the real world so the atom can appear in front of you. Nothing is recorded or uploaded.";
      confirmStartButton.textContent = isVr ? "Start VR" : "Start AR";
      confirmStartButton.setAttribute("aria-label", isVr ? "Start VR" : "Start AR");
      setStatus("");
      dialog.showModal();
    } else if (action === "copy-xr-report") {
      const clipboard = navigator.clipboard;
      if (!clipboard?.writeText) {
        setStatus("Clipboard is unavailable. You can select and copy the report text.");
        return;
      }
      void clipboard.writeText(updateDiagnostics()).then(() => {
        setStatus("XR report copied.");
      }).catch((error: unknown) => {
        setStatus(error instanceof Error ? `Could not copy XR report: ${error.message}` : "Could not copy XR report.");
      });
    } else if (action === "cancel") {
      dialog.close();
    } else if (action === "start") {
      dialog.close();
      activeMode = selectedMode;
      telemetryMode = selectedMode;
      setStatus(selectedMode === "immersive-vr" ? "Starting VR..." : "Starting AR...");
      void controller.start(selectedMode).catch((error: unknown) => {
        if (!disposed) {
          const details = diagnosticErrorDetails(error);
          lastXrErrorMessage = details.message;
          lastXrErrorStack = details.stack;
          updateDiagnostics();
          setStatus(error instanceof ArSessionStartError
            ? arFailureMessage(error.reasonCode, selectedMode)
            : arFailureMessage("unknown", selectedMode), 6000);
        }
      });
    } else if (action === "exit") {
      exitButton.disabled = true;
      void controller.stop().catch(() => {
        if (!disposed) {
          setStatus("AR has ended. You are back in screen mode.", 6000);
        }
      });
    } else if (action === "panel-toggle") {
      setPanelCollapsed(!arPanel.classList.contains("is-collapsed"));
    } else if (action === "reset-view") {
      renderer.resetArView();
    } else if (action === "settings-fallback") {
      const toggle = arPanel.querySelector<HTMLButtonElement>("[data-ar-action='panel-toggle']");
      const opening = !root.classList.contains("spatial-dom-settings-open");
      root.classList.toggle("spatial-dom-settings-open", opening);
      if (opening
        ? arPanel.classList.contains("is-collapsed")
        : !arPanel.classList.contains("is-collapsed")) {
        toggle?.click();
      }
    }
  };
  const onBeforeXrSelect = (event: Event): void => {
    event.preventDefault();
  };
  root.addEventListener("click", onAction);
  settingsFallbackButton.dataset.arAction = "settings-fallback";
  root.addEventListener("beforexrselect", onBeforeXrSelect);

  void detectArSupport().then((result) => {
    if (disposed) {
      return;
    }
    supportedModes = result.supported ? result.modes : [];
    updateDiagnostics();
    startButton.hidden = !result.supported || !result.modes.includes("immersive-ar");
    vrButton.hidden = !result.supported || !result.modes.includes("immersive-vr");
    const touchFirst = !globalThis.matchMedia("(any-pointer: fine)").matches;
    vrButton.textContent = touchFirst ? "VR with viewer" : "Enter VR";
    if (touchFirst) {
      vrButton.title = "Needs a phone VR viewer";
      vrButton.setAttribute("aria-label", "VR with viewer. Needs a phone VR viewer");
    } else {
      vrButton.removeAttribute("title");
      vrButton.removeAttribute("aria-label");
    }
    supportMessage.textContent = result.supported ? "" : result.reason;
    supportMessage.hidden = result.supported;
  }).catch(() => {
    if (!disposed) {
      supportMessage.textContent = "AR support could not be checked. You can keep learning in screen mode.";
      supportMessage.hidden = false;
    }
  });

  return async () => {
    disposed = true;
    root.removeEventListener("mma:xr-runtime-error", onSpatialRuntimeError);
    if (statusDismissTimeout !== null) globalThis.clearTimeout(statusDismissTimeout);
    statusDismissTimeout = null;
    root.removeEventListener("click", onAction);
    root.removeEventListener("beforexrselect", onBeforeXrSelect);
    cancelComfortBreak?.();
    cancelComfortBreak = null;
    if (diagnosticsRefresh !== null) globalThis.clearInterval(diagnosticsRefresh);
    xrInputSession?.removeEventListener("inputsourceschange", onInputSourcesChange);
    if (dialog.open) {
      dialog.close();
    }
    await controller.stop();
    if (spatialActive) options.onSpatialActiveChange?.(false, controller.sessionInfo, null);
    unmountPanel();
    setArActiveState(false, activeTargets);
    renderer.setArDiagnosticsListener(null);
    actions.remove();
    supportMessage.remove();
    dialog.remove();
    arPanel.remove();
    status.remove();
    exitButton.remove();
    settingsFallbackButton.remove();
    breakReminder.remove();
    diagnostics?.remove();
  };
}

function arFailureMessage(
  reasonCode: ArErrorReasonCode,
  mode: "immersive-ar" | "immersive-vr" = "immersive-ar",
): string {
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
