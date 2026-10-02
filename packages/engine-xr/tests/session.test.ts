import { describe, expect, it } from "vitest";
import {
  arErrorReasonCodes,
  initialArSessionState,
  transitionArSession,
  type ArErrorReasonCode,
  type ArSessionState,
} from "../src/session.js";

const requestedFeatures = ["hit-test", "dom-overlay"] as const;

describe("AR session state machine", () => {
  it("supports each normal lifecycle transition and records granted features", () => {
    const requesting = transitionArSession(initialArSessionState, {
      type: "request",
      requestedFeatures,
    });
    expect(requesting).toEqual({ status: "requesting", requestedFeatures });

    const active = transitionArSession(requesting, {
      type: "started",
      grantedFeatures: ["hit-test"],
    });
    expect(active).toEqual({
      status: "active",
      requestedFeatures,
      grantedFeatures: ["hit-test"],
    });

    const ending = transitionArSession(active, { type: "end" });
    expect(ending).toEqual({ status: "ending" });
    expect(transitionArSession(ending, { type: "ended" })).toBe(initialArSessionState);
  });

  it("allows a pending request to be ended", () => {
    const requesting = transitionArSession(initialArSessionState, {
      type: "request",
      requestedFeatures: [],
    });
    expect(transitionArSession(requesting, { type: "end" })).toEqual({ status: "ending" });
  });

  it("rejects granting a feature that was not requested", () => {
    const requesting = transitionArSession(initialArSessionState, {
      type: "request",
      requestedFeatures: [],
    });

    expect(() => transitionArSession(requesting, {
      type: "started",
      grantedFeatures: ["hit-test"],
    })).toThrow("Granted AR features must have been requested.");
  });

  it.each(arErrorReasonCodes)("records the %s error reason and resets", (reasonCode) => {
    const requesting = transitionArSession(initialArSessionState, {
      type: "request",
      requestedFeatures: [],
    });
    const error = transitionArSession(requesting, {
      type: "error",
      reasonCode,
    });

    expect(error).toEqual({ status: "error", reasonCode });
    expect(transitionArSession(error, { type: "reset" })).toBe(initialArSessionState);
  });

  it("rejects transitions not defined by the state machine", () => {
    const state: ArSessionState = { status: "idle" };
    expect(() => transitionArSession(state, { type: "ended" })).toThrow(
      "Invalid AR session transition: idle + ended.",
    );
  });

  it("keeps the published error-code type aligned with the runtime codes", () => {
    const reasonCode: ArErrorReasonCode = "permission_denied";
    expect(arErrorReasonCodes).toContain(reasonCode);
  });
});