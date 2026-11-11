import { describe, expect, it } from "vitest";
import { isStaleChunkError, reloadForStaleBuild } from "./stale-build.js";

describe("stale build recovery", () => {
  it("recognises missing-chunk errors from each browser", () => {
    expect(isStaleChunkError(new TypeError("Failed to fetch dynamically imported module: https://x/assets/a.js"))).toBe(true);
    expect(isStaleChunkError(new TypeError("error loading dynamically imported module"))).toBe(true);
    expect(isStaleChunkError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isStaleChunkError(new Error("The XR scene is not ready."))).toBe(false);
  });

  it("reloads once, then lets a repeat failure show as an error", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value) };
    let reloads = 0;
    const reload = (): void => {
      reloads += 1;
    };
    const error = new TypeError("Failed to fetch dynamically imported module: x");
    expect(reloadForStaleBuild(error, { storage, now: 1_000_000, reload })).toBe(true);
    expect(reloadForStaleBuild(error, { storage, now: 1_010_000, reload })).toBe(false);
    expect(reloadForStaleBuild(error, { storage, now: 1_100_000, reload })).toBe(true);
    expect(reloads).toBe(2);
    expect(reloadForStaleBuild(new Error("other"), { storage, now: 2_000_000, reload })).toBe(false);
  });
});
