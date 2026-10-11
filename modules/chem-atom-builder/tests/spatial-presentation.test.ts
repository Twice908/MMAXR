import { describe, expect, it, vi } from "vitest";
import {
  isSpatialPresentationMode,
  setSpatialPanelsDomHidden,
  tryCreateSpatialPanels,
} from "../src/spatial-presentation.js";

function fakeRoot(): HTMLElement {
  return {
    classList: { toggle: vi.fn() },
  } as unknown as HTMLElement;
}

describe("spatial panel DOM fallback", () => {
  it("activates only for AR and Camera presentations", () => {
    expect(isSpatialPresentationMode("screen")).toBe(false);
    expect(isSpatialPresentationMode("ar")).toBe(true);
    expect(isSpatialPresentationMode("camera")).toBe(true);
  });

  it("hides and restores DOM panel surfaces through the active root class", () => {
    const root = fakeRoot();

    setSpatialPanelsDomHidden(root, true);
    setSpatialPanelsDomHidden(root, false);

    expect(root.classList.toggle).toHaveBeenNthCalledWith(1, "spatial-panels-active", true);
    expect(root.classList.toggle).toHaveBeenNthCalledWith(2, "spatial-panels-active", false);
  });

  it("keeps the DOM fallback when panel creation fails", () => {
    const root = fakeRoot();
    const error = new Error("canvas texture failure");
    const onFailure = vi.fn(() => setSpatialPanelsDomHidden(root, false));

    const session = tryCreateSpatialPanels(() => {
      setSpatialPanelsDomHidden(root, true);
      throw error;
    }, onFailure);

    expect(session).toBeNull();
    expect(onFailure).toHaveBeenCalledWith(error);
    expect(root.classList.toggle).toHaveBeenLastCalledWith("spatial-panels-active", false);
  });
});
