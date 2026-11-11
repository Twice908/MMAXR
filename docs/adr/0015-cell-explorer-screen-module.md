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
