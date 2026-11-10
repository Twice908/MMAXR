import type { CosmosPalette, PlanetOptions, SoundMood, StarOptions } from "@mma/engine-ambience";

/** Nebula colours behind the login screen: deep indigo with magenta filaments. */
export const LOGIN_PALETTE: CosmosPalette = {
  deep: "#04030e",
  mid: "#1a0d44",
  glow: "#6b2fd6",
  accent: "#ff4f9a",
};

/** Nebula colours behind the dashboard: deep blue with violet filaments. */
export const DASHBOARD_PALETTE: CosmosPalette = {
  deep: "#02050f",
  mid: "#0c1f4a",
  glow: "#2f6fe0",
  accent: "#b452ff",
};

/** A brief warm flash for a refused sign-in. */
export const DENY_PALETTE: CosmosPalette = {
  deep: "#0d0306",
  mid: "#3a0c1c",
  glow: "#c0304f",
  accent: "#ff7a59",
};

/** Dark, open chord for the login screen (D minor 7, spread wide). */
export const LOGIN_MOOD: SoundMood = { rootMidi: 38, intervals: [0, 7, 12, 15, 22], brightness: 0.22 };

/** Bright, open chord for the dashboard (D 6/9). */
export const DASHBOARD_MOOD: SoundMood = { rootMidi: 38, intervals: [0, 7, 14, 16, 21], brightness: 0.45 };

/** How one subject appears on the dashboard: a star with its own chord. */
export interface SystemLook {
  readonly star: StarOptions;
  /** Star size on the dashboard in CSS pixels. */
  readonly size: number;
  readonly orbitColor: string;
  /** Chord the pad glides to while one of this subject's planets is in focus. */
  readonly mood: SoundMood;
  /** Accent colour for this subject's labels. */
  readonly accent: string;
}

const SYSTEMS: Readonly<Record<string, SystemLook>> = {
  physics: {
    star: { core: "#ffe7b8", edge: "#ff7f24", intensity: 1, spikes: 0.55, seed: 2.1 },
    size: 104,
    orbitColor: "#ffb36b",
    mood: { rootMidi: 33, intervals: [12, 19, 23, 26, 31], brightness: 0.62 },
    accent: "#ffc074",
  },
  chemistry: {
    star: { core: "#e6e1ff", edge: "#6d5cff", intensity: 1, spikes: 0.55, seed: 5.3 },
    size: 112,
    orbitColor: "#a99bff",
    mood: { rootMidi: 43, intervals: [0, 7, 14, 18, 21], brightness: 0.55 },
    accent: "#b9adff",
  },
  biology: {
    // Dormant until Biology experiments arrive: a faint, distant star.
    star: { core: "#c9ffe0", edge: "#2fb57a", intensity: 0.5, spikes: 0, glowScale: 3.2, seed: 8.8 },
    size: 60,
    orbitColor: "#5fd9a0",
    mood: { rootMidi: 40, intervals: [0, 7, 11, 14, 16], brightness: 0.4 },
    accent: "#8fe7bd",
  },
};

const FALLBACK_SYSTEM: SystemLook = {
  star: { core: "#f5f7ff", edge: "#9fb4ff", intensity: 0.8, spikes: 0.4 },
  size: 96,
  orbitColor: "#9fb4ff",
  mood: DASHBOARD_MOOD,
  accent: "#c4d0ff",
};

/** The star system for a subject id. Unknown subjects get a neutral blue-white star. */
export function systemLook(subjectId: string): SystemLook {
  return SYSTEMS[subjectId] ?? FALLBACK_SYSTEM;
}

/** How one experiment appears on the dashboard: a planet with its own colours and note. */
export interface PlanetLook {
  readonly planet: Omit<PlanetOptions, "lightFrom">;
  /** Planet size on the dashboard in CSS pixels. */
  readonly size: number;
  /** Nebula colours while this planet is in focus or being entered. */
  readonly palette: CosmosPalette;
  /** Bell note (MIDI) heard when the planet is pointed at. */
  readonly note: number;
}

const PLANETS: Readonly<Record<string, PlanetLook>> = {
  // Atom Builder: a violet gas giant circled by electron-shell rings.
  "chem.atom-builder": {
    planet: {
      style: "banded",
      colors: ["#2a1670", "#7a5cff", "#bff4ff"],
      atmosphere: "#8f7bff",
      rings: { count: 3, color: "#6ff3ff" },
      spin: 0.1,
      tilt: 0.4,
      seed: 1.7,
    },
    size: 116,
    palette: { deep: "#05031a", mid: "#1d0f56", glow: "#6a3cff", accent: "#3ee6ff" },
    note: 79,
  },
  // Ionic Bonding: a crystal world in two alternating colours, with a bonded companion moon.
  "chem.ionic-bonding": {
    planet: {
      style: "crystal",
      colors: ["#0b5566", "#a7fff0", "#ff6fd8"],
      atmosphere: "#5ff0e0",
      moon: { colors: ["#5a1a6e", "#ffb3ec", "#ffffff"], atmosphere: "#ff8fe0", size: 0.27 },
      spin: 0.07,
      tilt: 0.25,
      seed: 4.2,
    },
    size: 100,
    palette: { deep: "#021113", mid: "#073c48", glow: "#12b5a6", accent: "#ff5cc8" },
    note: 86,
  },
  // Ohm's Law: a storm world with current-like lightning in its bands.
  "phys.ohms-law": {
    planet: {
      style: "storm",
      colors: ["#240c05", "#b4461a", "#ffd76a"],
      atmosphere: "#ff9a3d",
      spin: 0.12,
      tilt: 0.3,
      seed: 7.9,
    },
    size: 124,
    palette: { deep: "#0b0402", mid: "#3d1406", glow: "#f06a1a", accent: "#ffd34d" },
    note: 81,
  },
};

/** The planet for an experiment id. New modules get a banded planet until they are given a look. */
export function planetLook(experimentId: string): PlanetLook {
  return (
    PLANETS[experimentId] ?? {
      planet: { style: "banded", colors: ["#1b2a5a", "#5c7cff", "#e4ecff"], atmosphere: "#8fb0ff" },
      size: 104,
      palette: DASHBOARD_PALETTE,
      note: 74,
    }
  );
}

/** Experiment ids that have their own planet look. */
export const PLANET_IDS: readonly string[] = Object.keys(PLANETS);

/** The giant planet rising at the bottom of the login screen, backlit by a distant sun. */
export const LOGIN_HORIZON: Omit<PlanetOptions, "lightFrom"> = {
  style: "ocean",
  colors: ["#071a46", "#1d5c74", "#dff3ff"],
  atmosphere: "#5fd8ff",
  haloScale: 1.04,
  haloStrength: 1.5,
  lightDepth: -0.3,
  spin: 0.012,
  tilt: 0.12,
  seed: 3.3,
  segments: 64,
};

/** The distant sun above the login horizon. */
export const LOGIN_SUN: StarOptions = {
  core: "#ffffff",
  edge: "#ff9ad6",
  intensity: 1.1,
  glowScale: 5,
  spikes: 0.9,
  seed: 9.1,
};
