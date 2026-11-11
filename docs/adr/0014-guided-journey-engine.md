# ADR 0014: Guided journey engine

Status: Accepted

## Context

The Cell Explorer is a narrated, animated journey rather than free missions: the camera
moves between shots while narration plays, and each chapter ends with a checkpoint the
student answers on the live model. The owner wants this flow on every view (screen, phone
AR, headset AR/VR) and wants big reusable pieces shared, not rebuilt per module.

## Decision

- **Data.** `module.json` gains an optional `journey` block (`@mma/schema`): chapters,
  each with beats (`cueId` and/or `captionText`, optional `shot` and `highlight`,
  `durationMs` for when no audio plays) and an optional checkpoint, either `tap` (correct
  pick targets) or `choice` (2 to 4 options). Both have an explanation, a default
  "why not" message and per-answer `wrongFeedback`. The new narration trigger
  `journey_beat` marks cues that beats play directly. Validation checks cue, mission and
  option references.
- **Chapters are missions.** Each chapter names a mission whose goal is
  `{ "chapter": "<chapter id>" }`, and chapters follow mission order. Starting a chapter
  starts its mission; solving its checkpoint (or finishing its beats, when it has none)
  completes it. Mission hints are the checkpoint hints. This reuses the existing mission
  progress and telemetry (`mission_started`, `hint_used`, `mission_completed`); no new
  telemetry event types.
- **Scoring.** Checkpoints are not scored: a wrong answer explains why and counts an
  attempt, and the student retries. A chapter mission's `onComplete.triggerAssessments`
  are the scored questions, run by the existing lesson flow before the next chapter.
- **Reducer and view** live in `@mma/engine-lesson` beside the lesson flow:
  `createJourneyFlowReducer`, `createJourneyFlowState`, `projectJourneyFlowEvents`,
  `buildJourneyView`, `journeyCommandToAction`, `journeyTapAction`,
  `journeyBeatEndedAction`. State is plain data (status, chapter, beat, paused, unlocked
  chapter, misses, last answer), so pause, replay, chapter jumps and resume work.
  `JourneyView` is what any UI draws (caption, chapter list, controls, checkpoint,
  questions, shot id, highlight target). It never highlights the answer while a
  checkpoint waits.
- **Timing** stays outside the reducer. `JourneyBeatRunner` (`@mma/engine-voice`) ends a
  beat shortly after its narration ends, or after `durationMs` when sound is off, muted,
  missing or failing. `NarrationPlayer` gains `playCue`, `stopCurrentCue` and an
  `onCueEnded` callback; `journey_beat` cues are never triggered by learning events.
- **Camera.** `SceneRenderer.focusOn(shot)` eases the screen view to a `CameraShot`
  (focus point, distance, yaw, pitch), instantly with reduced motion; a drag, zoom or reset
  stops it, and XR sessions drop the screen framing. Shots are view-only and are named in
  the journey data; the module maps shot ids to `CameraShot`s.
- `?model-preview=journey` (development only) plays a two-chapter placeholder journey over
  the cell models.

## Consequences

- Any module can become a guided journey by adding `journey`, chapter missions and
  `journey_beat` cues, and by mapping its shot ids. AR and VR reuse the same reducer and
  view; only the drawing differs.
- A `sort` checkpoint (plant only / animal only / both) is not built yet; it waits until
  the Cell Explorer has more organelles.
- Beats restart from their beginning after a pause.
