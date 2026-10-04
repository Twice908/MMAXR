# ADR 0003: Screen-only camera view

Status: Accepted

## Decision

- Implement webcam camera view in `apps/web`, separate from WebXR session
  ownership and from module lesson state.
- Keep `engine-render` camera-API agnostic; the shell may request a transparent
  scene background while a local video element sits behind its canvas.
- Stop all media tracks and remove the video on exit, page hiding, device loss,
  permission failure, and other errors. The video is never captured, recorded,
  or uploaded.
- Use screen-mode input and local schema-validated lifecycle events. This
  view has no world tracking; the atom remains screen-centred.
- Offer screen camera view whenever the page is secure and `getUserMedia` is
  available, except when immersive AR is supported and there is no fine
  pointing device (`any-pointer: fine`). Fine-pointer desktop browsers retain
  both controls even when an XR emulator reports AR support.

## Consequences

- Desktop users without immersive AR can view the atom over a live local camera
  feed without changing the lesson or entering WebXR.
- Camera display and screen input remain separate from phone AR controls.
- Mac trackpad zoom depends on browser/OS gesture mapping and must be checked
  on physical hardware.
