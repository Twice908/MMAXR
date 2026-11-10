# ADR 0008: Shared lesson packages and the Ionic Bonding module

Status: Accepted

## Context

Ionic Bonding is the second module. Atom Builder kept its mission flow, page and
single-atom drawing inside the module, so a second module would have had to copy
about 1,000 lines. The owner asked that new work be reusable by future modules, and
that existing modules keep working: shared code is changed only when the old module
behaves exactly as before; otherwise the code is copied and renamed for the new module.
The owner also dropped the liquid-glass UI skill (`skills/mmaxr-skill.md`, now deleted)
in favour of the Horizon UI kit for XR and standard UX rules for every view.

## Decision

- `@mma/engine-lesson` (pure, no DOM or Three.js): the mission and check-question
  reducer, event projection, a lesson view model and the lesson button commands.
  Atom Builder now uses it; its state shape and text are unchanged.
- `@mma/engine-ui` (DOM, subject-neutral): the screen-mode lesson panel and shared
  `lesson-ui.css` (44/48 px targets, visible focus, AA contrast, reduced motion).
  Atom Builder keeps its own page for now; moving it is optional later work.
- Chemistry kit: `layoutAtom` moved in from Atom Builder (re-exported there), plus an
  ionic compound table, bonding rules and a bonding scene layout. A new compound is
  one table row; `ionicCompoundIssues` checks that its electrons balance.
- `engine-render`: `MoleculeView` draws several atoms and attraction/bond lines;
  `SceneRenderer` gained opt-in `content`, `screenZoom`, `xrContentScale`,
  `fitToWidth`, `projectContentPoint` and `setHighlight`. Without them it behaves as before.
- Ionic Bonding web view: drag an electron chip onto an atom in the model, or tap a
  giver then a taker (also works by keyboard and screen reader). Dragging that starts
  on the 3D model still turns it, so the existing input adapters are unchanged.
- Narration cues are left out of the Ionic Bonding manifest until audio is generated;
  the scripts are in `narration/en/` for review.

## Consequences

- Two more workspace packages, both with lint boundary rules and tests.
- Future modules reuse the lesson flow, lesson panel, kit layouts and `MoleculeView`.
- The narration generator page only knows Atom Builder; it needs a module choice
  before Ionic Bonding can have audio and captions.
- AR (added later the same day): `engine-ui` gained `mountXrSession` (consent, status,
  comfort reminder, Exit, telemetry) and `createXrHud` (phone AR tab bar), generalised
  copies of the Atom Builder's AR controls and HUD, which stay unchanged in that module.
  `engine-render` gained `createXrModulePanels` / `SceneRenderer.setModulePanels` for
  headsets and the desktop emulator, and an opt-in `handheldOverlay` so page overlays
  and touch picking follow the phone's AR camera. Desktop AR uses the IWSDK emulator,
  not a camera feed. Headset electron moves are panel buttons; direct 3D grabbing is
  left for the VR stage.
- Web-view drag-to-turn now follows the pointer horizontally (both modules); handheld
  AR keeps its original direction.
- VR for Ionic Bonding is not built yet.
- One shared version per feature (owner's rule): the Atom Builder's original AR controls
  (`mountArControls`, with consent, toasts, comfort reminder and `?xrdebug=1` report), phone
  AR HUD (`createArHud`) and narration bar (`createNarrationBar`) moved to engine-ui with
  their original markup, ids and wording; both modules use them. The HUD holds the page
  sections (and caption) during every session and stays hidden without a DOM overlay, so
  the web page never shows behind headset or emulator views. Headsets use the shared
  `createXrModulePanels`, which gained steppers, a dark info card and dock actions so the
  Atom Builder keeps its earlier panel look; the renderer's `xr-lesson-panels.ts` is gone.

