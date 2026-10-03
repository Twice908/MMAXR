import type { TelemetryContext } from "@mma/engine-core";
import type { ScreenSceneRenderer } from "@mma/engine-render";
import {
  ArSessionController,
  ArSessionStartError,
  detectArSupport,
  setArActiveState,
  type ArErrorReasonCode,
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
  readonly diagnostics?: boolean;
}

const comfortBreakDelayMs = 10 * 60 * 1000;

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
  actions.innerHTML = '<button type="button" class="ar-start" data-ar-action="explain" hidden>View in AR</button>';
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
    <p>Your camera shows the real world so the atom can appear in front of you. Nothing is recorded or uploaded.</p>
    <p>Stay seated, look around you, and keep an eye on your surroundings.</p>
    <div class="ar-confirmation-actions">
      <button type="button" aria-label="Cancel AR" data-ar-action="cancel">Cancel</button>
      <button type="button" aria-label="Start AR" data-ar-action="start">Start AR</button>
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
  };
  const mountPanel = (): void => {
    if (panelMounted) {
      return;
    }
    for (const { element } of panelPlacements) {
      arPanel.append(element);
    }
    arPanel.hidden = false;
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

  const diagnostics = options.diagnostics ? document.createElement("output") : null;
  if (diagnostics) {
    diagnostics.className = "ar-diagnostics";
    diagnostics.setAttribute("aria-label", "AR diagnostics");
    diagnostics.setAttribute("aria-live", "off");
    diagnostics.hidden = true;
    root.append(diagnostics);
  }

  const startButton = actions.querySelector<HTMLButtonElement>("[data-ar-action='explain']");
  if (!startButton) {
    throw new Error("The AR start control could not be created.");
  }

  let disposed = false;
  const activeTargets = [document.documentElement, document.body, root];
  let sessionState = "idle";
  let grantedFeatures: readonly string[] = [];
  let cancelComfortBreak: (() => void) | null = null;
  const setStatus = (message: string): void => {
    status.textContent = message;
    status.hidden = message.length === 0;
  };
  const recordEvent = (type: "ar_session_started" | "ar_session_ended" | "ar_error", payload: Record<string, unknown>): void => {
    if (disposed) {
      return;
    }
    const event = arTelemetryEventSchema.parse({
      ...options.telemetryContext,
      eventId: options.idGenerator(),
      ts: options.clock(),
      device: { ...options.telemetryContext.device, mode: "ar" },
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
      enter: (session) => renderer.enterARSession(session),
      exit: () => renderer.exitARSession(),
    },
    onStateChange: (state) => {
      if (disposed) {
        return;
      }
      const inAr = state.status === "active" || state.status === "ending";
      setArActiveState(inAr, activeTargets);
      sessionState = state.status;
      grantedFeatures = state.status === "active" ? state.grantedFeatures : [];
      if (inAr) {
        mountPanel();
      } else {
        unmountPanel();
        breakReminder.hidden = true;
        cancelComfortBreak?.();
        cancelComfortBreak = null;
      }
      exitButton.hidden = !inAr;
      exitButton.disabled = state.status !== "active";
      startButton.disabled = state.status === "requesting" || inAr;
      if (diagnostics) {
        diagnostics.hidden = !inAr;
      }
      if (state.status === "active") {
        setStatus("");
      }
    },
    onStarted: (grantedFeatures) => {
      recordEvent("ar_session_started", { grantedFeatures: [...grantedFeatures] });
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
        setStatus(arFailureMessage(reasonCode));
      }
    },
  });

  if (diagnostics) {
    renderer.setArDiagnosticsListener((facts) => {
      diagnostics.textContent = [
        `state ${sessionState}`,
        `blend ${facts.environmentBlendMode}`,
        `granted ${grantedFeatures.join(", ") || "none"}`,
        `atom ${facts.atomVisible && facts.atomInCameraView ? "visible" : "not visible"}`,
        `anchor ${formatPosition(facts.atomPosition)}`,
        `camera ${formatPosition(facts.cameraPosition)}`,
        `loop ${facts.renderLoopRunning ? "running" : "stopped"}`,
        `session ${facts.sessionAttached ? "attached" : "detached"}`,
        `scene ${facts.sceneBackground}`,
        `clear ${facts.clearColor}/${facts.clearAlpha}`,
        `canvas ${facts.canvasDisplay}`,
      ].join(" | ");
    });
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
      setStatus("");
      dialog.showModal();
    } else if (action === "cancel") {
      dialog.close();
    } else if (action === "start") {
      dialog.close();
      setStatus("Starting AR...");
      void controller.start().catch((error: unknown) => {
        if (!disposed) {
          setStatus(error instanceof ArSessionStartError
            ? arFailureMessage(error.reasonCode)
            : error instanceof Error
              ? error.message
              : "AR could not be started. You can keep learning in screen mode.");
        }
      });
    } else if (action === "exit") {
      exitButton.disabled = true;
      void controller.stop().catch(() => {
        if (!disposed) {
          setStatus("AR has ended. You are back in screen mode.");
        }
      });
    } else if (action === "panel-toggle") {
      setPanelCollapsed(!arPanel.classList.contains("is-collapsed"));
    }
  };
  const onBeforeXrSelect = (event: Event): void => {
    event.preventDefault();
  };
  root.addEventListener("click", onAction);
  root.addEventListener("beforexrselect", onBeforeXrSelect);

  void detectArSupport().then((result) => {
    if (disposed) {
      return;
    }
    startButton.hidden = !result.supported;
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
    root.removeEventListener("click", onAction);
    root.removeEventListener("beforexrselect", onBeforeXrSelect);
    cancelComfortBreak?.();
    cancelComfortBreak = null;
    if (dialog.open) {
      dialog.close();
    }
    await controller.stop();
    unmountPanel();
    setArActiveState(false, activeTargets);
    renderer.setArDiagnosticsListener(null);
    actions.remove();
    supportMessage.remove();
    dialog.remove();
    arPanel.remove();
    status.remove();
    exitButton.remove();
    breakReminder.remove();
    diagnostics?.remove();
  };
}

function arFailureMessage(reasonCode: ArErrorReasonCode): string {
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

function formatPosition(position: Readonly<{ x: number; y: number; z: number }>): string {
  return `${position.x.toFixed(2)},${position.y.toFixed(2)},${position.z.toFixed(2)}`;
}