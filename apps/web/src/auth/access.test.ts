import { pbkdf2Sync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createAttemptLimiter,
  hashAccessCode,
  normalizeAccessCode,
  validateUsername,
  verifyAccessCode,
  type AccessCodeList,
} from "./access.js";

const SALT = "00ff00ff00ff00ff";
const ITERATIONS = 1000;

async function listWith(codes: readonly string[], devCodes: readonly string[] = []): Promise<AccessCodeList> {
  return {
    salt: SALT,
    iterations: ITERATIONS,
    hashes: await Promise.all(codes.map((code) => hashAccessCode(code, SALT, ITERATIONS))),
    devHashes: await Promise.all(devCodes.map((code) => hashAccessCode(code, SALT, ITERATIONS))),
  };
}

describe("normalizeAccessCode", () => {
  it("trims and upper-cases", () => {
    expect(normalizeAccessCode("  ab-12 ")).toBe("AB-12");
  });
});

describe("hashAccessCode", () => {
  it("is stable for the same input and differs by code and by salt", async () => {
    const first = await hashAccessCode("CODE-1", SALT, ITERATIONS);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashAccessCode("CODE-1", SALT, ITERATIONS)).toBe(first);
    expect(await hashAccessCode("CODE-2", SALT, ITERATIONS)).not.toBe(first);
    expect(await hashAccessCode("CODE-1", "aa", ITERATIONS)).not.toBe(first);
  });

  it("ignores case and surrounding spaces", async () => {
    expect(await hashAccessCode(" code-1 ", SALT, ITERATIONS)).toBe(
      await hashAccessCode("CODE-1", SALT, ITERATIONS),
    );
  });

  it("matches Node's own PBKDF2-SHA256, so the browser and the hashing script agree", async () => {
    const expected = pbkdf2Sync("ABC", "salt", 2, 32, "sha256").toString("hex");
    expect(await hashAccessCode("abc", "salt", 2)).toBe(expected);
  });
});

describe("verifyAccessCode", () => {
  it("accepts a listed code, in any case, and rejects others", async () => {
    const list = await listWith(["MMA-ALPHA", "MMA-BETA"]);
    expect(await verifyAccessCode("MMA-ALPHA", list)).toBe(true);
    expect(await verifyAccessCode("mma-beta ", list)).toBe(true);
    expect(await verifyAccessCode("MMA-GAMMA", list)).toBe(false);
  });

  it("rejects empty and blank input even when the list is empty", async () => {
    const list = await listWith([]);
    expect(await verifyAccessCode("", list)).toBe(false);
    expect(await verifyAccessCode("   ", list)).toBe(false);
  });

  it("honours dev codes only when asked", async () => {
    const list = await listWith(["REAL-1"], ["TEST-1"]);
    expect(await verifyAccessCode("TEST-1", list)).toBe(false);
    expect(await verifyAccessCode("TEST-1", list, { allowDevCodes: false })).toBe(false);
    expect(await verifyAccessCode("TEST-1", list, { allowDevCodes: true })).toBe(true);
    expect(await verifyAccessCode("REAL-1", list, { allowDevCodes: true })).toBe(true);
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
