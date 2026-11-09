# ADR 0006: Supported views per device; Camera view removed

Status: Accepted (supersedes ADR 0003)

## Context

The app had grown about eight presentations: Screen, desktop Camera view,
Android Camera view, Android AR, phone VR with a viewer, headset AR, headset
VR, and desktop AR/VR through the emulator. Camera view (webcam video behind
the atom, no world tracking) duplicated real AR badly. Its panel dock was the
glass-panel code removed in the IWSDK port (ADR 0005), so it no longer worked.

## Decision

- Remove Camera view on every device (`apps/web/src/camera-view.*`, the
  renderer's camera look-around and transparent-background hooks, and its
  module listeners).
- Screen view is the default everywhere and the fallback when AR or VR is not
  available. A phone without ARCore gets the Screen view only.
- Android Chrome with ARCore offers Enter AR (handheld, DOM overlay controls).
- Phone VR with a Cardboard-style viewer is hidden on touch-first devices
  (no fine pointer) until a viewer mode is designed.
- Headsets offer Enter AR (passthrough) and Enter VR, with IWSDK input and
  Horizon UI panels.
- Desktop Enter AR/VR stays, for development with the IWSDK emulator only.

The `camera_view_started`/`camera_view_ended` telemetry types were removed
from `@mma/schema`; the schema now rejects them.

Phone AR uses a HUD on the WebXR DOM overlay (`modules/chem-atom-builder/src/ar-hud.ts`
and `ar-hud.css`), replacing the old collapsible drawer and settings sheet:

- Top bar: mission status chip, round Reset view button, red Exit AR.
- Bottom tab bar in the thumb zone (Fitts's law): Mission, Build, Element,
  Sound. Four choices only (Hick's law), labelled icons, 60px targets.
- One sheet at a time above the tabs, at most 46% of the screen height;
  tapping the open tab or Escape closes it so the camera view is clear.
- A new question opens the Mission sheet; other mission feedback puts a dot
  on the Mission tab. Captions sit above the sheet and are always visible.
- A gesture tip ("Pinch to resize. Drag to turn the atom.") shows for five
  seconds. Touch on the open camera view turns and resizes the atom.
- Landscape phones put the sheet and tabs on the left, leaving the right
  side clear for the atom.
- Colours match the headset Horizon panels, with WCAG AA text over any
  camera backdrop (checked in `tests/ar-hud.test.ts`).

## Consequences

- Five views instead of about eight; one phone AR layout to fix.
- No AR-like experience on phones without ARCore.
- Four desktop browser tests that assumed the pre-IWSDK camera geometry were
  removed and need rewriting (drag-drop rejection, full mission run, next
  shell hint, lazy-load drop check).
