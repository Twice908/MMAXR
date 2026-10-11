import { describe, expect, it, vi } from "vitest";
import { consumeSpatialPanelHit } from "../src/visuals/spatial-panel-host.js";

describe("spatial panel ray consumption", () => {
  it("consumes a panel hit without forwarding the ray to the atom picker", () => {
    const action = vi.fn();
    const atomPicker = vi.fn();

    const consumed = consumeSpatialPanelHit(true, "lesson:check", action, atomPicker);

    expect(consumed).toBe(true);
    expect(action).toHaveBeenCalledWith("lesson:check");
    expect(atomPicker).not.toHaveBeenCalled();
  });

  it("forwards a miss to the atom picker", () => {
    const atomPicker = vi.fn();
    expect(consumeSpatialPanelHit(false, null, vi.fn(), atomPicker)).toBe(false);
    expect(atomPicker).toHaveBeenCalledOnce();
  });
});
