import { describe, expect, it } from "vitest";
import { nextHudTab } from "../src/xr-hud.js";
import { COMFORT_BREAK_DELAY_MS, isTouchFirstDevice, xrConsentText, xrFailureMessage } from "../src/xr-session.js";

describe("XR session wording", () => {
  it("asks for consent in plain words and says nothing is recorded", () => {
    expect(xrConsentText("immersive-ar", "the model")).toEqual({
      title: "View the model in AR?",
      body: "Your camera shows the real world so the model can appear in front of you. Nothing is recorded or uploaded.",
      start: "Start AR",
    });
    expect(xrConsentText("immersive-vr", "the model")).toEqual({
      title: "View the model in VR?",
      body: "The model and the lesson panels appear in front of you. Nothing is recorded or uploaded.",
      start: "Start VR",
    });
  });

  it("explains every failure and always points back to screen mode", () => {
    expect(xrFailureMessage("permission_denied", "immersive-ar")).toBe(
      "Camera access was not allowed. You can keep learning in screen mode.",
    );
    expect(xrFailureMessage("dom_overlay_unavailable", "immersive-ar")).toBe(
      "AR controls are unavailable on this device. You are back in screen mode.",
    );
    expect(xrFailureMessage("tracking_lost", "immersive-vr")).toBe("VR tracking was lost. You are back in screen mode.");
    for (const code of ["permission_denied", "tracking_lost", "unsupported", "dom_overlay_unavailable", "unknown"] as const) {
      for (const mode of ["immersive-ar", "immersive-vr"] as const) {
        expect(xrFailureMessage(code, mode)).toMatch(/screen mode\.$/);
      }
    }
  });

  it("reminds students to take a break after ten minutes", () => {
    expect(COMFORT_BREAK_DELAY_MS).toBe(600_000);
  });

  it("treats devices without a fine pointer as touch-first", () => {
    expect(isTouchFirstDevice(() => ({ matches: false }))).toBe(true);
    expect(isTouchFirstDevice(() => ({ matches: true }))).toBe(false);
  });
});

describe("AR HUD tabs", () => {
  it("opens a tapped tab and closes it when tapped again", () => {
    expect(nextHudTab(null, "mission")).toBe("mission");
    expect(nextHudTab("mission", "atoms")).toBe("atoms");
    expect(nextHudTab("atoms", "atoms")).toBeNull();
  });
});
