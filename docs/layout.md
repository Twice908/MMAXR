# Layout reference

This reference records the implemented screen and spatial layout. Shared rules
come from `modules/chem-atom-builder/src/atom-builder.css`,
`apps/web/src/camera-view.css`,
`modules/chem-atom-builder/src/glass-tokens.css`,
`modules/chem-atom-builder/src/spatial-tokens.css`,
`modules/chem-atom-builder/src/horizon-tokens.css`,
`packages/engine-render/src/spatial-layout.ts`, and
`packages/engine-render/src/visuals/panel-layout.ts`.
Shared immersive glass and XR design values live in
`packages/engine-render/src/xr-tokens.ts`.
The supplied desktop/headset Atom Builder reference geometry is recorded as
data in `modules/chem-atom-builder/src/reference-layout.ts`; immersive AR/VR
uses that data for its shell, content regions, and four populated glass
panels. Android Camera view uses the same Android panel group over its local
video feed; desktop Camera view retains the existing spatial dock.

Before changing AR/VR/MR/XR UI, read [docs/horizon-ui.md](./horizon-ui.md)
and use its Meta Horizon OS UI Set components and verified tokens. Do not
infer kit dimensions or visual styles.

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

- XR-facing in-scene UI uses Horizon OS UI Set components and values from
  [horizon-ui.md](./horizon-ui.md); the 2D screen-mode UI is unchanged.
- **Top controls:** safe-area-inset-aware exit and Settings buttons. Keep the
  Settings button above the settings scrim so it can close the sheet.
- **Bottom bar:** the collapsed lesson/camera panel is anchored to the bottom
  safe area. Its control says “Expand panels” or “Collapse panels” according
  to state; the dock keeps Mission open by default.
- **Edge hints:** disabled for the dock; all four/five tabs are in one row.
- **Settings sheet:** a two-column, scrollable sheet capped at 40dvh; controls
  use at least the kit's 48 dp hit target and 16 CSS px handheld body-text
  floor. The floor supports readability for world-anchored text viewed on a
  phone. Sound, captions, and speed use existing narration actions and
  speed-change handling. The scrim, Close, or Settings closes it.
- **Modal:** near-opaque white (0.97 alpha) surface, dark blurred backdrop, and
  visible 48 dp minimum action targets. Keep dialog content and actions inside
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
  16px, button radius 12px, and a legacy minimum tap target from
  `glass-tokens.css`. For XR-facing UI this is superseded by the kit's 48 dp
  minimum (60 dp for primary controls with hand tracking). Sheet groups add an
  8px local gap; see [horizon-ui.md](./horizon-ui.md) for kit typography.
- The camera-view dock retains the legacy `spatial-tokens.css` values. New
  immersive panel padding, gaps, radii, and surface treatments use
  `engine-render/src/xr-tokens.ts`.
- Spatial dock text uses the kit type scale, with interactive rectangles at
  least 48 dp in both dimensions; primary controls with hand tracking are at
  least 60 dp. Keep a 16 CSS px body-text floor for handheld world-anchored
  text because it is viewed at a phone's distance.

## Camera-view spatial dock row

Camera view uses one viewer-facing dock, independent of atom
placement. It has one row of equal-width tabs: Mission, Particles, Element,
Sound; Settings is appended only if the DOM overlay is unavailable. All tabs
are visible at once, with row width capped at 92% of the visible viewport.
Mission is selected initially. Tapping a tab selects its detail; tapping the
selected tab collapses the detail. Particles and Element remain available in
free play. A tooltip-style hint, “Tap a tab to open it. Open Particles to build
the atom.”, is shown until the first tab tap.

The one open detail is a Card on a Panel surface, directly above the tabs,
with the same width as the row and height capped at 38% of the visible height.
Mission controls use a 2x2 grid: Check is primary; Hint, Free play, and Reset
atom are secondary. Content is wrapped without ellipses; longer details page
with previous/next controls. Tab and control states include default, hover,
pressed, and disabled.

The row is sized in CSS-pixel-equivalent units, then converted to metres using
the view projection at the dock depth:

`pixelsPerMeter = viewportHeight * projectionY / (2 * distanceMeters)`

where `projectionY` is the vertical projection-matrix scale (equivalently,
`1 / tan(verticalFov / 2)`). The dock is placed once from the viewer's gaze and heading, about 0.7 m ahead
and in the lower portion of the visible area; it is not continuously attached
to the viewer or atom anchor. Reset view re-places it from the current gaze.
This dock remains for non-Android Camera view only.
Targets are at least 48 dp; primary controls with hand tracking are at least
60 dp. Panel text follows the kit scale with a 16 CSS px handheld body-text
floor. A 10%-top/14%-bottom safe band reserves space for overlay controls.
Parameters and validation live in `spatial-layout.ts`.

The module continues to supply the same content items and action ids through
`spatial-panels.ts`; the renderer changes only their presentation. The dock is
view-only and does not change learning state directly.

## Handheld, headset, and orientation

The non-Android camera dock is upright and yaw-aligned to the viewer (no pitch or roll).
Immersive Android AR/VR selects `reference-layout-android.ts` when the XR
session profile is handheld (`screen-space` VR or handheld AR); the model panel
is centered on the first valid viewer pose. The group is placed once, yaw-only,
and remains fixed as the phone's XR viewer pose changes. Its shell uses the
existing shell glass variant behind the union of reference items, with the
existing 24 px shell-padding token; the reference has no visible shell edge.
Scale and Position are horizontal sliders below Mission.
The Android limits are scale min/default/max `0.4/0.65/1` and distance
`1.1/1.25/1.8 m`; minimum-scale fit is checked against both phone orientations.
At scale `0.4`, distance `1.25 m`, and an assumed 60-degree vertical FOV, 16 dp
body text projects to about 3.9 px in portrait and 1.8 px in landscape, too
small for comfortable reading. Verify the actual phone projection before
revising the trade-off. The reference has a Captions toggle but no caption text
region, so no caption placement is inferred.

World-space/headset sessions continue to use the desktop/headset reference data
and the existing headset `PANEL_LIMITS`. The Android reference intentionally omits the MMAXR/Atom Builder header. The
owner-added Hint, Check, and Free play pills sit below the slider pair, are
marked as absent from the PNG, and use the existing desktop action-pill
dimensions and styles. The shell extends below the source image to contain that
row; its glass remains the existing shell variant with the 24 px outer-padding
token. Camera view selects this layout only when the browser User-Agent
identifies Android. Its group is fixed and upright; DeviceOrientation supplies
look-around relative to the initial pose, and one-finger drag on empty canvas is
the fallback when motion access is denied or unavailable. Reset View recenters
the model stage and camera look-around. The legacy Camera dock is hidden only
while this group is active; its collapsed header toggle remains available and
can expand the original DOM controls. Hint, Check, Free play, particle,
narration, reset, and caption actions are represented in the group. The legacy
panel expand/collapse toggle has no counterpart in the PNG and stays in its
existing header as a fallback. Settings and Camera exit remain outside the
dock. The desktop Camera dock and all headset behavior remain unchanged.

## Do and do not

- Do reuse `glass-tokens.css` for DOM glass and `spatial-tokens.css` for canvas
  panels.
- Do reserve safe areas and keep 48 dp minimum targets / 60 dp primary
  hand-tracked controls.
- Do keep the camera-view four/five tabs in their declared order and preserve
  the screen fallback.
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
