/**
 * Access-code gate (temporary, see docs/adr/0007-temporary-access-code-gate.md).
 *
 * This is a gate, not security: the codes ship in the browser bundle in plain text.
 * The Phase 4 portal token (README 9.2) replaces this module.
 */

/** Result of validating the username field. */
export type UsernameResult =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly message: string };

/** Smallest and largest username length, after trimming. */
export const USERNAME_MIN = 2;
export const USERNAME_MAX = 30;

/** Trim and upper-case a typed code so "tree@bamboo " matches "Tree@bamboo". */
export function normalizeAccessCode(code: string): string {
  return code.trim().toUpperCase();
}

/** Validate a display name. Any characters are allowed, so names in any script work. */
export function validateUsername(input: string): UsernameResult {
  const value = input.trim().replace(/\s+/g, " ");
  if (value.length < USERNAME_MIN) {
    return { ok: false, message: `Type a name with at least ${USERNAME_MIN} letters.` };
  }
  if (value.length > USERNAME_MAX) {
    return { ok: false, message: `Use ${USERNAME_MAX} letters or fewer.` };
  }
  return { ok: true, value };
}

/** True when the typed code is one of the accepted codes (any case). Empty input never matches. */
export function verifyAccessCode(code: string, accepted: readonly string[]): boolean {
  const typed = normalizeAccessCode(code);
  if (typed.length === 0) return false;
  return accepted.some((candidate) => normalizeAccessCode(candidate) === typed);
}

/** Wrong-code limiter. In-memory only, so it slows guessing but is not a security control. */
export interface AttemptLimiter {
  /** Whether another try is allowed now, and how long to wait if not. */
  check(): { readonly allowed: boolean; readonly retryAfterMs: number };
  /** Record a wrong code. */
  recordFailure(): void;
  /** Clear the counter after a correct code. */
  reset(): void;
}

/** Create a limiter that locks for `lockMs` after `maxAttempts` wrong codes. `now` is injected. */
export function createAttemptLimiter(options: {
  readonly maxAttempts: number;
  readonly lockMs: number;
  readonly now: () => number;
}): AttemptLimiter {
  let failures = 0;
  let lockedUntil = 0;
  return {
    check() {
      const remaining = lockedUntil - options.now();
      if (remaining > 0) return { allowed: false, retryAfterMs: remaining };
      if (lockedUntil !== 0) {
        // The lock has ended: start a fresh round.
        lockedUntil = 0;
        failures = 0;
      }
      return { allowed: true, retryAfterMs: 0 };
    },
    recordFailure() {
      failures += 1;
      if (failures >= options.maxAttempts) lockedUntil = options.now() + options.lockMs;
    },
    reset() {
      failures = 0;
      lockedUntil = 0;
    },
  };
}
