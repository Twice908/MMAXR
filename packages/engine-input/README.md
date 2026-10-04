# @mma/engine-input

Device-independent input for MMAXR.

This package is designed to sit between browser/XR input devices and `@mma/engine-core`. It emits the same serializable action vocabulary already used by MMAXR:

- `hover`
- `select`
- `grab`
- `move`
- `release`
- `rotate`
- `scale`
- `confirm`
- `back`

It contains working adapters for:

- mouse
- touch / multitouch
- WebXR controllers
- WebXR articulated hands
- pinch
- grab
- two-hand scale
- two-hand rotate

It does not depend on React, React Three Fiber, Babylon, or any UI framework.

## Installation

From the MMAXR repository root:

```bash
pnpm --filter @mma/engine-input add three@0.186.1
```

Because this is a workspace package, the preferred package manifest is already included. No runtime dependency other than the existing MMAXR `three` and `@mma/engine-core` packages is required.

If adding the package manually to the monorepo, add:

```json
{
  "name": "@mma/engine-input",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@mma/engine-core": "workspace:*",
    "three": "0.186.1"
  },
  "devDependencies": {
    "@types/three": "0.186.0"
  }
}
```

## Architecture

```text
Browser / XR device
       |
       +-- Mouse
       +-- Touch
       +-- XR Controller
       +-- XR Hand
       |
       v
@mma/engine-input
       |
       +-- Gesture recognition
       +-- Picking
       +-- Manipulation actions
       +-- Two-hand scale / rotate
       |
       v
EngineAction
       |
       v
@mma/engine-core dispatch()
       |
       v
Modules / rules / state
```

Modules should not listen to browser events or WebXR events directly.

## Basic integration

```ts
import * as THREE from "three";
import {
  InputManager,
  createRaycastPicker,
  createScreenRayPicker,
} from "@mma/engine-input";

const scene = new THREE.Scene();

const input = new InputManager({
  renderer,
  root: renderer.domElement,

  dispatch: (action) => {
    engineStore.dispatch(action);
  },

  pickScreenTarget: createScreenRayPicker(
    camera,
    scene,
    renderer.domElement,
  ),

  pickWorldRay: createRaycastPicker(scene),
});
```

Make interactive objects identifiable:

```ts
mesh.userData.inputId = "proton:1";
```

Then the module receives:

```ts
{
  type: "select",
  payload: {
    source: "mouse",
    target: "proton:1"
  }
}
```

## WebXR animation loop

Three.js exposes the active XR session through `renderer.xr`, and the XR frame is available in the renderer animation loop. The hand adapter expects that frame so it can call `XRFrame.getJointPose()` for each tracked joint.

```ts
renderer.xr.enabled = true;

renderer.setAnimationLoop((_time, frame) => {
  if (frame) {
    input.updateXrFrame(frame);
  }

  input.update();
  renderer.render(scene, camera);
});
```

When the XR session has hand tracking enabled, WebXR exposes `XRInputSource.hand`; an articulated hand contains 25 joint spaces. The adapter reads those joints and derives pinch/grab gestures from their positions.

## Starting an XR session

The application/session layer should request hand tracking:

```ts
const session = await navigator.xr.requestSession("immersive-vr", {
  requiredFeatures: ["local-floor"],
  optionalFeatures: ["hand-tracking"],
});

renderer.xr.setSession(session);
```

The input package intentionally does not own session creation. `engine-xr` should continue to own XR session lifecycle.

## Hand gestures

### Pinch

Thumb-tip to index-tip distance:

```text
distance <= 2.8 cm -> pinch starts
distance >= 4.5 cm -> pinch ends
```

The hysteresis prevents rapid start/end oscillation.

Pinching a target emits:

```text
select
grab
move
release
```

### Grab

The package estimates finger curl from the four fingertips relative to the wrist.

A grab emits:

```text
grab
move
release
```

### Two-hand scale

With both hands active:

```text
newDistance / previousDistance = scale
```

A `scale` action is emitted with the scale factor and midpoint.

### Two-hand rotate

The angle between the two hands is compared with the previous frame. A quaternion around the local Z axis is emitted as a `rotate` action.

## Important integration rule

Do not make modules depend on `XRHand`, `XRInputSource`, `PointerEvent`, or `MouseEvent`.

Only the input package should know those APIs.

A module should consume:

```ts
EngineAction
```

For example:

```ts
function reduceAtom(state, action) {
  if (action.type === "grab") {
    // module-specific state transition
  }

  if (action.type === "move") {
    // module-specific state transition
  }

  return state;
}
```

## Picking

The package provides a ready-to-use Three.js raycaster:

```ts
const pickWorldRay = createRaycastPicker(scene);
```

Objects can define stable IDs:

```ts
proton.userData.inputId = "proton:1";
electron.userData.inputId = "electron:3";
```

The picker starts at the hit object and walks up the object hierarchy until it finds `userData.inputId`. The nearest tagged object wins; if the hit child is untagged, a tagged parent can provide the stable entity ID. This means a GLTF child mesh can be hit while the module still receives the parent entity ID.

For screen input:

```ts
const pickScreenTarget = createScreenRayPicker(
  camera,
  scene,
  renderer.domElement,
);
```

## Controller models

The input package intentionally does not create controller or hand meshes. Keep visual models in `engine-render` / `engine-xr`.

Three.js provides `renderer.xr.getController(index)` for target-ray space and `getControllerGrip(index)` for grip space. Controller model factories belong in the rendering layer.

## Recommended MMAXR dependency direction

```text
engine-core
    ^
    |
engine-input
    ^
    |
engine-render / engine-xr
    ^
    |
modules
```

`engine-input` may import `engine-core` types and Three.js.

`engine-input` must not import modules or subject kits.

`engine-input` should not own XR session lifecycle.

`engine-input` should not contain chemistry/physics/biology rules.

## Wiring the current MMAXR repository

The current repository already has input mapping in `engine-render` and `engine-xr`. Those mappings use the same action vocabulary as this package.

Recommended migration:

1. Add `packages/engine-input`.
2. Add it to the root typecheck command.
3. Move raw mouse/touch handling from `engine-render` into `engine-input`.
4. Move controller/hand input handling into `engine-input`.
5. Keep `engine-xr` responsible for session capability detection and session lifecycle.
6. Keep `engine-render` responsible for Three.js rendering and visual XR models.
7. Make both call the single `dispatch(action)` path.
8. Remove duplicate raw-input listeners after the migration.
9. Keep module code unaware of the physical input device.

## Current package integration example

The current MMAXR core defines:

```ts
type EngineAction = Readonly<{
  type: string;
  payload: JsonValue;
}>;
```

This package deliberately emits that same shape, so it can be connected directly to the existing store:

```ts
const input = new InputManager({
  renderer,
  root: renderer.domElement,
  dispatch: (action) => store.dispatch(action),
  pickScreenTarget,
  pickWorldRay,
});
```

## Testing strategy

Screen input can be tested on desktop Chrome using mouse/touch emulation.

XR controller behavior can be exercised using the repository's existing WebXR emulator workflow.

Hand tracking must ultimately be tested on real hardware because browser support for WebXR hand input is not universal.

The package contains no native-app dependency and does not require React.

## Notes

`XRHand` is a WebXR API with limited browser availability. The adapter therefore treats hand tracking as an optional capability rather than a required input path.

For unsupported devices, mouse/touch input continues to work.

The package does not attempt to emulate actual hand tracking in an emulator; use the XR emulator for controller/session paths and real hardware for optical hand tracking validation.
