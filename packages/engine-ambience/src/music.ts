/**
 * The harmonic colour of a scene. The ambient pad plays `intervals` above `rootMidi`; changing
 * mood glides every voice to the new chord, so moving between scenes sounds continuous.
 */
export interface SoundMood {
  /** MIDI note of the chord root (38 is D2). */
  readonly rootMidi: number;
  /** Semitones above the root for each pad voice. Five voices are played; extra entries are ignored. */
  readonly intervals: readonly number[];
  /** Pad filter opening from 0 (dark, distant) to 1 (bright, close). */
  readonly brightness: number;
}

/** Number of voices in the ambient pad. */
export const PAD_VOICES = 5;

/** Frequency in hertz of a MIDI note (69 is A4 at 440 Hz). */
export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/**
 * MIDI notes of the pad voices for a mood. Missing voices repeat the chord an octave higher, so
 * a short chord still fills all {@link PAD_VOICES} voices.
 */
export function moodNotes(mood: SoundMood): readonly number[] {
  const intervals = mood.intervals.length > 0 ? mood.intervals : [0];
  const notes: number[] = [];
  for (let voice = 0; voice < PAD_VOICES; voice += 1) {
    const interval = intervals[voice % intervals.length] ?? 0;
    const octave = Math.floor(voice / intervals.length) * 12;
    notes.push(mood.rootMidi + interval + octave);
  }
  return notes;
}

/** Cut-off frequency of the pad filter for a brightness from 0 to 1. */
export function padCutoffHz(brightness: number): number {
  const b = Math.min(1, Math.max(0, brightness));
  return 260 * (1600 / 260) ** b;
}

/** A tiny seeded random generator (mulberry32). Returns numbers in [0, 1). */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One distant chime in the ambient bed. */
export interface Shimmer {
  /** Wait before this chime, in milliseconds. */
  readonly delayMs: number;
  readonly midi: number;
  /** Stereo position from -1 (left) to 1 (right). */
  readonly pan: number;
  /** Peak level, already quiet. */
  readonly gain: number;
}

/**
 * Pick the next distant chime: a chord tone two or three octaves above the pad, somewhere in the
 * stereo field, every 4.5 to 10 seconds. Using chord tones keeps every chime in tune with the pad.
 */
export function nextShimmer(mood: SoundMood, random: () => number): Shimmer {
  const notes = moodNotes(mood);
  const note = notes[Math.floor(random() * notes.length) % notes.length] ?? mood.rootMidi;
  const lift = random() < 0.7 ? 24 : 36;
  return {
    delayMs: 4500 + random() * 5500,
    midi: note + lift,
    pan: random() * 1.6 - 0.8,
    gain: 0.012 + random() * 0.014,
  };
}
