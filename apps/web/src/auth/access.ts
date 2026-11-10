/**
 * Access-code gate (temporary, see docs/adr/0007-temporary-access-code-gate.md).
 *
 * This is a gate, not security: the hash list ships in the browser bundle. Codes are
 * stored only as salted PBKDF2 hashes so a leaked bundle does not show them in plain text.
 * The Phase 4 portal token (README 9.2) replaces this module.
 */

/** Shape of `access-codes.json`. */
export interface AccessCodeList {
  /** Hex salt shared by every hash in the list. */
  readonly salt: string;
  /** PBKDF2-SHA256 iteration count used for every hash. */
  readonly iterations: number;
  /** Hex hashes of the real access codes. */
  readonly hashes: readonly string[];
  /** Hex hashes of test codes. Only honoured when `allowDevCodes` is true (dev and tests). */
  readonly devHashes: readonly string[];
}

/** Result of validating the username field. */
export type UsernameResult =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly message: string };

/** Smallest and largest username length, after trimming. */
export const USERNAME_MIN = 2;
export const USERNAME_MAX = 30;

/** Trim and upper-case a typed code so "abc-12 " matches "ABC-12". */
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

/** Hash a normalised code with PBKDF2-SHA256 and return lowercase hex. */
export async function hashAccessCode(
  code: string,
  salt: string,
  iterations: number,
  subtle: SubtleCrypto = getSubtleCrypto(),
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await subtle.importKey("raw", encoder.encode(normalizeAccessCode(code)), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: encoder.encode(salt), iterations },
    key,
    256,
  );
  return Array.from(new Uint8Array(bits), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** True when the typed code matches a hash in the list. Empty input never matches. */
export async function verifyAccessCode(
  code: string,
  list: AccessCodeList,
  options: { readonly allowDevCodes?: boolean; readonly subtle?: SubtleCrypto } = {},
): Promise<boolean> {
  if (normalizeAccessCode(code).length === 0) return false;
  const hash = await hashAccessCode(code, list.salt, list.iterations, options.subtle);
  const accepted = options.allowDevCodes === true ? [...list.hashes, ...list.devHashes] : list.hashes;
  // Compare every hash so the time taken does not reveal how far into the list a match was.
  let matched = false;
  for (const candidate of accepted) {
    if (constantTimeEqual(candidate, hash)) matched = true;
  }
  return matched;
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

function constantTimeEqual(a: string, b: string): boolean {
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function getSubtleCrypto(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("Login needs a secure (https) connection.");
  }
  return subtle;
}
