import { afterEach, describe, expect, it, vi } from "vitest";
import { setArActiveState } from "../src/active-state.js";
import {
  ArSessionController,
  ArSessionStartError,
  type ArSessionEnvironment,
  type ArSessionHandle,
  type ArSessionPresentation,
  type ArSessionSystem,
} from "../src/session-runtime.js";

class MockSession extends EventTarget implements ArSessionHandle {
  visibilityState: "visible" | "visible-blurred" | "hidden" = "visible";
  readonly enabledFeatures: readonly string[];
  endCalls = 0;

  constructor(enabledFeatures: readonly string[] = ["dom-overlay"]) {
    super();
    this.enabledFeatures = enabledFeatures;
  }

  async end(): Promise<void> {
    this.endCalls += 1;
    this.dispatchEvent(new Event("end"));
  }
}

class MockVisibilityTarget extends EventTarget {
  hidden = false;

  hide(): void {
    this.hidden = true;
    this.dispatchEvent(new Event("visibilitychange"));
  }
}

function setup(options: {
  readonly session?: MockSession;
  readonly secureContext?: boolean;
  readonly supported?: boolean;
  readonly requestError?: unknown;
  readonly enterError?: Error;
} = {}) {
  const session = options.session ?? new MockSession();
  const visibilityTarget = new MockVisibilityTarget();
  const requestSession = vi.fn(async () => {
    if (options.requestError) {
      throw options.requestError;
    }
    return session;
  });
  const xr: ArSessionSystem = {
    isSessionSupported: vi.fn().mockResolvedValue(options.supported ?? true),
    requestSession,
  };
  const environment: ArSessionEnvironment = {
    secureContext: options.secureContext ?? true,
    xr,
    visibilityTarget,
  };
  const presentation: ArSessionPresentation = {
    enter: vi.fn(async () => {
      if (options.enterError) {
        throw options.enterError;
      }
    }),
    exit: vi.fn(),
  };
  const started = vi.fn();
  const ended = vi.fn();
  const errors: string[] = [];
  const activeClasses = new Set<string>();
  const activeTargets = Array.from({ length: 3 }, () => ({
    classList: {
      toggle: (name: string, force?: boolean): boolean => {
        if (force) {
          activeClasses.add(name);
        } else {
          activeClasses.delete(name);
        }
        return activeClasses.has(name);
      },
    },
  }));
  let now = 10;
  const controller = new ArSessionController({
    overlayRoot: {} as HTMLElement,
    environment,
    presentation,
    now: () => now,
    onStarted: started,
    onEnded: ended,
    onError: (reasonCode) => errors.push(reasonCode),
    onStateChange: (state) => setArActiveState(
      state.status === "active" || state.status === "ending",
      activeTargets,
    ),
  });

  return {
    controller,
    ended,
    started,
    errors,
    presentation,
    requestSession,
    session,
    visibilityTarget,
    activeClasses,
    setNow: (value: number) => { now = value; },
  };
}

async function waitForEnd(ended: ReturnType<typeof vi.fn>): Promise<void> {
  await vi.waitFor(() => expect(ended).toHaveBeenCalled());
}

afterEach(() => vi.restoreAllMocks());

describe("ArSessionController", () => {
  it.each(["student exit", "system end", "tracking lost", "hidden tab"])(
    "adds ar-active on start and removes it after %s",
    async (exitPath) => {
      const result = setup();
      await result.controller.start();
      expect(result.activeClasses).toEqual(new Set(["ar-active"]));

      if (exitPath === "student exit") {
        await result.controller.stop();
      } else if (exitPath === "system end") {
        result.session.dispatchEvent(new Event("end"));
        await waitForEnd(result.ended);
      } else if (exitPath === "tracking lost") {
        result.session.visibilityState = "hidden";
        result.session.dispatchEvent(new Event("visibilitychange"));
        await waitForEnd(result.ended);
      } else {
        result.visibilityTarget.hide();
        await waitForEnd(result.ended);
      }

      expect(result.activeClasses).toEqual(new Set());
    },
  );

  it("requests a DOM overlay and starts the presentation only after it is granted", async () => {
    const setupResult = setup();
    const overlayRoot = {} as HTMLElement;
    const controller = new ArSessionController({
      overlayRoot,
      environment: {
        secureContext: true,
        xr: {
          isSessionSupported: vi.fn().mockResolvedValue(true),
          requestSession: setupResult.requestSession,
        },
        visibilityTarget: setupResult.visibilityTarget,
      },
      presentation: setupResult.presentation,
      onStarted: setupResult.started,
    });
    await expect(controller.start()).resolves.toMatchObject({
      status: "active",
      requestedFeatures: ["dom-overlay"],
      grantedFeatures: ["dom-overlay"],
    });
    expect(setupResult.requestSession).toHaveBeenCalledWith("immersive-ar", {
      optionalFeatures: ["dom-overlay"],
      domOverlay: { root: overlayRoot },
    });
    expect(setupResult.presentation.enter).toHaveBeenCalledWith(setupResult.session);
    expect(setupResult.started).toHaveBeenCalledWith(["dom-overlay"]);
  });

  it("returns a named unsupported error before requesting a session", async () => {
    const result = setup({ supported: false });

    await expect(result.controller.start()).rejects.toMatchObject<Partial<ArSessionStartError>>({
      reasonCode: "unsupported",
    });
    expect(result.requestSession).not.toHaveBeenCalled();
    expect(result.presentation.enter).not.toHaveBeenCalled();
    expect(result.controller.state).toEqual({ status: "idle" });
  });

  it("returns to screen mode after permission is denied", async () => {
    const result = setup({ requestError: Object.assign(new Error("denied"), { name: "NotAllowedError" }) });

    await expect(result.controller.start()).rejects.toMatchObject({ reasonCode: "permission_denied" });
    expect(result.errors).toEqual(["permission_denied"]);
    expect(result.presentation.exit).not.toHaveBeenCalled();
    expect(result.controller.state).toEqual({ status: "idle" });
  });

  it("ends a session and returns to screen mode when DOM overlay is not granted", async () => {
    const session = new MockSession([]);
    const result = setup({ session });

    await expect(result.controller.start()).rejects.toMatchObject({
      reasonCode: "dom_overlay_unavailable",
    });
    expect(session.endCalls).toBe(1);
    expect(result.presentation.enter).not.toHaveBeenCalled();
    expect(result.controller.state).toEqual({ status: "idle" });
  });

  it("returns to screen mode when the system ends the session and reports duration", async () => {
    const result = setup();
    await result.controller.start();
    result.setNow(12_510);
    result.session.dispatchEvent(new Event("end"));

    await waitForEnd(result.ended);
    expect(result.ended).toHaveBeenCalledWith(12.5);
    expect(result.presentation.exit).toHaveBeenCalledOnce();
    expect(result.controller.state).toEqual({ status: "idle" });
  });

  it("returns to screen mode after the student exits AR and reports duration", async () => {
    const result = setup();
    await result.controller.start();
    result.setNow(1_010);

    await result.controller.stop();

    expect(result.session.endCalls).toBe(1);
    expect(result.ended).toHaveBeenCalledWith(1);
    expect(result.presentation.exit).toHaveBeenCalledOnce();
    expect(result.controller.state).toEqual({ status: "idle" });
  });

  it("returns to screen mode when tracking is lost", async () => {
    const result = setup();
    await result.controller.start();
    result.session.visibilityState = "hidden";
    result.session.dispatchEvent(new Event("visibilitychange"));

    await waitForEnd(result.ended);
    expect(result.errors).toEqual(["tracking_lost"]);
    expect(result.presentation.exit).toHaveBeenCalledOnce();
    expect(result.controller.state).toEqual({ status: "idle" });
  });

  it("returns to screen mode when the browser tab is hidden", async () => {
    const result = setup();
    await result.controller.start();
    result.visibilityTarget.hide();

    await waitForEnd(result.ended);
    expect(result.errors).toEqual(["tracking_lost"]);
    expect(result.presentation.exit).toHaveBeenCalledOnce();
    expect(result.controller.state).toEqual({ status: "idle" });
  });

  it("cleans up a partially entered presentation after renderer failure", async () => {
    const result = setup({ enterError: new Error("renderer failed") });

    await expect(result.controller.start()).rejects.toMatchObject({ reasonCode: "unknown" });
    expect(result.session.endCalls).toBe(1);
    expect(result.presentation.exit).toHaveBeenCalledOnce();
    expect(result.controller.state).toEqual({ status: "idle" });
  });

  it("keeps an independent lesson snapshot unchanged across start and exit", async () => {
    const result = setup();
    const chemistry = Object.freeze({ protons: 6, neutrons: 6, shells: Object.freeze([2, 4]) });
    const before = structuredClone(chemistry);

    await result.controller.start();
    await result.controller.stop();

    expect(chemistry).toEqual(before);
  });
});