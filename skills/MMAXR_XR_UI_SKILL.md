---
name: mmaxr-xr-ui
description: Build interactive spatial UI (panels, controls, model stages) for MMAXR modules in AR, VR and Camera views using Three.js, the Meta Horizon OS UI Set, shared design tokens and the project's glass style. Use for any XR panel, kit or module UI work.
version: 1.0.0
---

# MMAXR XR UI Skill

Applies to every AR / VR / Camera / MR / XR UI task in the MMAXR monorepo (pnpm, TypeScript, Vite, Three.js, GitHub Pages). Read fully before writing code. If a rule here conflicts with a task prompt, stop and ask; do not pick silently.

---

## 0. Non-negotiables

1. No guessing sizes, layouts, spacing or components. Every value comes from the Meta Horizon OS UI Set, the Figma reference frames, or `xr-tokens.ts`.
2. Interaction is built together with the component. A button that renders but does not click is not done.
3. No new dependencies without explicit approval. Propose first, with reason and size impact.
4. Do not commit unless told to.
5. Keep local fonts. Do not add CDN fonts.
6. Module names, content, captions and narration must not contain standard-specific or exam-specific words.
7. Every step must serve the end goal. No throwaway features, demo objects or tests that will not ship. Flag drift.
8. Work in small chunks (one panel, one component family or one behavior per task). If a task touches more than ~3 files or more than one concern, split it and say so.
9. Reports are short: what changed (file:line), what was verified, what is unexplained. Maximum ~10 lines unless asked.
10. If the reference for a panel, kit or module is missing, stop and ask for it. Do not invent a layout.
11. All UI uses the liquid glass theme (section 9). No element or component other than text may use a flat, solid colour fill.

## 1. Source of truth (priority order)

1. Meta Horizon OS UI Set (components, sizes, spacing, states, motion, input guidance). Every agent prompt and every report references the specific kit component used.
2. MMAXR Figma reference frames for the specific panel/module (layout, grouping, hierarchy).
3. `xr-tokens.ts` (this skill, section 8). Tokens marked `TBD` are not to be invented; ask.
4. This document's defaults.

When the kit and the Figma frame disagree, report the disagreement; do not choose.

## 2. Stack rules

- Core: raw Three.js with the existing renderer, one WebXR session, one render loop (`renderer.setAnimationLoop`).
- React Three Fiber (R3F) and Drei are approved for XR panel UI only, subject to the gate below. Do not use R3F for the atom/model core, session lifecycle or input plumbing unless approved.
- Single Three.js instance. Before adding or touching anything that imports `three`, confirm every workspace package resolves the same version and Vite dedupes it (`resolve.dedupe: ['three']`). Known issue: console warning "Multiple instances of Three.js being imported"; its second importer is still unproven. Never add code that makes this worse; report its source if found.
- R3F integration gate (needs written approval before implementation): agent first proposes, in 10 lines, how R3F mounts into the shared scene without creating a second `WebGLRenderer`, canvas, XR session or render loop (for example a root with a manually advanced frameloop driven by the shared loop, rendering into a group that is added to the shared scene). No implementation until approved.
- Use Drei helpers only where they replace custom code with equivalent behavior (text, bounds, controls math). Prefer a small utility over a heavy helper.
- TypeScript strict. No `any` in UI code. Shared types live in the UI package, not in components.

## 3. 3D workflow knowledge (apply by default)

Units and space
- 1 unit = 1 metre. Y up. `local-floor` reference space. The viewer pose is read from the XR frame; never assume the head is at the origin.
- Never move the XR camera directly. Move a rig/group the camera lives under, or move content.
- Build the scene graph with named, purposeful groups: `Rig` > `World` (model stage, lighting) and `Rig` > `UI` (panel groups). Names appear in debug reports.

Performance (headset first)
- Target the device refresh rate (72/90/120 Hz). Frame budget at 90 Hz is ~11 ms CPU+GPU combined. Report cost of any new feature in draw calls and triangles.
- Prefer instancing/merged geometry, shared materials/geometries, texture atlases, KTX2 textures, Meshopt/Draco-compressed glTF/GLB. Dispose geometry, materials and textures on removal.
- Avoid per-frame allocations (no `new Vector3` in loops; reuse temporaries).
- Avoid heavy post-processing and `MeshPhysicalMaterial` transmission in XR. They are costly on mobile-class GPUs.
- Set framebuffer scale and foveation deliberately; do not leave them implicit.
- Pixel ratio/XR framebuffer settings must be set through the renderer's XR manager, not the 2D canvas path.

Session lifecycle
- Order: request session > set session on renderer > register animation loop > optional features (hit-test, hand tracking) run in the background with a timeout and never block the first frame.
- 2D DOM UI does not render inside immersive sessions. All immersive UI is in-scene.
- Handle session end: restore 2D layout, dispose XR-only resources, remove listeners.
- Support the Immersive Web Emulator (desktop), real headsets, and the Android AR path. Never gate desktop behavior behind mobile-only checks.

Debuggability
- Keep `?xrdebug=1` report working. New components must be inspectable through it (name, visibility, world position, scale).

## 4. Lighting, camera and shaders

Lighting modes (explicit per view)
- Virtual scene (VR): hemisphere/ambient + one key directional light, soft environment map, no shadows unless justified. Model lit independently from UI.
- Camera / AR scene: no fake sky. Light estimation if available; otherwise neutral ambient + key. Match brightness to the camera feed; do not blow out.
- UI is unlit or lit by a dedicated minimal setup so panels look identical in every view. Use layers to separate UI and world lighting where needed.

Camera
- One XR camera. Near/far set deliberately (e.g. near 0.05 to 0.1 m) to avoid clipping of close panels. Verify panels at minimum distance are not clipped.
- Desktop/non-XR preview camera must not leak into the XR path.

Shaders and materials
- Colour space: sRGB output, linear working space. Tone mapping explicit per view and consistent between UI and model.
- Custom shaders (glass, glow, rim) are small, commented, uniform-driven and token-driven. One shared glass material per variant, instanced across panels.
- Text uses SDF/MSDF text rendering (not blurry canvas textures). Verify crispness at the minimum text size, at minimum and maximum panel distance.
- Provide a reduced-effects fallback for every shader effect for low-end devices. Glass degrades to simple translucent tint plus rim; it never becomes a solid opaque fill.

## 5. Panel system

### 5.1 Anatomy (build once, reuse everywhere)
- `Panel`: rounded glass surface + content slot. Fixed size in metres (from layout/token), never resized by content.
- `PanelGroup`: a set of panels arranged as in the reference (bento/grid) under one parent transform.
- `PanelControls`: the scale slider and the distance slider, attached to a `PanelGroup` (not to a single panel when the group has several).

### 5.2 Placement and behavior
- Panels are placed once at session start in front of the viewer's first valid pose, upright, facing the viewer on the yaw axis only. After that they are anchored and do not move, follow, sway or tilt. (Anchoring mode: world-anchored after initial placement; confirm with owner if head-locked is wanted.)
- Panel size is fixed. Only the two sliders change panel scale or distance.
- No rotation, ever, from sliders or any other input. Panels never tilt on any axis.

### 5.3 Sliders (exactly two per group)
- Scale slider: vertical, on the right edge of the right-most panel of the group. Uniform scale about the group's centre. Does not change distance.
- Distance slider: horizontal, below the bottom-most panel of the group. Moves the group along the viewer-to-group line. Does not change scale.
- One pair of sliders per `PanelGroup`, regardless of panel count. A 4-panel bento has one scale slider and one distance slider, not eight.
- Range limits and defaults come from `xr-tokens.ts` (`PANEL_LIMITS`). Values are clamped; show the limits visually (track ends); thumbs have clear hover/pressed/dragging states.
- Slider hit areas follow the kit's minimum target size. Controls stay readable and reachable at both extremes of the range.
- Sliders live outside the content area, aligned to the group bounds, using kit slider component styling.

### 5.4 Layout
- Layout comes from the Figma reference for that specific panel/kit/module. Express each layout as data (grid rows/columns, spans, gaps in token units), not hard-coded positions.
- Desktop/headset layout and Android AR simulated-screen layout share styling and theme but may differ in arrangement. Each has its own layout definition; components are shared.
- Spatial views (AR, VR, Camera) swap only the background/world. Panel layout stays the same.
- Fixed order of regions per layout is documented in the layout file header.

## 6. Interaction (built in, not added later)

Every interactive component ships with all of the following in the same change:
- Input: controller ray + trigger, hand pinch/poke, mouse (desktop/emulator), touch (Android). One shared interaction manager (single raycaster pipeline, pointer-event style API: enter, leave, down, up, click, drag, wheel). No per-component ad hoc raycasting.
- States: default, hover, pressed, focused, disabled, and where relevant selected/checked/dragging. Visual change for each, from tokens.
- Feedback: visual change within one frame; haptics on controllers when available; subtle audio click (muted by the app's Mute control).
- Hit targets: not smaller than the kit's minimum; padding enlarges the hit area, not only the visuals.
- Semantics: label text, value, min/max/step where applicable. Components expose a typed `onChange`/`onPress` API.
- Components required in the shared library: Button, IconButton, Toggle, Checkbox, RadioGroup, Slider, Stepper (+/-), Dropdown/Select, Tabs, ProgressBar, Chip/Tag, Tooltip, Card, ScrollView, Caption block, Divider.
- Tests: unit tests for state logic and transform maths; an interaction test for each component (click, drag, toggle).

Definition of done for any component: renders, responds to controller/hand/mouse/touch, shows all states, uses tokens only, reuses library parts, has tests, appears in the debug report.

## 7. Model stage (every kit/module has one)

- The model lives in a `ModelStage` that can show inside a panel region but is not clipped by it. The model may be moved outside the panel bounds.
- Free manipulation: rotate on all axes, pan up/down/left/right/forward/back, zoom in and out, with controller, hand, mouse wheel/drag and touch gestures. Input mapping is defined once in the shared manipulator.
- Limits are set in `MODEL_LIMITS` tokens: zoom min/max, pan bounds (box or sphere around the stage), minimum distance from the viewer (never inside the head or the panel face), maximum distance. Clamp softly (ease at the edge), never snap abruptly.
- A "Reset view" action returns position, rotation and zoom to defaults.
- Model interaction must not trigger panel controls and vice versa. Pointer capture on drag; release on end/cancel.
- Selection/hover highlight for sub-parts of the model uses shared highlight material, not per-model custom code.
- Lighting for the model is independent from panel lighting (section 4).

## 8. Design tokens (single source: `xr-tokens.ts`)

No raw numbers or colours for typography, spacing, radii, borders, gaps, sizes, colours or timings in components. Everything is imported from tokens. Add lint rules to block magic values in UI code where practical.

Units
- Physical sizes in metres. Text sized in dmm (distance-independent millimetres: 1 dmm = 1 mm tall at 1 m distance) so legibility is consistent. Convert in one helper.
- Spacing scale in metres derived from a base unit; names, not numbers, in components.

Token groups to define (values come from the kit; `TBD` = ask, do not invent)

| Group | Names (examples) | Value source |
|---|---|---|
| Typography | `display`, `title`, `heading`, `body`, `label`, `caption` | Kit; weight, size (dmm), line-height, tracking. Local fonts only. |
| Colour roles | `surface`, `surface-raised`, `text-primary`, `text-secondary`, `text-disabled`, `accent`, `success`, `warning`, `danger`, `focus` | Kit + Figma; TBD where missing |
| Spacing | `space-0 ... space-8` | Kit grid |
| Padding | `pad-panel`, `pad-card`, `pad-control` | Kit |
| Gaps | `gap-panel`, `gap-stack`, `gap-inline` | Kit/Figma |
| Radii | `radius-panel`, `radius-card`, `radius-control`, `radius-pill` | Kit/Figma |
| Borders | `border-hairline`, `border-default`, `border-focus` | Kit |
| Sizes | `target-min`, `slider-track`, `slider-thumb`, `icon-sm/md/lg` | Kit |
| Panel limits | `PANEL_LIMITS` = scale min/default/max; distance min/default/max (m) | Owner-set; TBD |
| Model limits | `MODEL_LIMITS` = zoom min/max; pan bounds; min/max viewer distance | Owner-set; TBD |
| Motion | `duration-fast/base/slow`, easing names | Kit |
| Glass | `GLASS.*` (see section 9) | TBD (owner to add) |

Text rules
- Only the predefined text styles are allowed. No ad hoc sizes, weights, colours or letter-spacing.
- Contrast: body text at least 4.5:1 against its surface, large/heading text at least 3:1, measured against the actual glass surface over the brightest and darkest expected backgrounds. Avoid pure white and pure black text and pure black surfaces; use the tokenised off-white/near-dark roles so text is neither washed out nor harsh in HDR/OLED headsets.
- Minimum text size is a token (`target`-style minimum from the kit, in dmm). Nothing smaller ships.
- Captions have a guaranteed backing surface so they stay legible over camera/VR backgrounds.
- Text content is not hard-coded in components; it comes from content files.

## 9. Liquid glass style

- Every component and element uses the liquid glass theme: panels, cards, buttons, icon buttons, sliders (track and thumb), toggles, checkboxes, tabs, chips, progress bars, tooltips, dropdowns, dividers and badges. No element except text may use a flat, solid, opaque colour fill. Surfaces are always translucent glass (tint with alpha, edge highlight, depth cues); state changes (hover, pressed, selected, disabled) are expressed as glass variations (tint, brightness, rim intensity), not as swaps to solid colours.
- Text is the only exception: text colour is a solid token colour. Text sits on glass and must meet the contrast limits in section 8.
- Model content (the 3D atom/model itself) is not UI and follows its own material rules; any UI drawn over or around it is glass.
- Glass is a shared material variant set (panel, card, control, pill) driven by `GLASS.*` tokens, not copied shader code. Layers: translucent tint, soft edge highlight/specular rim, subtle inner shadow, optional fine noise, optional soft backdrop gradient.
- Real-time backdrop blur is expensive in XR. Default to a cheap approximation (pre-blurred/gradient backdrop, layered translucency). Use real blur only on approval and only when the backdrop is static.
- `GLASS.*` values are `TBD` until the owner supplies them. Do not invent values; build the structure and ask. Provide a reduced-glass fallback for low-end devices (translucent tint plus rim, no blur or heavy shader work). The fallback is still translucent; never fall back to a solid opaque fill.
- Glass must never reduce text contrast below section 8 limits.

## 10. Component reuse

- One implementation per purpose. Before creating a component, search the library; configure through props/variants first. New component only if no existing one can be extended without breaking its contract; justify in the report.
- Library structure: `tokens` > `primitives` (glass surface, text, icon, hit area) > `controls` (button, slider, toggle, ...) > `compositions` (panel, bento group, particle list, mission card, hint card, action bar) > module screens.
- Module screens contain layout data and content only, not styling code.
- Keep a registry file listing every component, props and the kit component it maps to.
- Shared behaviors (hover/press, drag, focus, pointer capture) live in hooks/utilities, not copied.

## 11. Reference layout (desktop/headset Atom Builder, for orientation)

Bento on one fixed group: large model panel (top left, with caption area and display controls such as caption toggle, speed, play sound, replay), right-hand particle/element info column (drag-and-drop particles with counters, element summary, property rows), bottom-left mission card with progress, bottom-centre hints card, bottom-right action buttons (hint, check, free play). The Android AR variant keeps the style and theme with a different arrangement. The Figma frames, not this paragraph, define exact layout.

## 12. Comfort and accessibility

- Default panel distance, size and height are tokenised and chosen for comfortable viewing; do not place content where it forces neck strain or clips with controllers.
- Minimise parallax-heavy motion and flashing. Respect reduced-motion tokens.
- Keep existing learning aids working in every view: captions on/off, speed, replay, sound on/mute.
- Never rely on colour alone to convey state.

## 13. Verification (every chunk)

- Typecheck, lint, unit tests pass. Report counts.
- Run in the Immersive Web Emulator for VR and AR; confirm panels and model visible, controls respond, sliders clamp and never tilt.
- Check `?xrdebug=1` report: presenting yes, frame count increasing, panel group world position near the viewer, scale > 0, visibility chain visible, no XR error.
- Manual checklist produced by the agent for the owner: steps, expected result, what to screenshot.
- Visual check against the Figma frame for that panel: spacing, radii, type and colours come from tokens and match.

## 14. Task template for agent prompts

```
Task: <one panel/component/behavior>
Reference: <kit component(s)> + <Figma frame link/name>
Tokens used: <list> | New tokens needed: <list or none>
Reuse: <existing components to reuse>
Interaction included: <states + input paths>
Do not commit. No new dependencies.
Report in 10 lines max: changes (file:line), verification, unexplained.
```

## 15. Definition of done (checklist)

- [ ] Uses kit components/sizes; no guessed values
- [ ] Layout matches the reference for this panel/module
- [ ] Only tokens used (type, colour, spacing, padding, radii, borders, gaps)
- [ ] Reuses library components; no duplicates
- [ ] Fully interactive on controller, hand, mouse and touch; all states present
- [ ] Panel fixed distance/size; two sliders only; no tilt; one slider pair per group
- [ ] Model freely manipulable within limits, not clipped by the panel
- [ ] Every component and element is liquid glass; no solid flat fills except text; reduced-glass fallback is still translucent
- [ ] Text contrast and minimum size verified at both distance extremes
- [ ] Lighting/camera set per view; no per-frame allocations; frame budget respected
- [ ] Single Three.js instance; no second renderer or loop
- [ ] Tests added; emulator check done; `xrdebug` fields sane
- [ ] Short report; nothing committed; no new dependencies

## 16. Open values (owner to supply; agent must ask, not invent)

- `GLASS.*` tokens
- `PANEL_LIMITS` and `MODEL_LIMITS` final numbers
- Panel anchoring mode confirmation (world-anchored vs head-locked)
- Final typography and colour tokens where the kit and Figma are silent
- Approval of the R3F integration approach (section 2 gate)