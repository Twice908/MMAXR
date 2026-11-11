# ADR 0016: Ionic Bonding immersive upgrade (reuse of Atom Builder's parts)

Status: Accepted (all 5 phases done; device checks pending)

## Context

The owner wants Ionic Bonding to get the same immersive treatment as Atom Builder (ADR 0012) in
web, AR and VR. Owner decisions:

- Reuse what Atom Builder has, exactly as it is: the sound system, the luminous atom (nucleus
  and shells), completion banners (page banner for web and AR, the 3D banner for VR).
- Build nothing new where a shared part exists.
- Mission flow stays as it is: option A, with no new missions or checks.
- No salt crystals for now: the descent arrives at the Na and Cl atoms.
- The dark page is a shared engine-ui theme.

Phases:

1. Arrival and dark page.
2. Luminous atoms.
3. Sound.
4. Mission moments.
5. AR and VR.

## Phase 1: descent and dark page

- The descent (`Cosmos.startJourney`) takes an optional `secondShells`. The same atom drawing
  then arrives at two atoms, side by side on wide screens and stacked on tall ones.
  `arrivalFor("chem.ionic-bonding")` reuses Atom Builder's script shape and timings:
  - it ends on sodium (2,8,1) and chlorine (2,8,7) in the crystal planet's teal and magenta;
  - the status lines are qualitative, with no salt or crystal claims;
  - the full descent plays on the first visit and the short one after.
- `@mma/engine-ui/lesson-cosmic.css` is a shared, dark-only theme for the engine-ui lesson page,
  switched on with the `mma-theme-cosmic` class beside `mma-ui`. It mostly retunes the
  `--mma-*` tokens, so every shared component follows. It adds:
  - the `--cosmos-snapshot` sky with grain, and a gradient stands in without it;
  - translucent lifted cards;
  - gradient primary buttons (`--mma-cosmic-gradient`);
  - a see-through page while `ar-active`.

  Ohm's Law does not use it yet.
- Ionic Bonding opts in, and `ionic-cosmic.css` covers the few fixed colours the tokens cannot
  reach: the stage's core light, the hint and drag pills, and the solid teal buttons. These rules
  use `:where()`, so the AR rules still win.

## Phase 2: luminous atoms

- `MoleculeView` takes `atomStyle` and `reducedMotion` and passes them to each `AtomView`.
  Ionic Bonding uses `luminous`, the Atom Builder atom exactly as it is.
- The outer-shell cue moved to the chemistry kit (`outerShellState`, `withOuterShellEmphasis`,
  typed by structure, so there is no renderer import). Atom Builder re-exports it unchanged.
  `toSceneFrame` takes each atom's shells, so sodium's and chlorine's outer shells breathe while
  reactive and settle once complete.
- Ionic Bonding drags electrons through page handles placed at their layout positions. While any
  electron can be dragged, `MoleculeView.setOrbitHeld(true)` holds the orbits at those positions,
  reusing the luminous atom's "glide home". Once none can be dragged, the electrons orbit again.

## Phase 3: sound

- Atom Builder's atom sounds (`sound-cues.ts`) moved unchanged into the chemistry kit
  (`atom-sounds.ts`). In place of the soundscape type it uses a minimal structural
  `AtomSoundPlayer`, so the kit has no audio code; the soundscape satisfies it. Atom Builder
  re-exports them, and its tests still cover them.
- Ionic Bonding receives the shared soundscape (`ExperimentContext.sound`) and plays the kit's
  sounds for each atom as the bonding state changes:
  - the electron leaving sodium plays the existing removal sound;
  - its arrival plays chlorine's shell note;
  - each outer shell that becomes complete rings the resolved chord;
  - a refused move plays the soft "no" once.

  Glue only: the same pad level (0.24), mood rule and narration ducking as Atom Builder. The pad
  stays unresolved until every atom's outer shell is complete.

## Phase 4: mission moments

- Atom Builder's moment parts are now shared, and Atom Builder uses the shared copies:
  - `engine-lesson` `lesson-moments.ts`: `lessonMomentSnapshot`, `missionMoments` and
    `playMomentSound`, with the same chords and cues; structural `MomentSoundPlayer`, no audio
    code.
  - `engine-ui` `createMomentBanner` and `moment-banner.css`: the same banner markup, look and
    ring of light, raised in AR and hidden in VR, where the 3D banner shows instead.
- Fix carried over: under reduced motion the banner now simply shows and then hides. Before, its
  shortened animation ended invisible.
- The shared cosmic theme tints the sky per mission (`data-mission`: 1-4, free, done), in the
  same colours as Atom Builder.
- Ionic Bonding shows the banner over its stage for "Mission complete" and "All missions
  complete", plays the moment sounds (mission and lesson chords, answers, missed Checks, hints)
  and tints the sky per mission. There are no ion moments here; the cards and labels already
  show the charges.

## Phase 5: AR and VR

- Phone AR: the shared cosmic theme now also sets the `--hud-*` tokens (the same dark values as
  Atom Builder), so any lesson on the theme gets a dark HUD. This matters for Ionic Bonding,
  whose lesson cards inside the HUD already used the dark tokens. The page banner shows in AR
  (raised to the upper middle).
- VR: `vrBackdrop: "space"` gives the star dome and violet floor. Mission banners show as the 3D
  banner above the model, and the page banner is hidden through `xr-vr-active`, as in Atom
  Builder.
- Checked in the emulator (headless): VR opens full screen, with luminous Na and Cl, labels,
  panels, and no errors. Phone AR and real headsets are the owner's checks.

## Consequences

- Any engine-ui lesson can go dark with one class and one import.
- Wording is drafted for the owner in `apps/web/src/stage/theme.ts`.
