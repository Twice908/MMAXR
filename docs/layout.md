# Layout reference

This reference records the implemented screen and spatial layout. Shared rules
come from `modules/chem-atom-builder/src/atom-builder.css`,
`apps/web/src/camera-view.css`,
`modules/chem-atom-builder/src/glass-tokens.css`,
`modules/chem-atom-builder/src/spatial-tokens.css`,
`packages/engine-render/src/spatial-layout.ts`, and
`packages/engine-render/src/visuals/panel-layout.ts`.

## Principles

- Keep screen mode usable without camera, AR, or VR. Camera and AR presentations
  float controls over the scene; they do not replace the screen-mode fallback.
- Derive spatial positions from the shared layout rather than placing controls
  ad hoc. Keep repeated DOM controls and spatial panel items routed through
  existing handlers.
- Use the chemistry module's glass tokens and local fonts. Do not invent a new
  spacing or contrast system for a module.

## Screen layout

`atom-builder.css` uses a three-column desktop content grid (248px, flexible
centre, 280px), changes to a two-column grid at 920px, and stacks workspace,
particle rail, and inspector at 620px. The screen scene has a 64vh/620px
minimum cap on wide layouts and a 45vh/400px cap on phone layouts. These are
existing breakpoints and dimensions, not suggested overrides.

## AR and camera DOM overlay zones

- **Top controls:** safe-area-inset-aware exit and Settings buttons. Keep the
  Settings button above the settings scrim so it can close the sheet.
- **Bottom bar:** the collapsed lesson/camera panel is anchored to the bottom
  safe area. Its control says “Expand panels” or “Collapse panels” according
  to state; the dock keeps Mission open by default.
- **Edge hints:** disabled for the dock; all five cards are in one paged row.
- **Settings sheet:** a two-column, scrollable sheet capped at 40dvh; controls
  use the 44px glass tap target and 16px text. Sound, captions, and speed use
  existing narration actions and speed-change handling. The scrim, Close, or
  Settings closes it.
- **Modal:** near-opaque white (0.97 alpha) surface, dark blurred backdrop, and
  visible 48px minimum action buttons. Keep dialog content and actions inside
  the viewport.
- **Toast/status:** status copy is brief, auto-dismisses, and on phone sits
  above the panel/control region rather than over particle controls.

Safe-area rules use the CSS `env(safe-area-inset-*)` values and the explicit
minimum in `atom-builder.css`/`index.ts`; do not position hints over top or
bottom controls.

## Layer order

Back to front: scene (camera video then atom canvas), spatial glass panels,
edge hints/bottom controls, top controls, settings scrim (31) and sheet (32),
then a modal in the browser's dialog top layer. `camera-view.css`,
`atom-builder.css`, `index.ts`, and `ar-controls.ts` own these layers.

## Spacing, type, and hit targets

- DOM glass spacing: panel padding 14px, pill padding 4px 12px, panel radius
  16px, button radius 12px, and 44px minimum tap target from
  `glass-tokens.css`. Sheet groups add an 8px local gap.
- Canvas spatial tokens mirror `spatial-tokens.css`: 22px panel padding,
  17px sidebar padding, 10px 14px control padding, 18px layout gap, 22px
  sidebar gap, and 8px control gap.
- Spatial dock text is at least 16 CSS-pixel-equivalent units, with interactive
  rectangles at least 44px in both dimensions. DOM sheet text is 16px and its
  buttons are at least 44 CSS pixels high.

## Spatial dock row

AR, camera view, and VR use one viewer-facing dock below the atom. Its compact
cards are ordered Mission, Particles, Element, Narration, Settings. Mission is
open initially; selecting a card opens its detail directly above the row, and
selecting it again (or the open detail) closes it. At most one detail is open.
On narrow viewports, the dock pages horizontally using 44px arrow targets
instead of shrinking cards. DOM Exit, Reset view, Settings, and the bottom
bar remain separate controls.

The row is sized in CSS-pixel-equivalent units, then converted to metres using
the view projection at the dock depth:

`pixelsPerMeter = viewportHeight * projectionY / (2 * distanceMeters)`

where `projectionY` is the vertical projection-matrix scale (equivalently,
`1 / tan(verticalFov / 2)`). Width is capped at 92% of the viewport. Card and
pager targets are at least 44px, and panel text is at least 16px in compact and
detail views. A 10%-top/14%-bottom safe band reserves space for overlay
controls. Handheld AR and camera view use the 0.75m profile; world-space
headsets use the 1m profile and a gentler 15-degree downward arc. Both
parameter sets and their validation live in `spatial-layout.ts`.

The module continues to supply the same content items and action ids through
`spatial-panels.ts`; the renderer changes only their presentation. The dock is
view-only and does not change learning state directly.

## Handheld, headset, and orientation

The dock is upright and yaw-aligned to the viewer (no pitch or roll). Handheld
AR/camera uses the phone-distance profile; headsets use the 1m arc profile.
Camera view continues to use local video and screen input. Ordinary desktop
and Android screen mode retain their existing layout.

## Do and do not

- Do reuse `glass-tokens.css` for DOM glass and `spatial-tokens.css` for canvas
  panels.
- Do reserve safe areas and keep 44px DOM targets / 44 canvas-pixel spatial
  controls.
- Do keep the five dock cards in their declared order and preserve the screen
  fallback.
- Do not hide the default Mission detail or add dock cards by hard-coding a
  transform in a module.
- Do not assume headset APIs, camera access, or backdrop-filter support.

## Before adding a block

1. Identify its screen-mode fallback and the existing screen/AR/camera zone.
2. Reuse the dock card model or request an engine-level layout change.
3. Check safe-area, top/bottom control, hint, sheet, and modal collisions in
   portrait and landscape.
4. Use existing tokens, readable text, and minimum target dimensions.
5. Route actions through existing handlers and verify collapsed behavior.
6. Run typecheck, lint, unit tests, e2e, and the web build; check a phone and a
   desktop/headset-sized viewport.
