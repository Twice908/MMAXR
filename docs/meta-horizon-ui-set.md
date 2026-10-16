# Meta Horizon OS UI Set notes

Figma reference: [Meta Horizon OS UI Set (Community)](https://www.figma.com/design/83bL55eriEMAAG79ZMzIGu/Meta-Horizon-OS-UI-Set--Community-?node-id=2601-84513&p=f&t=IWp7DYH4vfhmX7uR-0).
The supplied canvas requires sign-in to inspect component frames and dimensions. Figma-only values below are recorded as **not specified in kit**; none are inferred. Keep MMAXR's existing local font; do not switch to Inter.

## Component references

| Component | Sizes | Radii | Padding | Hit target | States | Typography | Source |
|---|---|---|---|---|---|---|---|
| Buttons | Component-specific sizes: not specified in kit | not specified in kit | not specified in kit | 48 × 48 dp minimum for direct touch; 60 × 60 dp for primary controls per Android requirements | Default, hover, pressed, disabled; selected: not specified in kit. Specs describe hover as available/active, pressed as immediate feedback, disabled as less vibrant/non-interactive | Per-button typography: not specified in kit | [Buttons overview](https://developers.meta.com/horizon/design/buttons/); [Buttons specs](https://developers.meta.com/horizon/design/buttons_specs/); [Android design requirements](https://developers.meta.com/horizon/documentation/android-apps/design-requirements) |
| Cards | Component-specific sizes: not specified in kit | not specified in kit | not specified in kit | 48 × 48 dp minimum when interactive; card-specific target: not specified in kit | Default, hover, pressed, selected; disabled: not specified in kit | Per-card typography: not specified in kit | [Cards specs](https://developers.meta.com/horizon/design/cards_specs/) |
| Tooltips | Component-specific sizes: not specified in kit | not specified in kit | not specified in kit | not specified in kit | Hover-triggered; fades in/out; remains visible for 0.5 s after hover ends unless another action dismisses it. Other states: not specified in kit | not specified in kit | [Tooltips specs](https://developers.meta.com/horizon/design/tooltips_specs/) |
| Panels | Default 1024 × 640 dp; minimum 384 × 500 dp; maximum: not specified in kit | not specified in kit | not specified in kit | not applicable to the surface | Surface configurations are single, hinged, or theater; component interaction states: not specified in kit | Panel-specific typography: not specified in kit | [Panels](https://developers.meta.com/horizon/design/panels/); [Spatial SDK UI overview](https://developers.meta.com/horizon/documentation/spatial-sdk/spatial-sdk-ui-overview/) |
| Windows | Size/range: not specified in kit | not specified in kit | not specified in kit | not specified in kit | Manipulation affordances: display/control bars, edge handles, resize handles; visual states: not specified in kit | not specified in kit | [Windows](https://developers.meta.com/horizon/design/windows/) |
| Sliders | Small/large; default, text, and discrete types; numeric dimensions: not specified in kit. The documented track is horizontal | not specified in kit | not specified in kit | 48 × 48 dp minimum applies to interactive targets; slider-specific target: not specified in kit | not specified in kit | not specified in kit | [Sliders](https://developers.meta.com/horizon/design/sliders/) |

## Cross-component guidance

- The UI Set provides primary, secondary, borderless, destructive, tile, and shelf buttons; primary/secondary/outlined cards; and slider variants. The Spatial SDK overview describes the UI Set as reusable components for immersive apps; its use does not require adding the Spatial SDK to this project.
- Android requirements: add an in-app Back control when needed; use at least 48 × 48 dp targets and at least 60 × 60 dp for primary controls; add hover/focus feedback; avoid overlapping hit slop.
- Android text: 14 px minimum, 18 px or larger recommended. Contrast: 4.5:1 regular text and 3:1 headlines/non-text; avoid pure white and pure black. Test saturation and contrast on-device.
- The Android guide recommends Inter for legibility, but MMAXR retains its existing local font as requested.
- No component-specific typeface, weight, exact type sizes, radii, padding, or complete state visuals are available from the linked Figma canvas. Record those gaps as **not specified in kit** until an inspectable source is supplied.

## Source pages

- [Components index](https://developers.meta.com/horizon/design/components/)
- [Spatial SDK UI overview](https://developers.meta.com/horizon/documentation/spatial-sdk/spatial-sdk-ui-overview/)
- [Android design requirements](https://developers.meta.com/horizon/documentation/android-apps/design-requirements)
- Slider/control specs page: not found; the [Sliders overview](https://developers.meta.com/horizon/design/sliders/) is the available source.
- No separate Panels or Windows Specs pages were available; their overview pages are linked above.
