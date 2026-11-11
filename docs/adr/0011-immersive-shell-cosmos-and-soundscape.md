# ADR 0011: Immersive shell (cosmos, soundscape and transitions) for login and dashboard

Status: Accepted

## Context

The owner wants the app to feel fully immersive and vast ("gazing at stars from a spaceship")
without losing the learning goals. The first step covers only the login and dashboard:
real-feeling light, sound and motion, with subjects shown as stars and experiments as planets,
and navigation carried by sound and colour rather than extra UI. Every part must be reusable.
Lessons themselves are unchanged.

## Decision

- New shared package `@mma/engine-ambience` (depends on `three` only; lint forbids apps,
  kits, modules and lesson packages):
  - `createCosmos`: a WebGL backdrop. A domain-warped nebula is rendered at half or 0.4
    resolution, then composited with a vignette, film grain and dithering. A deep instanced
    star field has real parallax (pointer and scroll) and stretches into streaks at warp
    speed. Planets come in four styles (`banded`, `crystal`, `storm`, `ocean`), with
    atmosphere halos, optional electron-shell rings and a moon. Stars have granulation, a
    corona and diffraction spikes, and orbit ribbons carry a moving light.
  - Bodies are anchored to DOM elements (`anchorTo`). CSS lays out the scene responsively
    and the sphere is matched to the element by viewing angle (`rectToWorld`), so the DOM
    keeps accessibility, focus and touch targets.
  - `travel(1)` flies a body to fill the screen. Every other body follows the same camera
    dolly and sweeps outward, so a dive feels like flight. Palette changes blend with
    `mixVivid`, so hue changes never pass through grey.
  - `createSoundscape`: Web Audio synthesised live, so there are no audio files or licences.
    The chain is buses, then a glue compressor, a limiter and a master fade. A generated
    stereo hall reverb darkens as it decays, and a filtered ping-pong echo feeds it. The
    ambient bed is a five-voice detuned pad through a breathing filter, plus a sub, an "air"
    layer, pink-noise solar wind and seeded distant chimes.
  - Moods (`SoundMood`) glide the pad between chords. The cues are hover, select, confirm,
    deny, open, close and tick, plus `warp`, `dive` and `rise` sweeps and an arrival.
    Audio starts only after a user gesture, pauses while the page is hidden, and is
    switched by a remembered on/off preference.
  - `createVeil` (a colour wash that covers lesson loading), `revealIn`, `departOut` and
    `shake` (shared motion), and `createSoundToggle`.
- `apps/web/src/stage`: a persistent `Stage` (one cosmos, one soundscape, one veil) that
  outlives page changes. `theme.ts` holds palettes, moods and the look of each subject's star
  and each experiment's planet; a new experiment gets a default planet until it has its own
  look. `transitionFor` names each page change: open, launch, depart, dive, surface or fade.
- Router: screens now return `{ leave(to), dispose }`. Page changes are queued, so an exit
  animation always finishes before the next page mounts. The page is `inert` while it
  leaves.
- Dashboard: each subject is a star system and each experiment a planet link (`Open <title>`,
  time, Draft badge). Pointing at or focusing a planet recolours the nebula to that planet's
  palette, lights the space around it, glides the music to its subject's chord and rings
  the planet's own note.
- Login: a card in orbit above a giant planet backlit by a distant sun. A wrong code gives
  a soft "deny" sound, a shake and a brief warm flash. Signing in jumps to light speed.
- Degrade, never fail: without WebGL a CSS gradient follows the palette and CSS draws the
  planets. Reduced motion freezes drift, twinkle and streaks and shortens transitions to
  fades. Without Web Audio the app is silent. The cosmos is hidden and paused while a
  lesson has the screen.

## Consequences

- three.js now loads with the first page (about 214 KB gzipped for the entry chunk). Lessons
  reuse the same cached chunk.
- Sound and colour carry no information that is not also on screen; all text and controls
  stay in the DOM.
- Performance on a mid-range Android phone and on headsets is not yet measured. The low
  tier halves the star count, renders the nebula at 0.4 resolution and caps the pixel ratio
  at 1.5.
- Future screens and lessons can reuse the cosmos and soundscape, for example an "arrival"
  inside a lesson.
