# Meta Horizon OS UI Set

This is the source of truth for XR-facing UI. New spatial panels, in-scene
controls, AR/camera DOM overlays, dialogs, sheets, and toasts must use the kit
components and this reference before implementation. Do not infer a component,
dimension, spacing, or visual style that is not documented here.

The repository has no `references/horizon-ui-set/` export or
`docs/horizon-ui-spec.md` at the time of writing. Values explicitly supplied
for this task are recorded below; unspecified kit details are marked
`TODO(kit)` pending an authoritative reference.

## Components

The kit component inventory is:

- Buttons: primary, secondary, borderless, destructive, tile, and shelf.
- Tooltip, card, dialog, dropdown, slider, panel, and window.
- Selectors: toggle, checkbox, and radio.

Component-specific dimensions, spacing, colors, corner treatments, icon
placement, and usage constraints: `TODO(kit)`.

## States

The supported state names are default, hover, pressed, and disabled. State
appearance, transitions, focus treatment, and any additional state rules:
`TODO(kit)`.

## Type scale

Sizes and line heights are in dp. On handheld/DOM surfaces, the mapping is
1 dp = 1 CSS px. Type sizes are not all body copy: choose a listed style for
each text role.

| Style | Size | Line height |
|---|---:|---:|
| Headline 1 | 32 dp | 36 dp |
| Headline 2 | 24 dp | 28 dp |
| Headline 3 | 20 dp | 24 dp |
| Body 1 | 14 dp | 20 dp |
| Body 2 | 11 dp | 16 dp |

Weights are Strong and Regular; exact numeric weight values are `TODO(kit)`.
Italics are not used. Never communicate meaning through color alone.
Typeface name and any additional typography rules: `TODO(kit)`. Our existing
local fonts remain in use; the kit typeface is not used (see
[assets/LICENSES.md](../assets/LICENSES.md)).

For world-anchored text viewed on a phone, retain a minimum of 16 CSS px for
body text: the larger floor helps keep text readable at a phone's viewing
distance. This is a handheld readability override, not a change to the kit's
Body 1/Body 2 scale.

## Icons, targets, and panels

- Standard icon size: 24 dp.
- Immersive UI uses filled icons; mobile/web uses outlined icons. Never mix
  filled and outlined icon styles in one interface. Icon inventory and exact
  glyph geometry: `TODO(kit)`.
- Minimum hit target: 48 x 48 dp.
- Primary controls with hand tracking: 60 x 60 dp minimum.
- Panel dimensions: default 1024 x 640 dp, minimum 384 x 500 dp, maximum
  1440 x 1000 dp.
- Dialog, window, and component-specific sizes, spacing, colors, and visual
  treatments: `TODO(kit)`.

The token mirror is [horizon-tokens.ts](../packages/engine-render/src/horizon-tokens.ts)
and [horizon-tokens.css](../modules/chem-atom-builder/src/horizon-tokens.css).
For handheld/DOM, 1 dp = 1 CSS px. For a spatial headset, size is converted
with configurable `metresPerDp`, default `0.000958 m/dp`; at 1 m, 48 dp is
approximately 4.6 cm. Tune this on a device. Device-verified conversion,
including whether it varies by display or viewing distance: `TODO(kit)`.

## Mapping current UI to kit components

| Current UI piece | Kit component |
|---|---|
| Check | Primary button |
| Hint, Free play, Reset atom | Secondary button |
| Exit AR | Destructive button |
| Selected dock tab | Primary button |
| Unselected dock tab | Secondary button |
| Dock detail | Card on a Panel surface |
| Atom-attached AR caption | Card |
| Particle +/- actions | Secondary button |
| Captions, Mute | Toggle selector |
| Speed | Discrete slider or dropdown |
| AR/camera confirmation | Dialog |
| Hint bubble | Tooltip |
| Tile/shelf patterns or windowed UI | `TODO(kit)`; select the exact component from the kit reference |
| Checkbox/radio setting | Checkbox/radio selector as appropriate; placement and selection rules: `TODO(kit)` |

Do not change existing UI behavior as part of adopting these tokens. The table
maps concepts only; exact visual replacement and interaction details require
the kit reference.

## Existing non-Android camera-view dock and immersive surfaces

The non-Android Camera-view dock has equal-width Mission, Particles, Element, and
Sound button tabs, all visible within 92% of the viewport. Settings is present
only when DOM overlay is unavailable. The selected tab uses the primary-button
role; unselected tabs use secondary. Each button provides default, hover,
pressed, and disabled state handling.

Mission is selected at startup. One Card on a Panel surface opens directly
above the tabs, at row width and at most 38% of visible height. Mission actions
retain their existing labels and action IDs in a 2x2 grid: Check is primary;
Hint, Free play, and Reset atom are secondary. Full lesson text wraps without
ellipsis and pages with up/down controls when needed. Particles and Element
remain available during free play. The one-source tooltip copy is
“Tap a tab to open it. Open Particles to build the atom.” and disappears on
the first tab tap.

Non-Android Camera-view dock placement is sampled from viewer heading and gaze at initial
placement/reset, about 0.7 m ahead in the lower viewport. It is independent of
the atom's surface placement. World-space/headset XR keeps the desktop/headset
reference layout. Handheld Android immersive AR/VR selects the measured
`reference-layout-android.ts`: top-row controls, Hints/model/Particles panels,
Mission beneath Hints and model, and one horizontal Scale/Position slider pair.
It uses the existing shell glass variant behind the item union plus the
24 px shell-padding token; the PNG shows no shell edge. Owner-added Hint,
Check, and Free play pills sit below the sliders and labels, use the desktop
action-button dimensions/style, and are explicitly marked as not present in
the PNG. The shell union extends below the source image to cover them. The
MMAXR/Atom Builder header remains omitted. The model stage, particles,
properties, mission, hints, and action buttons reuse the shared builders and
actions. At minimum scale, 16 dp body text is below a comfortable reading size
in both phone orientations; preserve that visible trade-off rather than hiding
content.

Android Camera view reuses the same Android `PanelGroup` and `ModelStage` over
the transparent local-video feed; the old DOM dock content is collapsed while
the group is active, with its existing expand/collapse header preserved as a
fallback. This path is selected by an Android User-Agent check and does
not affect desktop Camera or headset sessions. Camera look-around uses
DeviceOrientation relative to the initial pose, with one-finger empty-background
drag as a fallback. Device orientation permission is requested from the
existing Camera-start gesture; Reset View recenters both ModelStage and camera
look-around. The group stays fixed and upright while only the view rotates.
Immersive Android AR/VR continues to follow the XR viewer pose without a
separate look-around input. Both Camera and XR touch paths use the same
pointer-priority host: ModelStage, controls/panels, then background drag only
for Camera view.

## TODO(kit) register

- Component-specific usage, dimensions, spacing, colors, and appearance.
- State visuals, transitions, focus treatment, and extra state rules.
- Numeric Strong/Regular weights, typeface name, and other typography rules.
- Icon inventory and glyph geometry.
- Dialog, window, and component-specific sizing and treatment.
- Exact tile/shelf and checkbox/radio mapping rules.
- Device-verified `metresPerDp` calibration and any device/viewing-distance
  variation.
