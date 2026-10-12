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
  to state; initial state stays collapsed.
- **Edge hints:** 36px circles only in the open band between top controls and
  the bottom panel/sheet. Keep their full 36px bounds inside at least
  `max(36px, safe-area-inset + 8px)` margins; hide a hint when it collides with a control
  or no clear placement remains. The implementation is in `spatial-hints.ts`
  and `index.ts`.
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
- Spatial body text is at least 18 CSS-pixel-equivalent units in
  `spatial-layout.ts`/`panel-layout.ts`; spatial interactive rectangles are at
  least 44 canvas pixels high. DOM sheet text is 16px and its buttons are at
  least 44 CSS pixels high. The code does not define a physical-metre
  conversion for screen-pixel hit targets.

## Spatial panel slots

Positions are panel centres relative to the atom origin, in metres; dimensions
are width × height, also metres. Collapsed sizes are shown as width × height.
All panels face the viewer.

| Slot | Position (m) | Expanded (m) | Collapsed (m) | Collapsible |
|---|---:|---:|---:|---|
| Mission | (0, 0.37, -0.15) | 0.55 × 0.16 | 0.55 × 0.16 | No |
| Particles | (-0.36, 0, -0.15) | 0.28 × 0.38 | 0.28 × 0.11 | Yes |
| Element info | (0.36, 0, -0.15) | 0.28 × 0.38 | 0.28 × 0.11 | Yes |
| Narration | (0, -0.37, -0.15) | 0.50 × 0.16 | 0.50 × 0.11 | Yes |
| AR controls | (0, -0.62, -0.4) | 0.58 × 0.20 | 0.58 × 0.20 | No |
| Diagnostics | (-0.6, -0.42, -0.28) | 0.72 × 0.82 | 0.72 × 0.82 | No |
| Settings | (0.5, -0.57, -0.15) | 0.34 × 0.66 | 0.34 × 0.11 | Yes |

`spatial-layout.ts` is the shared slot source; `screen-renderer.ts` registers
the slot keys and their collapsibility, while a module supplies the content
items through `spatial-panels.ts`-style builders. There is no per-module
manifest for spatial slots today. A new slot therefore requires an intentional
engine layout/type and renderer registration change as well as module content;
do not silently redefine a shared slot.

## Collapse and expand rules

The mission, AR controls, and diagnostics are fixed-size/non-collapsible.
Particles, element info, narration, and settings have declared collapsed
dimensions. The lesson/camera DOM bar begins collapsed and uses the
state-aware Expand/Collapse label. Keep that default when adding controls.

## Handheld, headset, and orientation

Handheld layouts use safe-area insets, phone-sized controls, and portrait scale
0.82; landscape uses scale 1. Headsets use the viewer-facing spatial panels and
do not depend on the phone DOM settings sheet. Camera view remains a DOM
overlay and screen-mode fallback. The scale and viewer-relative placement are
from `spatial-layout.ts` and `visuals/spatial-placement.ts`.

## Do and do not

- Do reuse `glass-tokens.css` for DOM glass and `spatial-tokens.css` for canvas
  panels.
- Do reserve safe areas and keep 44px DOM targets / 44 canvas-pixel spatial
  controls.
- Do keep content in the declared spatial slots and preserve the screen
  fallback.
- Do not overlap hints with controls, hide a collapsed default, or add new
  slots by hard-coding a transform in a module.
- Do not assume headset APIs, camera access, or backdrop-filter support.

## Before adding a block

1. Identify its screen-mode fallback and the existing screen/AR/camera zone.
2. Reuse a declared slot or request an engine-level slot change.
3. Check safe-area, top/bottom control, hint, sheet, and modal collisions in
   portrait and landscape.
4. Use existing tokens, readable text, and minimum target dimensions.
5. Route actions through existing handlers and verify collapsed behavior.
6. Run typecheck, lint, unit tests, e2e, and the web build; check a phone and a
   desktop/headset-sized viewport.
