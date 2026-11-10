/**
 * Test-only login values. The matching hash sits in `devHashes` of
 * `apps/web/src/auth/access-codes.json`, which production builds ignore.
 */
export const TEST_ACCESS_CODE = "MMA-TEST-4821";
export const TEST_USERNAME = "Test Student";
/** Base URL of the e2e dev server (see playwright.config.ts). */
export const BASE_URL = "https://127.0.0.1:5174";
/** Direct link to the Atom Builder, as used by the lesson-level browser tests. */
export const ATOM_BUILDER_URL = `${BASE_URL}/#/experiment/chem.atom-builder`;
/** localStorage key and a long-lived session, so lesson tests start already signed in. */
export const SESSION_STORAGE_KEY = "mma.session.v1";
export function seededSession(): string {
  return JSON.stringify({
    username: TEST_USERNAME,
    studentRef: "stu_e2e",
    signedInAt: 0,
    expiresAt: 32_503_680_000_000,
  });
}
