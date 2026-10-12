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
  readonly enabledFeatures: Iterable<string>;
  readonly inputSources: ArrayLike<{
    readonly targetRayMode: string;
    readonly hand?: unknown;
    readonly gamepad?: unknown;
  }> & Iterable<{
    readonly targetRayMode: string;
    readonly hand?: unknown;
    readonly gamepad?: unknown;
  }>;
  endCalls = 0;

  constructor(
    enabledFeatures: Iterable<string> = ["dom-overlay"],
    inputSources: readonly {
      readonly targetRayMode: string;
      readonly hand?: unknown;
      readonly gamepad?: unknown;
    }[] = [],
  ) {
    super();
    this.enabledFeatures = enabledFeatures;
    this.inputSources = makeXrArrayLike(inputSources);
  }

  async end(): Promise<void> {
    this.endCalls += 1;
    this.dispatchEvent(new Event("end"));
  }
}

function makeXrArrayLike<T>(sources: readonly T[]): ArrayLike<T> & Iterable<T> {
  const indexed: Record<number, T> = {};
  sources.forEach((source, index) => { indexed[index] = source; });
  return Object.assign(indexed, {
    length: sources.length,
    [Symbol.iterator]: function* () {
      yield* sources;
    },
  });
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
  readonly supportedModes?: readonly ("immersive-ar" | "immersive-vr")[];
  readonly requestError?: unknown;
  readonly enterError?: Error;
  readonly onEnter?: () => void;
  readonly onExit?: () => void;
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
    isSessionSupported: vi.fn().mockImplementation((mode: "immersive-ar" | "immersive-vr") =>
      Promise.resolve(options.supportedModes
        ? options.supportedModes.includes(mode)
        : options.supported ?? true)),
    requestSession,
  };
  const environment: ArSessionEnvironment = {
    secureContext: options.secureContext ?? true,
    xr,
    visibilityTarget,
  };
  const presentation: ArSessionPresentation = {
    enter: vi.fn(async () => {
      options.onEnter?.();
      if (options.enterError) {
        throw options.enterError;
      }
    }),
    exit: vi.fn(() => {
      options.onExit?.();
    }),
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
      requestedFeatures: ["dom-overlay", "hand-tracking", "hit-test"],
      grantedFeatures: ["dom-overlay"],
    });
    expect(setupResult.requestSession).toHaveBeenCalledWith("immersive-ar", {
      optionalFeatures: ["dom-overlay", "hand-tracking", "hit-test"],
      domOverlay: { root: overlayRoot },
    });
    expect(setupResult.presentation.enter).toHaveBeenCalledWith(setupResult.session, "immersive-ar");
    expect(setupResult.started).toHaveBeenCalledWith(
      ["dom-overlay"],
      expect.objectContaining({ overlayGranted: true, mode: "immersive-ar" }),
    );
  });

  it("records optional hand-tracking when the browser grants it", async () => {
    const session = new MockSession(["dom-overlay", "hand-tracking"]);
    const result = setup({ session });

    await expect(result.controller.start()).resolves.toMatchObject({
      status: "active",
      requestedFeatures: ["dom-overlay", "hand-tracking", "hit-test"],
      grantedFeatures: ["dom-overlay", "hand-tracking"],
    });
    expect(result.started).toHaveBeenCalledWith(
      ["dom-overlay", "hand-tracking"],
      expect.objectContaining({ overlayGranted: true, mode: "immersive-ar" }),
    );
  });

  it("reads input sources from a real-browser-like array-like collection", async () => {
    const session = new MockSession(["dom-overlay"], [
      { targetRayMode: "tracked-pointer", gamepad: {} },
      { targetRayMode: "screen" },
    ]);
    const result = setup({ session });

    await result.controller.start();

    expect(result.controller.sessionInfo.inputSourceTypes).toEqual([
      "controller",
      "screen",
    ]);
    await result.controller.stop();
  });

  it("reads enabled features from an iterable collection", async () => {
    const session = new MockSession(makeXrArrayLike(["dom-overlay", "hand-tracking"]));
    const result = setup({ session });

    await result.controller.start();

    expect(result.controller.state).toMatchObject({
      status: "active",
      grantedFeatures: ["dom-overlay", "hand-tracking"],
    });
    await result.controller.stop();
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

  it("returns to screen mode when VR session startup is denied", async () => {
    const result = setup({
      supportedModes: ["immersive-vr"],
      requestError: Object.assign(new Error("denied"), { name: "NotAllowedError" }),
    });

    await expect(result.controller.start("immersive-vr")).rejects.toMatchObject({
      reasonCode: "permission_denied",
    });
    expect(result.presentation.exit).not.toHaveBeenCalled();
    expect(result.controller.state).toEqual({ status: "idle" });
  });

  it("keeps the AR session active and records when DOM overlay is not granted", async () => {
    const session = new MockSession([]);
    const result = setup({ session });

    await expect(result.controller.start()).resolves.toMatchObject({
      status: "active",
      grantedFeatures: [],
    });
    expect(session.endCalls).toBe(0);
    expect(result.presentation.enter).toHaveBeenCalledWith(session, "immersive-ar");
    expect(result.controller.sessionInfo).toMatchObject({ overlayGranted: false, mode: "immersive-ar" });
    expect(result.started).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ overlayGranted: false, mode: "immersive-ar" }),
    );

    await result.controller.stop();
    expect(session.endCalls).toBe(1);
    expect(result.presentation.exit).toHaveBeenCalledOnce();
    expect(result.controller.sessionInfo).toMatchObject({ overlayGranted: null, mode: null });
  });

  it("starts VR without requesting a DOM overlay and keeps in-scene controls available", async () => {
    const session = new MockSession(["local-floor", "hand-tracking"]);
    const result = setup({ session, supportedModes: ["immersive-vr"] });

    await expect(result.controller.start("immersive-vr")).resolves.toMatchObject({
      status: "active",
      requestedFeatures: ["local-floor", "local", "hand-tracking"],
      grantedFeatures: ["local-floor", "hand-tracking"],
    });
    expect(result.requestSession).toHaveBeenCalledWith("immersive-vr", {
      optionalFeatures: ["local-floor", "local", "hand-tracking"],
    });
    expect(result.presentation.enter).toHaveBeenCalledWith(session, "immersive-vr");
    expect(result.controller.sessionInfo).toMatchObject({ overlayGranted: false, mode: "immersive-vr" });
    await result.controller.stop();
  });

  it("rejects a requested mode that is not supported even if the other mode is", async () => {
    const result = setup({ supportedModes: ["immersive-ar"] });
    await expect(result.controller.start("immersive-vr")).rejects.toMatchObject({
      reasonCode: "unsupported",
    });
    expect(result.requestSession).not.toHaveBeenCalled();
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

  it("restores screen rendering and panels after startup fails midway", async () => {
    let renderLoopRunning = true;
    let domPanelsVisible = true;
    const result = setup({
      enterError: new Error("renderer failed midway"),
      onEnter: () => {
        renderLoopRunning = false;
        domPanelsVisible = false;
      },
      onExit: () => {
        renderLoopRunning = true;
        domPanelsVisible = true;
      },
    });

    await expect(result.controller.start()).rejects.toMatchObject({ reasonCode: "unknown" });
    expect(result.session.endCalls).toBe(1);
    expect(result.presentation.exit).toHaveBeenCalledOnce();
    expect(result.controller.state).toEqual({ status: "idle" });
    expect(renderLoopRunning).toBe(true);
    expect(domPanelsVisible).toBe(true);
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