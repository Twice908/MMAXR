import {
  type TelemetryContext,
} from "@mma/engine-core";
import {
  cameraViewTelemetryEventSchema,
  type CameraViewErrorReasonCode,
} from "@mma/schema";
import { setScreenRendererTransparentBackground } from "@mma/engine-render";

const localTelemetryEventName = "mma:local-telemetry";

/** Host elements and local telemetry services for the screen camera view. */
export interface CameraViewOptions {
  readonly root: HTMLElement;
  readonly sceneHost: HTMLElement;
  readonly telemetryContext: TelemetryContext;
  readonly clock: () => string;
  readonly idGenerator: () => string;
  readonly diagnostics?: boolean;
  readonly environment?: CameraViewEnvironment;
}

/** Browser capabilities injected for deterministic camera-view testing. */
export interface CameraViewEnvironment {
  readonly secureContext: boolean;
  readonly hasFinePointer: boolean;
  readonly supportsImmersiveAr: () => Promise<boolean>;
  readonly getUserMedia: ((constraints: MediaStreamConstraints) => Promise<MediaStream>) | null;
  readonly document: Document;
  readonly now: () => number;
}

/** Camera-view availability and a student-facing reason when unavailable. */
export interface CameraViewCapability {
  readonly available: boolean;
  readonly reason: string;
}

/** Check if browser-only camera view is available without entering WebXR. */
export async function detectCameraViewCapability(
  environment: Pick<CameraViewEnvironment,
    "secureContext" | "hasFinePointer" | "supportsImmersiveAr" | "getUserMedia">,
): Promise<CameraViewCapability> {
  if (!environment.secureContext) {
    return { available: false, reason: "Camera view needs a secure page (HTTPS or localhost)." };
  }
  if (!environment.getUserMedia) {
    return { available: false, reason: "This browser does not provide camera access." };
  }
  const immersiveArSupported = await environment.supportsImmersiveAr().catch(() => false);
  if (immersiveArSupported && !environment.hasFinePointer) {
    return {
      available: false,
      reason: "Camera view is hidden because immersive AR is available on a touch-first device.",
    };
  }
  return { available: true, reason: "" };
}

/** Map standard browser media errors to local, non-identifying reason codes. */
export function cameraViewErrorReason(error: unknown): CameraViewErrorReasonCode {
  const name = error instanceof Error ? error.name : "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return "permission_denied";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "no_camera";
    case "NotReadableError":
    case "TrackStartError":
      return "camera_in_use";
    case "AbortError":
    case "OverconstrainedError":
    case "ConstraintNot satisfied":
      return "device_unavailable";
    default:
      return "unknown";
  }
}

/** Stop every track in a stream and detach it from its video element. */
export function stopCameraStream(
  stream: MediaStream | null,
  video: HTMLVideoElement | null,
): void {
  if (stream) {
    for (const track of stream.getTracks()) {
      track.onended = null;
      track.stop();
    }
  }
  if (video) {
    video.pause();
    video.srcObject = null;
    video.remove();
  }
}

/** Mount the screen-only camera view controls and return their teardown. */
export function mountCameraView(options: CameraViewOptions): () => void {
  const { root, sceneHost } = options;
  const environment = options.environment ?? browserCameraEnvironment();
  const document = environment.document;
  const idGenerator = options.idGenerator;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "camera-view-entry";
  button.textContent = "Camera view";
  button.hidden = true;

  const reason = document.createElement("p");
  reason.className = "camera-view-reason";
  reason.setAttribute("role", "status");
  reason.hidden = true;

  const dialog = document.createElement("dialog");
  dialog.className = "ar-confirmation camera-view-confirmation";
  dialog.setAttribute("aria-labelledby", "camera-view-title");
  dialog.innerHTML = `
    <h2 id="camera-view-title">Start camera view?</h2>
    <p>Your camera is shown on this screen only. Nothing is recorded or uploaded.</p>
    <div class="ar-confirmation-actions">
      <button type="button" data-camera-action="cancel">Cancel</button>
      <button type="button" data-camera-action="start">Start</button>
    </div>
  `;

  const exit = document.createElement("button");
  exit.type = "button";
  exit.className = "camera-view-exit";
  exit.textContent = "Exit camera view";
  exit.hidden = true;

  const status = document.createElement("p");
  status.className = "camera-view-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.hidden = true;

  const diagnostic = options.diagnostics
    ? document.createElement("p")
    : null;
  if (diagnostic) {
    diagnostic.className = "camera-view-diagnostic";
    diagnostic.hidden = true;
    const eventsPanel = root.querySelector<HTMLElement>("#dev-event-panel");
    if (!eventsPanel) {
      throw new Error("Camera view diagnostics could not find the dev event panel.");
    }
    eventsPanel.append(diagnostic);
  }

  const heading = root.querySelector<HTMLElement>(".scene-heading");
  if (!heading) {
    throw new Error("Camera view controls could not find the scene heading.");
  }
  heading.append(button, reason);
  root.append(dialog, exit, status);

  let disposed = false;
  let starting = false;
  let requestToken = 0;
  let stream: MediaStream | null = null;
  let video: HTMLVideoElement | null = null;
  let activeSince: number | null = null;

  const setStatus = (message: string): void => {
    status.textContent = message;
    status.hidden = message.length === 0;
  };
  const emitTelemetry = (
    type: "camera_view_started" | "camera_view_ended",
    durationSec: number,
    errorReasonCode: CameraViewErrorReasonCode,
  ): void => {
    const event = cameraViewTelemetryEventSchema.parse({
      ...options.telemetryContext,
      eventId: idGenerator(),
      ts: options.clock(),
      type,
      payload: { durationSec, errorReasonCode },
    });
    root.dispatchEvent(new CustomEvent(localTelemetryEventName, {
      bubbles: true,
      detail: event,
    }));
  };
  const removeActivePresentation = (): void => {
    for (const target of [document.documentElement, document.body, root]) {
      target.classList.remove("camera-active");
    }
    setScreenRendererTransparentBackground(sceneHost, false);
  };
  const cleanStream = (): void => {
    stopCameraStream(stream, video);
    stream = null;
    video = null;
    exit.hidden = true;
    removeActivePresentation();
  };
  const endCameraView = (
    errorReasonCode: CameraViewErrorReasonCode,
    message: string,
  ): void => {
    if (activeSince === null && !starting && !stream) {
      return;
    }
    const durationSec = activeSince === null
      ? 0
      : Math.max(0, (environment.now() - activeSince) / 1000);
    activeSince = null;
    starting = false;
    requestToken += 1;
    cleanStream();
    if (!disposed) {
      button.hidden = false;
      reason.hidden = true;
    }
    setStatus(message);
    emitTelemetry("camera_view_ended", durationSec, errorReasonCode);
  };
  const startCameraView = async (): Promise<void> => {
    if (!environment.getUserMedia || starting || activeSince !== null) {
      return;
    }
    starting = true;
    const token = ++requestToken;
    setStatus("Starting camera view...");
    try {
      const acquiredStream = await environment.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "user" } },
      });
      if (disposed || token !== requestToken || environment.document.hidden) {
        for (const track of acquiredStream.getTracks()) track.stop();
        if (!disposed && token === requestToken && environment.document.hidden) {
          endCameraView("page_hidden", "Camera view stopped because this tab is hidden. You are back in screen mode.");
        }
        return;
      }
      stream = acquiredStream;
      const cameraVideo = environment.document.createElement("video");
      video = cameraVideo;
      cameraVideo.className = "camera-view-video";
      cameraVideo.autoplay = true;
      cameraVideo.muted = true;
      cameraVideo.playsInline = true;
      const facingMode = stream.getVideoTracks()[0]?.getSettings().facingMode;
      cameraVideo.classList.toggle("camera-view-video--mirrored", !facingMode || facingMode === "user");
      cameraVideo.srcObject = stream;
      sceneHost.insertBefore(cameraVideo, sceneHost.firstChild);
      for (const track of stream.getVideoTracks()) {
        track.onended = () => {
          if (!disposed && activeSince !== null) {
            endCameraView("device_unavailable", "The camera disconnected. You are back in screen mode.");
          }
        };
      }
      for (const target of [document.documentElement, document.body, root]) {
        target.classList.add("camera-active");
      }
      setScreenRendererTransparentBackground(sceneHost, true);
      await cameraVideo.play();
      if (disposed || !starting) {
        cleanStream();
        return;
      }
      if (stream.getVideoTracks().some((track) => track.readyState === "ended")) {
        throw new DOMException("The camera disconnected.", "NotReadableError");
      }
      starting = false;
      activeSince = environment.now();
      button.hidden = true;
      reason.hidden = true;
      exit.hidden = false;
      setStatus("");
      emitTelemetry("camera_view_started", 0, "none");
    } catch (error) {
      if (disposed || token !== requestToken) {
        return;
      }
      const errorReasonCode = cameraViewErrorReason(error);
      starting = false;
      cleanStream();
      setStatus(cameraViewFailureMessage(errorReasonCode));
      emitTelemetry("camera_view_ended", 0, errorReasonCode);
    }
  };
  const onVisibilityChange = (): void => {
    if (environment.document.hidden) {
      endCameraView("page_hidden", "Camera view stopped because this tab is hidden. You are back in screen mode.");
    }
  };
  const onPageHide = (): void => {
    endCameraView("page_hidden", "Camera view stopped. You are back in screen mode.");
  };
  const isCameraHudTarget = (target: EventTarget | null): boolean =>
    target instanceof Element && target.closest(
      ".builder-header, .lesson-panel, .narration-hud, .particle-rail, .atom-inspector, " +
      ".scene-heading, .assessment-card, .lesson-summary, .free-play-status, .dev-events-toggle, " +
      ".dev-event-panel, .camera-view-entry, .camera-view-exit, .camera-view-confirmation, .camera-view-status",
    ) !== null;
  const onCameraHudInput = (event: Event): void => {
    if (!root.classList.contains("camera-active") || !isCameraHudTarget(event.target)) {
      return;
    }
    event.stopPropagation();
    if (event.type === "wheel") {
      event.preventDefault();
    }
  };
  const onButtonClick = (): void => {
    setStatus("");
    dialog.showModal();
  };
  const onDialogClick = (event: MouseEvent): void => {
    const action = (event.target as Element | null)
      ?.closest<HTMLElement>("[data-camera-action]")?.dataset.cameraAction;
    if (action === "cancel") {
      dialog.close();
    } else if (action === "start") {
      dialog.close();
      void startCameraView();
    }
  };
  const onExitClick = (): void => {
    endCameraView("none", "Camera view ended. You are back in screen mode.");
  };
  button.addEventListener("click", onButtonClick);
  dialog.addEventListener("click", onDialogClick);
  exit.addEventListener("click", onExitClick);
  environment.document.addEventListener("visibilitychange", onVisibilityChange);
  environment.document.defaultView?.addEventListener("pagehide", onPageHide);
  root.addEventListener("pointerdown", onCameraHudInput, true);
  root.addEventListener("pointermove", onCameraHudInput, true);
  root.addEventListener("pointerup", onCameraHudInput, true);
  root.addEventListener("pointercancel", onCameraHudInput, true);
  root.addEventListener("mousedown", onCameraHudInput, true);
  root.addEventListener("mousemove", onCameraHudInput, true);
  root.addEventListener("wheel", onCameraHudInput, { capture: true, passive: false });

  void detectCameraViewCapability(environment).then((capability) => {
    if (disposed) return;
    button.hidden = !capability.available;
    reason.textContent = capability.reason;
    reason.hidden = capability.available || capability.reason.length === 0;
    if (!capability.available && capability.reason && options.diagnostics) {
      const message = `Camera view hidden: ${capability.reason}`;
      console.info(message);
      if (diagnostic) {
        diagnostic.textContent = message;
        diagnostic.hidden = false;
      }
    }
  });

  return () => {
    disposed = true;
    button.removeEventListener("click", onButtonClick);
    dialog.removeEventListener("click", onDialogClick);
    exit.removeEventListener("click", onExitClick);
    environment.document.removeEventListener("visibilitychange", onVisibilityChange);
    environment.document.defaultView?.removeEventListener("pagehide", onPageHide);
    root.removeEventListener("pointerdown", onCameraHudInput, true);
    root.removeEventListener("pointermove", onCameraHudInput, true);
    root.removeEventListener("pointerup", onCameraHudInput, true);
    root.removeEventListener("pointercancel", onCameraHudInput, true);
    root.removeEventListener("mousedown", onCameraHudInput, true);
    root.removeEventListener("mousemove", onCameraHudInput, true);
    root.removeEventListener("wheel", onCameraHudInput, true);
    if (dialog.open) dialog.close();
    if (activeSince !== null || stream) {
      endCameraView("none", "");
    } else {
      cleanStream();
    }
    button.remove();
    reason.remove();
    dialog.remove();
    exit.remove();
    status.remove();
    diagnostic?.remove();
  };
}

function browserCameraEnvironment(): CameraViewEnvironment {
  const getUserMedia = navigator.mediaDevices?.getUserMedia;
  return {
    secureContext: globalThis.isSecureContext,
    hasFinePointer: matchMedia("(any-pointer: fine)").matches,
    supportsImmersiveAr: async () => {
      const xr = (navigator as Navigator & {
        readonly xr?: { isSessionSupported(mode: "immersive-ar"): Promise<boolean> };
      }).xr;
      if (!xr) return false;
      try {
        return await xr.isSessionSupported("immersive-ar");
      } catch {
        return false;
      }
    },
    getUserMedia: getUserMedia ? getUserMedia.bind(navigator.mediaDevices) : null,
    document,
    now: () => performance.now(),
  };
}

function cameraViewFailureMessage(reason: CameraViewErrorReasonCode): string {
  switch (reason) {
    case "permission_denied":
      return "Camera access was not allowed. You can keep learning without camera view.";
    case "no_camera":
      return "No camera was found. You can keep learning without camera view.";
    case "camera_in_use":
      return "The camera is busy in another app. Close it and try again.";
    case "device_unavailable":
      return "The camera is unavailable. You can keep learning without camera view.";
    case "page_hidden":
      return "Camera view stopped because this tab is hidden. You are back in screen mode.";
    case "unsupported":
      return "Camera view is not available here. You can keep learning in screen mode.";
    case "none":
      return "Camera view ended. You are back in screen mode.";
    case "unknown":
      return "Camera view could not start. You can keep learning without camera view.";
  }
}
