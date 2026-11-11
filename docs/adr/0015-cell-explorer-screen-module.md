# ADR 0015: Cell Explorer screen module (floating stage)

Status: Accepted (screen mode; content pending the teacher's review)

## Context

Phase 3 of the Plant vs Animal Cell explorer: the first biology module, built on the
biology kit and cell views (ADR 0013) and the guided journey engine (ADR 0014). The owner
asked for a light, playful, realistic page in green and white, not a dark room; for the
Dashboard's pattern of content in open space, with no flat panels; and for Atom Builder,
not the Ohm's Law circuit page, as the reference. From two mocked layouts the owner chose
Option A, the floating stage.

## Decision

- New module `modules/bio-cell-explorer` (`@mma/bio-cell-explorer`, id `bio.cell-explorer`,
  draft, screen mode). Its four layers are: Manipulate (turn and zoom the model, tap any
  structure to see its name); Simulate (highlights, cut-open close-ups); Mission (four
  chapters, each a mission); Check (six scored questions).
- **Content.** The chapters are Two cells, Mitochondria, Chloroplasts and Recap. Beat
  captions, three tap checkpoints and one choice checkpoint, mission hints and six scored
  questions are all drafted and pending the teacher's review. Captions avoid "left" and
  "right" because phones stack the cells. Narration audio comes in Phase 4; until then
  each beat shows its caption for its `durationMs`.
- **Floating stage.** The 3D stage fills the page. Over it, with no panels:
  - a dotted chapter path at the top (dots only on phones);
  - the caption, or the checkpoint and question, floating under the model;
  - answers as pills;
  - round icon controls (pause or resume, skip, replay chapter, reset view);
  - "Universe" to go back.
- **Pinned labels.** Labels are pinned to points on the model and follow the camera every
  frame through `SceneRenderer.projectContentPoint`: the cell names, the highlighted
  structure's name (pinned to the instance nearest the viewer), and every part of an opened
  close-up. No labels show while a checkpoint or question waits, so they never give the
  answer away.
- **One continuous space.** `src/scene.ts` is pure and unit-tested:
  - On wide screens the cells sit side by side; below an aspect of 0.9 they are stacked.
  - Close-ups zoom into a real organelle inside a cell (owner's change, 2026-11-11): a
    mitochondrion in the animal cell, a chloroplast in the plant cell. `organelleSpot` picks
    the one nearest the viewer and the cell's middle. While the close-up shows, that
    organelle is hidden (`CellSceneFrame.hiddenOrganelles`) and the opened model, 15% larger,
    sits in its place, so the camera flies straight into the cell.
  - Shot ids (`space`, `wide`, `plant`, `animal`, `mito-detail`, `chloro-detail`) become
    `CameraShot`s fitted to the viewport (close-ups frame their organelle), keeping 30% of the frame below the model for the
    words.
  - The intro starts at `space` (the cells tiny in empty space) and Start flies in over
    3.4 seconds. Reduced motion makes every move instant.
- **Light theme** in `cell-explorer.css`:
  - a white-to-leaf-green gradient with slowly drifting soft specks (still under reduced
    motion);
  - glass pills and leaf-green primary actions;
  - white halos behind the floating text, for legibility over the model.
- **Lighter phones.** Phones (coarse pointer) get low-polygon cells with fewer small parts.
- **Dashboard.** The Biology star is lit, and the module has its own planet: a green
  ocean-and-land world with a soft pink moon (the animal cell).
- `e2e/cell-explorer.spec.ts` covers the dashboard entry, start, skip, pause and resume, the
  first checkpoint's hint, and Universe.

## Consequences

- The journey engine, cell views and kit are used unchanged, so AR and VR (Phases 6–7)
  reuse the same chapters and checkpoints.
- Sound cues and chapter moments are deferred to Phase 5, and narration to Phase 4.
- The dashboard opens the module with the colour fade, since there is no descent script
  for it yet. The page's own fly-in from empty space is its arrival.
- The e2e spec needs the e2e dev server, which cannot start while another IWSDK dev
  runtime runs in the workspace.

## Phase 4: narration

- Every beat has its own narration cue (19 in all, trigger `journey_beat`, cue id = beat
  id). Each script in `narration/en/<beat id>.json` speaks the same words as the beat's
  caption and is pending the teacher's review.
- The page uses the shared `NarrationPlayer` (asset loader and telemetry included) with the
  `JourneyBeatRunner`. A beat ends shortly after its line ends, or after its `durationMs` when
  sound is off, muted or missing. Pressing Start counts as the tap that switches sound on,
  so the first line is spoken.
- The dock gains Sound (on, mute, unmute) and Captions buttons. Turning captions off hides
  the floating caption.
- Audio is made with the shared browser Piper generator (`?narration-generator=bio.cell-explorer`,
  draft scripts included) and committed as `narration/en/generated/<beat id>.mp3` and `.vtt`.
  Until a clip exists, its beat runs silently on its caption, so the module never breaks.
- Draft audio generated on 2026-11-11 with the Jenny voice: 19 clips, 0.62 MB in total, each
  passing the generator's loudness and length checks. Cues also link the generated `.vtt`
  files, so while a line plays the floating caption follows it sentence by sentence.

## Phase 5: living cells, clear highlights, moments and sound

- **Highlight that says "this one".** The owner found the old yellow glow too faint to show
  what the narrator meant. `CellView` now:
  - outlines the highlighted structure in magenta, with an outline of constant on-screen
    width (an inverted hull in a small shader; instanced batches share their outline's
    matrices);
  - adds a magenta glow, and pulses both;
  - fades every other structure 42% towards a pale tone.

  See-through shells (wall, membrane, vacuole) light only at their rim: they write depth while
  highlighted, so the outline never shows through them. Magenta sits opposite the cells'
  greens and oranges. The pinned label of the highlighted part becomes a magenta pill that
  pulses in step.
- **Living cells.** The owner found the models lifeless. `CellView` now:
  - sways each scattered organelle a few hundredths of a unit and turns it slightly (the
    grana ride inside their chloroplasts);
  - breathes the cells (the soft animal cell more than the walled plant cell);
  - floats the nucleus and the opened models.

  All waves start from rest, so time 0 is the exact layout. Motion advances once per drawn
  frame through an invisible driver mesh, so it also runs in XR, and `animate(time)` sets
  any moment for tests. Phones skip moving the ribosomes. Reduced motion keeps everything
  still. The motion is view-only and suggests no biology beyond "alive".
- **Shared journey moments.** `journeySnapshot` and `journeyMoments` (`engine-lesson`, pure)
  report chapter start, checkpoint, wrong, solved, hint, scored answer, chapter complete and
  journey complete, for any journey module.
- **Moments on the page:**
  - "CHAPTER COMPLETE" and "JOURNEY COMPLETE" banners with a ring of light, fading after 3
    and 4.2 seconds;
  - rings where the student tapped (green when right, coral when not yet, soft when
    exploring);
  - the wrong-answer reason nudges;
  - the sky's tint cross-fades per chapter (fresh green, warm peach, deep green, sunny gold,
    golden finish).
- **Sound.** Sound uses the app's shared soundscape (`ExperimentContext.sound`, the same
  switch as the dashboard), mapped in `src/sound.ts`, which is pure and tested:
  - each chapter has its own pad chord, getting brighter;
  - the fly-in plays a dive, then a landing;
  - checkpoints chime; confirm or deny for answers; open for hints; select while exploring;
  - landing chords for a finished chapter or journey;
  - the music ducks while the narrator speaks.

  Every sound repeats something on screen.

## Phases 6 and 7: AR and VR (wired; owner testing)

- The owner chose Atom Builder's banner style over Horizon panels: it suits a narrated
  session and blends in. There are no module panels in XR.
- **Entry.** The shared `mountArControls` handles Enter AR and Enter VR, the consent dialog,
  comfort breaks and exit, with a tiny module HUD.
- **Phone AR (DOM overlay).** The page's own floating words, answer pills, banners and dock
  stay over the camera. The page turns see-through, and the caption and question get a
  light glass backing.
- **Headsets and the emulator.**
  - The XR banner (`SceneRenderer.showXrBanner`) shows the chapter-complete and journey moments.
  - A new shared `XrCard` (`engine-render`), in the same soft-glow style, shows the caption or
    question with pill buttons (answers, Hint, Continue, Pause, Skip, Exit). It is world-locked
    below the model and pressed with the controller ray.
  - Tap checkpoints are answered by pointing at the model (`SceneRenderer.setXrPicking`). While
    picking, drag-to-turn and the see-through shells step aside.
- **Shots in XR.** The student's view never moves. `SceneRenderer.focusOn` in XR moves the
  model instead: the shot's focus point comes to the model's place, and the model scales so
  the framed area appears about 0.7 m away, easing over 1.6 s (instant with reduced motion).
  The fly-in grows the cells from far away, and the organelle zoom brings the opened
  mitochondrion or chloroplast up to the student. In XR the cells always stand side by side.
- **Not tested here.** Owner testing is pending on Android, a headset and the emulator, and
  no new automated tests were added (owner's choice).

## Fewer clicks and the side card (owner feedback after XR testing)

- **Card placement.** The headset card moved from below eye level to the student's right of
  the model, at eye level and facing them (`XR_LAYOUT.cardYaw`), and grew to 0.6 m wide.
  Card pills now lift when pointed at and sink when pressed (`XrCard.setPointer`). Page pills
  and round buttons have distinct hover, pressed and on states.
- **The journey moves on by itself:**
  - A solved checkpoint shows its explanation for 3.5 s, then goes to its questions or the
    next chapter. The "Questions" and "Next chapter" buttons are gone.
  - A right answer moves on after 3.5 s.
  - A wrong answer plays a narrated clip of the correct answer and why (6 new `answer-*`
    cues, draft Piper audio, scripts pending review), then moves on. Without sound it waits
    long enough to read it.
  - "Next question" still skips the wait and stops the voice.
- **Side card, revised.** The headset card is now a light, rounded Horizon-style panel
  (white, thin green border, green primary pills, coral for a wrong answer). The soft green
  glow is gone. It sits further right (about 50° from straight ahead, 0.78 m away, at eye
  level) so it clears the cells in every shot, and it draws on top of the scene, so a model
  that grows around the student never covers it.
- **Card below the cells (owner's choice).** The card is straight ahead, 0.72 m away, just
  below the cells and tilted up towards the eyes. The cells are lifted to eye level
  (`xrLift` 0.12 m), so the card sits only a little below eye level.
