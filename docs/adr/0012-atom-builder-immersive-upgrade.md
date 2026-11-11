# ADR 0012: Atom Builder immersive upgrade (phased)

Status: Accepted (all 6 phases done; device checks pending)

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

## Phase 4: sound that teaches

- `@mma/engine-ambience` soundscape gains three things:
  - two cues, `place` (a soft low landing) and `snap` (a glassy pluck at a given note);
  - `chord()`, a rolled bell chord;
  - `setDuck()`, a gain stage after the glue compressor that lowers all ambient sound together.
    Narration plays outside this graph, so ducking never affects the voice.
- The app passes its single soundscape to lessons through `ExperimentContext.sound`. A lesson
  therefore shares the dashboard's on/off switch and audio unlock. Atom Builder accepts an
  optional `sound`; without it the lesson stays silent apart from narration.
- Atom Builder (`sound-cues.ts`, pure and unit-tested) compares each new atom with the last:
  - protons and neutrons land with their own low tones;
  - each electron plucks the next note of its shell's scale. Shells K, L, M and N have rising
    home notes, so filling a shell climbs a scale;
  - a newly complete outer shell rings a resolved G major 9 chord;
  - a new rejection message plays a soft two-note "no";
  - clearing the atom plays one short sweep, not many.
- A quiet pad (bed level 0.24) follows the outer shell, using the kit's rule through
  `outerShellState`: open fifths when empty, a suspended (unresolved) chord while reactive,
  and a resolved chord once complete.
- The pad and cues duck while a narration cue plays (audio enabled and not muted).
- Every sound repeats something already shown on screen, so muting loses no information.
- After an arrival the descent music fades. A lesson that uses sound raises its own pad on mount.

## Phase 5: mission moments

- `moments.ts` (pure, unit-tested) compares lesson snapshots and finds the moments to mark:
  a mission newly completed, all missions done, a question answered (right or wrong), a missed
  Check, a hint, and an atom becoming an ion (charge turning non-zero or changing sign).
  Moments only celebrate what the lesson flow already decided. Missions, rules, questions and
  telemetry are unchanged.
- Light and words: a "MISSION COMPLETE" or "ALL MISSIONS COMPLETE" banner over the stage,
  with an expanding ring of light. It is announced politely to screen readers and fades on its
  own after 3 seconds (4.2 seconds for the lesson finish).
- Ion badge: the symbol with a raised charge (Na⁺, Cl⁻) and a plain reason ("Positive ion:
  1 electron lost"), glowing warm for positive ions and cool for negative ones. It appears with
  a bright arrival when the atom first becomes an ion.
- The sky's tint follows the mission (violet, amber, teal, green; cyan in free play, gold when
  done) through `data-mission` on `.atom-builder`, fading between missions.
- Sound, through the shared soundscape:
  - a mission landing chord, and a longer chord when the lesson is finished;
  - "confirm" or "deny" for answers, "deny" for a missed Check, "open" for a hint;
  - a two-note chime when the atom becomes an ion.
- The moments, badge and tint are hidden in AR. Under reduced motion only the animations are
  shortened.
- The planned camera pull-back was replaced by the ring of light over the stage. It needs no
  renderer change and never moves the student's view.

## Phase 6: AR, VR and polish

- Phone AR: the shared HUD reads `--hud-*` tokens. Atom Builder redefines them on
  `.atom-builder`, so only its HUD turns dark (violet accent, readable at 4.5:1 or better).
  Ionic Bonding and Ohm's Law keep the light HUD. Wrong answers use a lighter red as text.
  The mission banner now shows in AR, floating in the upper middle of the camera view. The ion
  badge and sky tint stay hidden there, since the Element tab already shows the charge.
- Headset VR: `SceneRenderer` takes an opt-in `vrBackdrop: "space"`. VR then opens onto deep
  violet space with a still dome of stars 40 m away (no motion, so no comfort cost) and a
  violet floor disc that keeps the horizon reference. The default `plain` room is unchanged
  for other lessons.
- Headset panels: mission moments ("Mission complete: Build carbon-12") and the ion badge text
  ("Na⁺ · Positive ion: 1 electron lost") appear in the side panel's status line, so headset
  students see what the screen celebrates.
- Fix: IWSDK's XR pointer raycasts the whole scene every frame without a camera, and three.js sprites throw when raycast that way. That stopped XR rendering, so AR and VR showed nothing. The luminous atom's glow sprites now opt out of raycasting (they are never targets), with a regression test.
- VR mission banner: the page banner sat behind the 3D view in VR. `engine-render` now has `XrBanner` (`SceneRenderer.showXrBanner`), a camera-facing panel drawn from a canvas texture just above the model, always on top (no depth test, last render order), fading in and out, and skipped by pointer raycasts. Atom Builder uses it in VR only (AR keeps the page banner, so there is never a double banner), and hides the page banner while VR is active.
- Headset side-panel status line removed. It came and went (resizing the panel), and the panel font cannot draw raised charges (Na⁺ showed as boxes). Moments show as the 3D banner, and the element card already shows the charge.
- Emulator full screen: IWER moves the app canvas into its full-window container, but the renderer had pinned the canvas CSS size to the screen stage, which boxed the view with margins. `SceneRenderer` now sets the canvas to 100% while a session runs (all lessons), and leaving restores the stage size. Real devices present through the XR compositor and are unaffected.
- The luminous atom works the same in AR and VR (same `AtomView`). Its rings use fewer
  segments to stay light on phones.
- Not done here (owner's manual checks): 30 fps on a mid-range Android phone, ring legibility
  over a bright camera view, and the VR star dome on a real headset.

## Consequences

- For a few seconds two WebGL contexts can be busy at once: the descent, and the lesson
  mounting underneath it.
- Wording is drafted for the owner to edit in `apps/web/src/stage/theme.ts`.
