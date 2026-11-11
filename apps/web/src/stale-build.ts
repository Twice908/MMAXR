import type { KeyValueStorage } from "@mma/engine-ambience";

/**
 * Browser messages for a code chunk that could not be fetched. After a new deploy, a page still
 * running the previous build asks for chunk names that no longer exist (Chrome, Firefox, Safari).
 */
const STALE_CHUNK = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i;

/** True when `error` looks like a missing chunk from an older build. */
export function isStaleChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return STALE_CHUNK.test(message);
}

const RELOAD_KEY = "mma.stale-build-reload";
/** Do not reload again within this time, so a truly missing file cannot cause a reload loop. */
const RELOAD_GUARD_MS = 60_000;

/**
 * After a redeploy, reload once to pick up the new build. Returns true when a reload was started.
 * A second failure within a minute is shown as a normal error instead.
 */
export function reloadForStaleBuild(
  error: unknown,
  options: { readonly storage: KeyValueStorage | null; readonly now: number; readonly reload: () => void },
): boolean {
  if (!isStaleChunkError(error)) return false;
  if (options.now - lastReload(options.storage) < RELOAD_GUARD_MS) return false;
  try {
    options.storage?.setItem(RELOAD_KEY, String(options.now));
  } catch {
    // Without storage the guard cannot persist; reload anyway, once per page load.
  }
  options.reload();
  return true;
}

/** When the last stale-build reload happened, or 0. */
function lastReload(storage: KeyValueStorage | null): number {
  try {
    return Number(storage?.getItem(RELOAD_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}
