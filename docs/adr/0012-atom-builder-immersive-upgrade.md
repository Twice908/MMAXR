# ADR 0012: Atom Builder immersive upgrade (phased)

Status: In progress (Phases 1-3 of 6 done)

## Context

After the immersive shell (ADR 0011), opening Atom Builder still dropped students from space
into a flat lesson page. The owner approved a six-phase upgrade, done one phase at a time:

1. Arrival.
2. Dark cosmic lesson page (dark only, no light mode for now).
3. A living 3D atom.
4. Sound that teaches.
5. Mission moments.
6. AR/VR and polish.

Learning logic (rules, missions, questions, telemetry) does not change.

## Phase 1: the descent (arrival)

- `@mma/engine-ambience`:
  - `Cosmos.startJourney` replaces the sky with one full-screen pass that falls through
    cloud decks, breaks through with a flash, then zooms endlessly through layers of packed
    particles. Each layer is the same lattice at twice the scale, fading in and out, so the
    zoom never runs out. It arrives at one atom: a glowing nucleus and tilted shells with
    electrons running along them.
  - `skip()` races to the atom. The descent keeps animating there until stopped.
  - `createJourneyCaptions` is the loader:
    - a title;
    - a status line that types in with a blinking caret and pulsing dots, announced politely
      to screen readers;
    - a progress bar with a percentage;
    - a Skip button (Escape also skips).
- App (`apps/web/src/stage`):
  - `arrivalFor(moduleId)` holds each module's script: palette, final atom, status lines,
    welcome text and music. Only Atom Builder has one so far; other modules still open with
    the colour fade.
  - `playArrival` drives captions and a score keyed to progress: a warp at the start, a chime
    as the clouds break, rising bells as the scales shrink, a rush, and a landing.
  - `createArrivalLog` remembers first visits per student and module. The full descent
    (about 5.6 s) plays once; later visits get a short one (about 2.3 s) that starts among
    the particles.
- Router: the lesson loads and mounts underneath while the descent plays. The sky is lifted
  above the page (`is-journey`) and fades away once both are ready, which hides load time.
- Reduced motion, no WebGL, or no session: the previous colour-fade opening is used.

The status lines are qualitative and in size order: a grain of sand, then a living cell, then
the limit of light microscopes, then packed particles, then one atom. The final atom shows
2 and 4 electrons (carbon, the first mission), consistent with Bohr-Bury.

## Phase 2: dark cosmic lesson page

- `Cosmos.snapshot(palette)` renders one still of the nebula and stars as a JPEG data URL.
  The app sets it on `#app` as `--cosmos-snapshot` when a lesson opens and removes it when the
  lesson closes. Lessons get the same sky the descent came from, with no WebGL loop running
  behind them.
- Atom Builder gets `atom-builder-cosmic.css`, dark only:
  - the snapshot sky with a fine grain, and a gradient stands in without it;
  - deep translucent bands and rails with glowing hairlines;
  - violet-to-cyan primary buttons, a larger stage with a soft core light behind the atom
    (the 3D canvas is already transparent), a gradient element symbol, and glowing tray
    particles.
- Every rule is `:where(.atom-builder) <base selector>`. It adds no specificity, so it
  overrides the base rule by load order, never leaks into other lessons (Atom Builder's CSS
  stays loaded after you leave), and still loses to the AR HUD and its `!important`
  transparency. Layout, controls and their accessible names are unchanged.
- Label wording: "PARTICLES" becomes "BUILDING BLOCKS", "LIVE MODEL" becomes
  "INSIDE THE ATOM", "ATOM STATE" becomes "LIVE SCAN", and the visible back button reads
  "Universe". Its accessible name is still "Back to all experiments".

## Phase 3: a living atom

- `@mma/engine-render`: `AtomView` and `SceneRenderer` take an opt-in `atomStyle: "luminous"`,
  plus `reducedMotion`. The default stays `classic`, so Ionic Bonding (`MoleculeView`) is
  unchanged. `LuminousAtom` draws:
  - nucleons with a soft emissive tint and a warm, breathing halo;
  - each shell as a thin core ring with a wide additive halo;
  - spheres on a shell orbiting along it, each with a glow and a fading light trail drawn by
    the ring shader.
- While free slots are shown (dragging an electron), the orbits glide home, so electrons line up
  with the layout's slots again. Orbit angles are animation only and never touch state.
- Shells keep invisible pick rings at the classic thickness, so picking and drop targets are
  unchanged.
- `SceneRing.emphasis` (`pulse` or `settled`) is a neutral cue that the caller chooses. Atom
  Builder marks the outermost occupied shell with the kit's `hasCompleteOuterShell`: it
  breathes violet while incomplete (reactive), and flashes once and glows calm cyan when
  complete. The renderer does not decide what is complete.
- The stage light behind the atom follows `data-outer-shell` (`empty`, `reactive` or
  `complete`) with two cross-fading CSS glow layers. These are hidden in AR.
- The 30 fps check on a phone was skipped at the owner's request; the owner checks it manually.

## Consequences

- For a few seconds two WebGL contexts can be busy at once: the descent, and the lesson
  mounting underneath it.
- Wording is drafted for the owner to edit in `apps/web/src/stage/theme.ts`.
