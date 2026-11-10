import { describe, expect, it } from "vitest";
import { ACCESS_CODES } from "./access-codes.js";
import { createAttemptLimiter, normalizeAccessCode, validateUsername, verifyAccessCode } from "./access.js";

describe("normalizeAccessCode", () => {
  it("trims and upper-cases", () => {
    expect(normalizeAccessCode("  ab-12 ")).toBe("AB-12");
  });
});

describe("verifyAccessCode", () => {
  const accepted = ["MMA-ALPHA", "Tree@bamboo"];

  it("accepts a listed code, in any case, and rejects others", () => {
    expect(verifyAccessCode("MMA-ALPHA", accepted)).toBe(true);
    expect(verifyAccessCode("tree@bamboo ", accepted)).toBe(true);
    expect(verifyAccessCode("Tree@bamboo1", accepted)).toBe(false);
    expect(verifyAccessCode("MMA-GAMMA", accepted)).toBe(false);
  });

  it("rejects empty and blank input, even against an empty or blank list entry", () => {
    expect(verifyAccessCode("", accepted)).toBe(false);
    expect(verifyAccessCode("   ", accepted)).toBe(false);
    expect(verifyAccessCode("", [""])).toBe(false);
    expect(verifyAccessCode("anything", [])).toBe(false);
  });

  it("the shipped list accepts the academy code", () => {
    expect(ACCESS_CODES.length).toBeGreaterThan(0);
    expect(verifyAccessCode("Tree@bamboo", ACCESS_CODES)).toBe(true);
  });
});

describe("validateUsername", () => {
  it("trims and collapses spaces", () => {
    expect(validateUsername("  Asha   Rao ")).toEqual({ ok: true, value: "Asha Rao" });
  });

  it("accepts names in other scripts", () => {
    expect(validateUsername("आरव")).toEqual({ ok: true, value: "आरव" });
  });

  it("rejects too short and too long names with a plain message", () => {
    const short = validateUsername(" a ");
    expect(short.ok).toBe(false);
    const long = validateUsername("x".repeat(31));
    expect(long.ok).toBe(false);
    expect(validateUsername("x".repeat(30)).ok).toBe(true);
  });
});

describe("createAttemptLimiter", () => {
  it("locks after the maximum wrong tries and unlocks after the wait", () => {
    let now = 1_000;
    const limiter = createAttemptLimiter({ maxAttempts: 3, lockMs: 30_000, now: () => now });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      expect(limiter.check().allowed).toBe(true);
      limiter.recordFailure();
    }
    expect(limiter.check().allowed).toBe(true);
    limiter.recordFailure();

    expect(limiter.check()).toEqual({ allowed: false, retryAfterMs: 30_000 });
    now += 10_000;
    expect(limiter.check()).toEqual({ allowed: false, retryAfterMs: 20_000 });
    now += 20_000;
    expect(limiter.check().allowed).toBe(true);

    // A fresh round starts: two more failures do not lock again.
    limiter.recordFailure();
    limiter.recordFailure();
    expect(limiter.check().allowed).toBe(true);
  });

  it("reset clears earlier failures", () => {
    const limiter = createAttemptLimiter({ maxAttempts: 2, lockMs: 1_000, now: () => 0 });
    limiter.recordFailure();
    limiter.reset();
    limiter.recordFailure();
    expect(limiter.check().allowed).toBe(true);
  });
});
