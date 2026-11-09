# ADR 0004: One XR input rig for controllers and hands

Status: Superseded by ADR 0005 (IWSDK runtime)

## Context

Controller and hand input in immersive sessions did not work reliably on Meta Quest.
Three adapters existed: `XrControllerInputAdapter` and `XrHandInputAdapter` were never
used by the app (screen input disabled them with a placeholder renderer), and the live
`XrSessionInputAdapter` had these defects:

- Hands were driven only by thumb-to-index joint distance. Meta documents that a regular
  pinch is also exposed as a button on the hand's emulated gamepad, and `select` events
  were ignored for hands, so a runtime without joint poses had no pinch at all.
- It requested its own reference space, which could differ from the one the scene is
  rendered in, and ran a second `requestAnimationFrame` loop beside the renderer's.
- Trigger, squeeze and pinch shared one pressed set, so releasing one cleared another.
  Thumbstick click and B/Y both reset the view. Rays were smoothed, which lagged clicks.
- Nothing drew hands, and the controller visuals lived in `screen-renderer.ts`.

## Decision

- Delete the three adapters, `GestureRecognizer`, and the XR options of `InputManager`.
- Add `XrInputRig` in `engine-input`, plus pure helpers (`xr-buttons.ts`, `xr-pinch.ts`).
  One state machine per source merges `select`/`squeeze` events and gamepad polling;
  joint-distance pinch is only a fallback. One press at a time per source.
- The renderer owns the loop and calls the rig once per XR frame, in the renderer's
  reference space. The rig keeps the existing `handlePanelRay` / `handleThumbstick`
  contract, so panels and the module barely change.
- Thumbstick click is unmapped. A palm pinch is never used (reserved by the system).
  `confirm` carries a command supplied by the module instead of a hard-coded string.
- Draw pointer rays and reticles in `engine-render/src/visuals/xr-input-visuals.ts`, and
  show the official WebXR Input Profiles models (Meta Quest Touch Plus, Touch Pro, Touch v3
  controllers and the generic hand mesh) through three.js's `XRControllerModelFactory` and
  `XRHandModelFactory`. The models are vendored under `apps/web/public/xr-input-profiles`
  (MIT, recorded in `assets/LICENSES.md`), so nothing is fetched from a CDN and the app
  works offline. They load only when a source connects in an XR session. Until a model
  loads, or if its profile is not bundled, a procedural stand-in is shown (a controller
  body with a nose cone along the ray, or a hand joint skeleton). Hand models are shown in
  VR only, because passthrough AR already shows the real hands.
- Add per-source lines to the existing `?xrdebug=1` report.
- Stay on raw three.js and WebXR, as recommended in `docs/iwsdk-evaluation.md`.

## Consequences

- Hands work from whichever pinch signal the browser provides.
- Button indices follow the W3C `xr-standard` mapping. Meta's Touch Pro page confirms
  buttons 0-5 use it but does not list them, so the indices, the hand gamepad pinch
  button, and pinch thresholds need confirming on a real Quest (see
  `docs/xr-device-testing.md`). Mock tests cannot establish them.
- The repository carries about 2.5 MB of model files; adding a device means copying its
  profile folder and adding it to `profilesList.json`.
- A pinch can nudge the ray at the moment of pinching; a short pose history may be needed
  if device testing shows drift.
