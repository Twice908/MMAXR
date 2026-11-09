# ADR 0005: Run the 3D scene, XR sessions and XR input on IWSDK

Status: Accepted. Supersedes the XR input and visuals parts of ADR 0004.

## Context

The hand-built XR stack (custom input rig, ray and controller visuals, glass panels)
kept needing fixes, and Meta's Immersive Web SDK (IWSDK) ships the same features as
maintained defaults: controller and hand input, the official default rays and pointer
models, poke and ray interaction, and the Horizon UI kit. `docs/iwsdk-evaluation.md`
recorded the trade-offs; the owner chose a full port.

## Decision

- `@mma/engine-render` is rebuilt on IWSDK `@iwsdk/core` **1.0.1** (latest stable; no
  LTS line exists). `SceneRenderer` creates an IWSDK `World` and only places view-only
  content: the atom (`AtomView`, from the same `ScreenSceneFrame` layout) and, in XR, the
  lesson panels.
- The whole workspace uses one three.js runtime, Meta's `super-three@0.181.0`, through a
  pnpm override (IWSDK requires it). `@types/three` is pinned to 0.181.0.
- XR input is IWSDK's: rays, controller and hand models, pinch and poke. Our
  `XrInputRig`, ray/reticle visuals and vendored controller models are removed.
- The app's session flow (`engine-xr` consent dialog, comfort reminder, telemetry,
  Android AR, DOM overlay) still requests the session; `SceneRenderer.enterARSession`
  adopts it into IWSDK with the same steps IWSDK's `launchXR` uses (reference space,
  `renderer.xr.setSession`, `world.session`).
- XR lesson UI uses the Horizon UI kit (`@pmndrs/uikit-horizon` 1.0.78): a lesson panel
  (left), a build panel (right) and a dock under the atom, world-locked about 1 m away,
  slightly below eye level and angled toward the user, with 56 mm targets and 18 mm+ text.
  They exist only during AR/VR sessions (in phone AR only when the DOM overlay is not
  granted).
  Panels are tagged `RayInteractable` and `PokeInteractable`. Content comes from
  `buildXrLessonContent` (pure, tested) and uses the same commands as the screen UI.
- The glass panels, model stage, Position and Scale sliders, spatial hints and
  spatial particle drag are removed. VR has a dark background and a floor disc for a
  stable horizon; AR keeps passthrough.
- Desktop and phones open as the normal website: the DOM lesson UI stays, IWSDK renders
  the atom inside the scene viewport, and the page's own mouse/touch adapters handle input
  (`canvasPointerEvents: false`). Only after Enter AR / Enter VR does IWSDK take over with
  the immersive scene, controllers, hands and the Horizon UI panels; Exit returns to the
  website.
- Dev tooling follows the IWSDK starter: `apps/web` uses `@iwsdk/vite-plugin-dev` and
  `@iwsdk/cli` 1.0.1 with Vite 7.3.7 and `iwsdk.config.json`, so `pnpm --filter @mma/web
  dev` opens the managed Runtime/Editor browser with the Quest emulator. Under pnpm the
  plugin's helper packages are not hoisted, so `apps/web` pins `three-viewport-gizmo`,
  `@iwsdk/scene-composition`, `@zappar/msdf-generator`, `three` and the UIKit packages
  directly.

## Consequences

- One maintained input stack for Quest controllers and hands, with Meta's default rays.
- The IWSDK runtime is large (the world chunk is about 6.2 MB, 1.6 MB gzipped), above the
  3 MB initial-load budget in README section 10. It loads with the module; lazy-loading
  it only for XR, or trimming unused IWSDK features, is follow-up work.
- Android handheld AR now runs through IWSDK-adopted sessions; it needs a device check.
- Horizon UI panel layout and the atom placement need a headset check.
