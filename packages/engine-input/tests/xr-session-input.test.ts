import { describe, expect, it, vi } from "vitest";
import { XrSessionInputAdapter } from "../src/xr-session-input.js";

function makeSource(targetRayMode: XRInputSource["targetRayMode"] = "tracked-pointer"): XRInputSource {
  return {
    targetRayMode,
    targetRaySpace: {} as XRSpace,
    handedness: "none",
    hand: null,
    gamepad: null,
  } as XRInputSource;
}

function makeFrame(): XRFrame {
  return {
    predictedDisplayTime: 16,
    getPose: () => ({
      transform: {
        position: { x: 0, y: 0, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      },
    }),
  } as unknown as XRFrame;
}

function makeInputSources<T>(sources: readonly T[]): ArrayLike<T> & Iterable<T> {
  const indexed = Object.fromEntries(sources.map((source, index) => [index, source]));
  return Object.assign(indexed, {
    length: sources.length,
    [Symbol.iterator]: function* () {
      yield* sources;
    },
  });
}

function makeSession(sources: XRInputSource[] = []): XRSession {
  return Object.assign(new EventTarget(), {
    inputSources: makeInputSources(sources),
    requestReferenceSpace: vi.fn(async () => ({} as XRReferenceSpace)),
    requestAnimationFrame: vi.fn(() => 1),
    cancelAnimationFrame: vi.fn(),
  }) as unknown as XRSession;
}

function sourcesChange(added: readonly XRInputSource[], removed: readonly XRInputSource[]): Event {
  return Object.assign(new Event("inputsourceschange"), {
    added: makeInputSources(added),
    removed: makeInputSources(removed),
  });
}

describe("XR session input adapter", () => {
  it("tracks sources added and removed during an active session", async () => {
    const session = makeSession();
    const adapter = new XrSessionInputAdapter({
      dispatch: vi.fn(),
      pick: vi.fn(() => null),
      handlePanelRay: vi.fn(() => false),
    });
    const added = vi.fn();
    const removed = vi.fn();
    adapter.on("sourceAdded", added);
    adapter.on("sourceRemoved", removed);

    await adapter.setSession(session);
    const source = makeSource();
    Object.defineProperty(session, "inputSources", {
      configurable: true,
      value: makeInputSources([source]),
    });
    session.dispatchEvent(sourcesChange([source], []));
    expect(added).toHaveBeenCalledOnce();

    Object.defineProperty(session, "inputSources", {
      configurable: true,
      value: makeInputSources([]),
    });
    session.dispatchEvent(sourcesChange([], [source]));
    expect(removed).toHaveBeenCalledOnce();

    adapter.dispose();
  });

  it("routes a transient-pointer select to a spatial panel button", async () => {
    const session = makeSession();
    const onPanelAction = vi.fn();
    const source = makeSource("transient-pointer");
    const phases = new Map<string, "move" | "down" | "up" | "cancel">();
    const adapter = new XrSessionInputAdapter({
      dispatch: vi.fn(),
      pick: vi.fn(() => ({ target: "shell:1" })),
      handlePanelRay: (_ray, phase, sourceId) => {
        phases.set(sourceId, phase);
        if (phase === "up" && phases.get(sourceId) === "up") onPanelAction("lesson:check");
        return phase === "down" || phase === "up";
      },
    });
    await adapter.setSession(session);

    session.dispatchEvent(Object.assign(new Event("select"), {
      inputSource: source,
      frame: makeFrame(),
    }));

    expect(onPanelAction).toHaveBeenCalledWith("lesson:check");
    adapter.dispose();
  });

  it("consumes a panel hover before invoking the atom picker", async () => {
    const source = makeSource();
    const picker = vi.fn(() => ({ target: "shell:1" }));
    const adapter = new XrSessionInputAdapter({
      dispatch: vi.fn(),
      pick: picker,
      handlePanelRay: vi.fn(() => true),
    });
    await adapter.setSession(makeSession([source]));

    adapter.update(makeFrame());

    expect(picker).not.toHaveBeenCalled();
    adapter.dispose();
  });

  it("uses target-ray poses and not renderer controller slots", async () => {
    const source = makeSource();
    const pose = vi.fn(() => ({
      transform: {
        position: { x: 0, y: 0, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      },
    }));
    const frame = { predictedDisplayTime: 16, getPose: pose } as unknown as XRFrame;
    const session = makeSession([source]);
    const adapter = new XrSessionInputAdapter({
      dispatch: vi.fn(),
      pick: vi.fn(() => null),
      handlePanelRay: vi.fn(() => false),
    });
    await adapter.setSession(session);

    adapter.update(frame);

    expect(pose).toHaveBeenCalledWith(source.targetRaySpace, expect.anything());
    adapter.dispose();
  });
});
