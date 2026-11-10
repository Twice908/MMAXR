/**
 * Access codes accepted at login, in plain text. The same list is used in dev and in
 * production. Matching ignores case and surrounding spaces. Add more codes to the list
 * to accept them; remove one and redeploy to retire it. See ADR 0007.
 */
export const ACCESS_CODES: readonly string[] = ["Tree@bamboo"];
