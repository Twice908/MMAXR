import { outerShellState } from "./outer-shell-emphasis.js";

/**
 * The part of a soundscape these sounds need (engine-ambience's soundscape fits), so the kit
 * stays free of audio code.
 */
export interface AtomSoundPlayer {
  cue(name: "place" | "snap" | "close" | "deny", options?: { readonly midi?: number; readonly pan?: number }): void;
  chord(midis: readonly number[], options?: { readonly spreadSeconds?: number; readonly gain?: number }): void;
  sweep(name: "rise", seconds: number): void;
}

/** A pad chord (engine-ambience's sound mood fits). */
export interface AtomSoundMood {
  readonly rootMidi: number;
  readonly intervals: readonly number[];
  readonly brightness: number;
}

/** What the sounds react to: the atom's particle counts and its current rejection message. */
export interface AtomSnapshot {
  readonly protons: number;
  readonly neutrons: number;
  readonly shells: readonly number[];
  /** The first validation message, or "" when the last move was accepted. */
  readonly message: string;
}

/** One sound the lesson plays after the atom changes. */
export type AtomSoundEvent =
  | { readonly kind: "place"; readonly particle: "proton" | "neutron"; readonly midi: number }
  | { readonly kind: "snap"; readonly shell: number; readonly midi: number }
  | { readonly kind: "remove" }
  | { readonly kind: "complete"; readonly chord: readonly number[] }
  | { readonly kind: "deny" }
  | { readonly kind: "reset" };

/** Each shell has its own home note (MIDI): K, L, M, N climb from G4 upwards. */
export const SHELL_ROOTS: readonly number[] = [67, 74, 79, 86];
/** Steps of the scale played as a shell fills, so each electron adds the next note. */
export const SHELL_STEPS: readonly number[] = [0, 2, 4, 6, 7, 9, 11, 12];
/** The chord that rings out when the outer shell becomes complete (G major 9, resolved). */
export const COMPLETE_CHORD: readonly number[] = [67, 71, 74, 78, 81];

// Protons and neutrons land on bright, warm notes (A4 and E4) that sit in the pad's key.
const PROTON_NOTE = 69;
const NEUTRON_NOTE = 64;

/** The note the k-th electron (from 0) makes as it lands in a shell (from 1). */
export function electronNote(shell: number, index: number): number {
  const root = SHELL_ROOTS[Math.min(SHELL_ROOTS.length, Math.max(1, shell)) - 1] ?? 67;
  return root + (SHELL_STEPS[index % SHELL_STEPS.length] ?? 0);
}

/**
 * The sounds for a change of atom, in order. Protons and neutrons land with soft low tones,
 * each electron plucks its shell's note, a newly complete outer shell rings a resolved chord, a
 * refused move gets a gentle "no", and clearing the atom gets one short sound instead of many.
 * Every sound repeats what the screen already shows, so muting loses nothing.
 */
export function atomSoundEvents(previous: AtomSnapshot, next: AtomSnapshot): readonly AtomSoundEvent[] {
  const total = (snapshot: AtomSnapshot): number =>
    snapshot.protons + snapshot.neutrons + snapshot.shells.reduce((sum, count) => sum + count, 0);
  if (total(previous) > 0 && total(next) === 0) return [{ kind: "reset" }];

  const events: AtomSoundEvent[] = [];
  if (next.message !== "" && next.message !== previous.message) events.push({ kind: "deny" });

  if (next.protons > previous.protons) events.push({ kind: "place", particle: "proton", midi: PROTON_NOTE });
  if (next.neutrons > previous.neutrons) events.push({ kind: "place", particle: "neutron", midi: NEUTRON_NOTE });
  let removed = next.protons < previous.protons || next.neutrons < previous.neutrons;

  const shells = Math.max(previous.shells.length, next.shells.length);
  for (let index = 0; index < shells; index += 1) {
    const before = previous.shells[index] ?? 0;
    const after = next.shells[index] ?? 0;
    for (let electron = before; electron < after; electron += 1) {
      events.push({ kind: "snap", shell: index + 1, midi: electronNote(index + 1, electron) });
    }
    if (after < before) removed = true;
  }
  if (removed) events.push({ kind: "remove" });

  if (outerShellState(next.shells) === "complete" && outerShellState(previous.shells) !== "complete") {
    events.push({ kind: "complete", chord: COMPLETE_CHORD });
  }
  return events;
}

/**
 * The quiet pad under the lesson follows the outer shell: open and dim with no electrons, a
 * suspended (unresolved) chord while the outer shell is reactive, and a resolved chord once it
 * is complete.
 */
export function atomMood(shells: readonly number[]): AtomSoundMood {
  switch (outerShellState(shells)) {
    case "empty":
      return { rootMidi: 43, intervals: [0, 7, 12, 14, 19], brightness: 0.3 };
    case "reactive":
      return { rootMidi: 43, intervals: [0, 5, 7, 12, 17], brightness: 0.42 };
    case "complete":
      return { rootMidi: 43, intervals: [0, 7, 14, 16, 19], brightness: 0.6 };
  }
}

/** Play a list of atom sounds on the shared soundscape. */
export function playAtomSounds(sound: AtomSoundPlayer, events: readonly AtomSoundEvent[]): void {
  for (const event of events) {
    switch (event.kind) {
      case "place":
        sound.cue("place", { midi: event.midi, pan: event.particle === "proton" ? -0.2 : 0.2 });
        break;
      case "snap":
        sound.cue("snap", { midi: event.midi, pan: (event.shell - 2.5) * 0.25 });
        break;
      case "remove":
        sound.cue("close");
        break;
      case "complete":
        sound.chord(event.chord, { spreadSeconds: 0.09, gain: 0.045 });
        break;
      case "deny":
        sound.cue("deny");
        break;
      case "reset":
        sound.sweep("rise", 0.6);
        break;
    }
  }
}
