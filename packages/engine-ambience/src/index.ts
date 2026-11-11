/**
 * `@mma/engine-ambience`: the immersive shell shared by every screen. A WebGL cosmos (nebula,
 * deep star field, planets and stars anchored to DOM elements), a live-synthesised soundscape,
 * a colour veil for scene changes, and the motion helpers that tie them together.
 *
 * Subject-neutral: apps and modules decide which palettes, planets and moods to use.
 */
export {
  createCosmos,
  type CelestialBody,
  type Cosmos,
  type CosmosOptions,
  type Journey,
  type JourneyOptions,
  type Orbit,
  type OrbitOptions,
  type PlanetOptions,
  type PlanetStyle,
  type StarOptions,
} from "./cosmos/cosmos.js";
export {
  createSoundscape,
  type CueOptions,
  type SoundCue,
  type Soundscape,
  type SoundscapeOptions,
  type SoundSweep,
} from "./soundscape.js";
export { createVeil, type Veil } from "./veil.js";
export { createJourneyCaptions, type JourneyCaptions, type JourneyCaptionsOptions } from "./captions.js";
export {
  createSoundToggle,
  departOut,
  revealIn,
  shake,
  DEPART_EASING,
  SETTLE_EASING,
  type DepartOptions,
  type RevealOptions,
  type SoundToggle,
} from "./dom.js";
export {
  hexToRgb,
  mixPalette,
  mixRgb,
  mixVivid,
  mixVividPalette,
  paletteGradient,
  paletteToRgb,
  rgbToHex,
  type CosmosPalette,
  type Rgb,
  type RgbPalette,
} from "./palette.js";
export { clamp01, damp, ease, tween, wait, zoomBetween, type Easing, type Tween, type TweenOptions } from "./motion.js";
export { midiToHz, moodNotes, nextShimmer, padCutoffHz, seededRandom, PAD_VOICES, type Shimmer, type SoundMood } from "./music.js";
export {
  createSwitchPreference,
  guessQuality,
  pixelRatioCap,
  type DeviceHints,
  type KeyValueStorage,
  type QualityTier,
  type SwitchPreference,
} from "./preference.js";
export {
  coverRadius,
  orbitThrough,
  rectToWorld,
  unitsPerPixel,
  visibleHeightAt,
  worldToUv,
  type Ellipse,
  type ScreenRect,
  type ViewportSize,
  type WorldDisc,
} from "./space-math.js";
