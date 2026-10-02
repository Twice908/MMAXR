import type { TelemetryContext } from "@mma/engine-core";
import type { ScreenSceneRenderer } from "@mma/engine-render";
import {
  ArSessionController,
  ArSessionStartError,
  detectArSupport,
  type ArErrorReasonCode,
} from "@mma/engine-xr";
import { arTelemetryEventSchema } from "@mma/schema";

export interface ArControlsOptions {
  readonly root: HTMLElement;
  readonly renderer: ScreenSceneRenderer;
  readonly telemetryContext: TelemetryContext;
  readonly clock: () => string;
  readonly idGenerator: () => string;
  readonly recordLocalEvent: (type: string, timestamp: string, detail: string) => void;
}

/** Mount the supported-device AR controls without coupling AR to lesson state. */
export function mountArControls(options: ArControlsOptions): () => Promise<void> {
  const { root, renderer } = options;
  const sceneHeading = root.querySelector<HTMLElement>(".scene-heading");
  if (!sceneHeading) {
    throw new Error("The atom scene heading is missing.");
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
    <div class="ar-confirmation-actions">
      <button type="button" data-ar-action="cancel">Cancel</button>
      <button type="button" data-ar-action="start">Start AR</button>
    </div>
  `;
  root.append(dialog);

  const status = document.createElement("div");
  status.id = "ar-status";
  status.className = "ar-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.hidden = true;
  root.append(status);

  const exitButton = document.createElement("button");
  exitButton.type = "button";
  exitButton.className = "ar-exit";
  exitButton.dataset.arAction = "exit";
  exitButton.textContent = "Exit AR";
  exitButton.hidden = true;
  root.append(exitButton);

  const startButton = actions.querySelector<HTMLButtonElement>("[data-ar-action='explain']");
  if (!startButton) {
    throw new Error("The AR start control could not be created.");
  }

  let disposed = false;
  const setStatus = (message: string): void => {
    status.textContent = message;
    status.hidden = message.length === 0;
  };
  const recordEvent = (type: "ar_session_started" | "ar_session_ended" | "ar_error", payload: Record<string, unknown>): void => {
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
      root.classList.toggle("is-ar", inAr);
      exitButton.hidden = !inAr;
      exitButton.disabled = state.status !== "active";
      startButton.disabled = state.status === "requesting" || inAr;
      if (state.status === "active") {
        setStatus("");
      }
    },
    onStarted: (grantedFeatures) => {
      recordEvent("ar_session_started", { grantedFeatures: [...grantedFeatures] });
    },
    onEnded: (durationSec) => recordEvent("ar_session_ended", { durationSec }),
    onError: (reasonCode) => {
      recordEvent("ar_error", { reasonCode });
      if (!disposed) {
        setStatus(arFailureMessage(reasonCode));
      }
    },
  });

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
    }
  };
  root.addEventListener("click", onAction);

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
    if (dialog.open) {
      dialog.close();
    }
    await controller.stop();
    root.classList.remove("is-ar");
    actions.remove();
    supportMessage.remove();
    dialog.remove();
    status.remove();
    exitButton.remove();
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