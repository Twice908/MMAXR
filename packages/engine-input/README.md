# @mma/engine-input

Device-independent input for MMAXR. It turns mouse, touch, and WebXR controllers and
hands into the engine's serializable action vocabulary: `hover`, `select`, `grab`,
`move`, `release`, `rotate`, `scale`, `confirm`, `back`. Modules never read raw device
events.

## What is in the package

| Part | Files | Role |
|---|---|---|
| Screen input | `mouse.ts`, `touch.ts`, `pointer-base.ts`, `input-manager.ts` | Mouse, pen and touch (including pinch) on a DOM element |
| Picking | `raycast-picker.ts` | Screen and world ray picking by `userData.inputId` |
| XR input | `xr-input-rig.ts` | **One** adapter for Meta Quest controllers, hands, and phone-AR taps |
| XR helpers (pure) | `xr-buttons.ts`, `xr-pinch.ts` | Gamepad mapping, deadzone, edge detection, joint pinch detection |

`engine-input` may import `engine-core` types and three.js. It must not import modules or
kits, and it does not own the XR session lifecycle: the renderer owns the session and
calls `XrInputRig.update(frame, time)` once per XR frame.

## XR input rig

```ts
const rig = new XrInputRig({
  dispatch: onInput,                          // engine action sink
  pick: (ray) => renderer.pickRay(ray.origin, ray.direction),
  handlePanelRay: (ray, phase, sourceId, kind, gestureMode, zoomDelta) =>
    spatialSession.handleRay(ray, phase, sourceId, kind, gestureMode, zoomDelta),
  getReferenceSpace: () => renderer.getXrReferenceSpace(),
  primaryCommand: "lesson/check",             // sent with `confirm` on A/X
});
rig.setSession(xrSession);                    // synchronous; pass null to detach
renderer.setXrFrameListener((frame, t) => rig.update(frame, t));
```

### Controls

| Input | Controller | Hand |
|---|---|---|
| Point | Target ray from `targetRaySpace` | Meta's emulated hand target ray |
| Click / drag | Trigger (button 0, or `select` events) | Pinch (hand gamepad button 0, `select` events, or fingertip distance) |
| Pan the model | Squeeze (button 1, or `squeeze` events) | not mapped |
| Zoom | Two controllers pressing together, change in separation | Two hands pinching together |
| Rotate / zoom model | Thumbstick (axes 2-3, radial deadzone) | not mapped |
| Confirm | A / X (button 4), or click the panel under the ray | not mapped |
| Back (reset view) | B / Y (button 5) | not mapped |

The thumbstick click is intentionally unmapped. A palm pinch is reserved by the Quest
system (left palm pinch exits the session) and is never used.

### How signals are merged

- Each source has one state machine and **one press at a time**: a squeeze while the
  trigger is held is ignored, so releasing one button cannot clear the other.
- Events and gamepad polling both report edges into the same state, so a press is never
  doubled, and a runtime that lacks one signal still works.
- Fingertip-distance pinch is only a fallback for a hand that has never reported a pinch
  through events or its gamepad. If the system pinch appears while a joint pinch is held,
  ownership is handed over without a second press.
- If a source loses its pose for 12 frames during a press, the press is cancelled.
- Rays are read in the renderer's reference space and are not smoothed.
- Controllers get short haptic ticks on panel hover, press and release when an actuator
  exists; failures are ignored.

### Diagnostics

`rig.getDiagnostics()` lists each source (kind, handedness, profiles, pressed buttons,
event counts, pinch gap, ray tracking). Open the app with `?xrdebug=1` to include these
lines in the XR report.

## Tests

```bash
pnpm exec vitest run packages/engine-input
pnpm exec tsc -p packages/engine-input/tsconfig.json --noEmit
```

Tests use mock `XRSession`, `XRInputSource` and `XRFrame` objects (`tests/helpers/fake-xr.ts`).
They do not prove behaviour on a headset; use `docs/xr-device-testing.md` for that.
