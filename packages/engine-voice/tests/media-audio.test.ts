import { describe, expect, it } from "vitest";
import {
  configureNarrationAudioElement,
  createBrowserNarrationAudioEngine,
} from "../src/media-audio.js";

class FakeAudioElement extends EventTarget {
  src = "";
  preload = "";
  currentTime = 0;
  duration = 4;
  playbackRate = 1;
  muted = false;
  preservesPitch = false;
  webkitPreservesPitch = false;
  mozPreservesPitch = false;
  playCalls = 0;
  pauseCalls = 0;

  load(): void {}

  play(): Promise<void> {
    this.playCalls += 1;
    return Promise.resolve();
  }

  pause(): void {
    this.pauseCalls += 1;
  }

  removeAttribute(name: string): void {
    if (name === "src") {
      this.src = "";
    }
  }
}

describe("HTML narration media engine", () => {
  it.each([0.75, 1, 1.25] as const)("sets pitch preservation and playbackRate at %sx", async (speed) => {
    const element = new FakeAudioElement();
    const engine = createBrowserNarrationAudioEngine({
      createAudioElement: () => element as unknown as HTMLAudioElement,
      createObjectUrl: () => "blob:test-narration",
      revokeObjectUrl: () => undefined,
    });
    expect(await engine.resume()).toBe(true);
    const source = await engine.decode(new ArrayBuffer(4));
    const playback = engine.play(source, speed, () => undefined);
    await playback.started;

    expect(element.preservesPitch).toBe(true);
    expect(element.webkitPreservesPitch).toBe(true);
    expect(element.mozPreservesPitch).toBe(true);
    expect(element.playbackRate).toBe(speed);
    await engine.close();
  });

  it("uses the element currentTime as media-time caption position", async () => {
    const element = new FakeAudioElement();
    const engine = createBrowserNarrationAudioEngine({
      createAudioElement: () => element as unknown as HTMLAudioElement,
      createObjectUrl: () => "blob:test-narration",
      revokeObjectUrl: () => undefined,
    });
    await engine.resume();
    const source = await engine.decode(new ArrayBuffer(4));
    const playback = engine.play(source, 0.75, () => undefined);
    await playback.started;
    element.currentTime = 2.5;

    expect(playback.currentTimeMs?.()).toBe(2_500);
    await engine.close();
  });

  it("can change rate without disabling pitch preservation", () => {
    const element = new FakeAudioElement();
    configureNarrationAudioElement(element as unknown as HTMLAudioElement, 1);
    configureNarrationAudioElement(element as unknown as HTMLAudioElement, 1.25);

    expect(element.playbackRate).toBe(1.25);
    expect(element.preservesPitch).toBe(true);
    expect(element.webkitPreservesPitch).toBe(true);
    expect(element.mozPreservesPitch).toBe(true);
  });
});