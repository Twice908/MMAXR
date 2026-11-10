/** The part of `localStorage` the preference needs. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** A remembered on/off switch, such as "space sounds". */
export interface SwitchPreference {
  get(): boolean;
  set(on: boolean): void;
}

/**
 * Remember an on/off choice on this device. Storage errors (private mode, full quota) are
 * ignored, so the switch still works for the current visit.
 */
export function createSwitchPreference(
  storage: KeyValueStorage | null,
  key: string,
  fallback: boolean,
): SwitchPreference {
  let value = fallback;
  try {
    const stored = storage?.getItem(key);
    if (stored === "on") value = true;
    else if (stored === "off") value = false;
  } catch {
    // Unreadable storage keeps the fallback.
  }
  return {
    get: () => value,
    set(on) {
      value = on;
      try {
        storage?.setItem(key, on ? "on" : "off");
      } catch {
        // The choice still applies for this visit.
      }
    },
  };
}

/** Device capability tier used to size effects. */
export type QualityTier = "low" | "high";

/** What the quality guess looks at. */
export interface DeviceHints {
  /** `navigator.hardwareConcurrency`. */
  readonly cores?: number | undefined;
  /** `navigator.deviceMemory`, in gigabytes, where the browser reports it. */
  readonly memoryGb?: number | undefined;
}

/** Guess the quality tier. Unknown hints count as a mid-range phone, which is the target device. */
export function guessQuality(hints: DeviceHints): QualityTier {
  const cores = hints.cores ?? 4;
  if (cores <= 4) return "low";
  if (hints.memoryGb !== undefined && hints.memoryGb <= 3) return "low";
  return "high";
}

/** Highest device pixel ratio to render at for a tier. */
export function pixelRatioCap(tier: QualityTier): number {
  return tier === "high" ? 2 : 1.5;
}
