# @mma/engine-input test suite

This is the dedicated Vitest suite for `@mma/engine-input`.

The suite is intentionally divided by responsibility so regressions identify the affected subsystem:

```text
tests/
├── helpers/
│   ├── fake-dom.ts
│   ├── fake-xr.ts
│   └── test-actions.ts
├── action-dispatcher.test.ts
├── event-bus.test.ts
├── gestures.test.ts
├── input-manager.test.ts
├── mouse.test.ts
├── raycast-picker.test.ts
├── touch.test.ts
├── xr-controller.test.ts
├── xr-hand.test.ts
└── integration.test.ts
```

## Run

From the MMAXR repository root:

```bash
pnpm exec vitest run packages/engine-input/tests
```

Or from the package:

```bash
pnpm exec vitest run tests
```

Coverage:

```bash
pnpm exec vitest run packages/engine-input/tests --coverage
```

## What is covered

### Core infrastructure
- event subscription/unsubscription
- action dispatch
- action event emission
- disposal

### Mouse
- select
- hover
- drag/move
- release
- wheel scaling
- context menu suppression
- cancellation/leave

### Touch
- single-touch select
- drag
- release
- cancellation
- two-finger pinch scale
- pointer capture/release

### Gesture recognition
- pinch hysteresis
- pinch start/move/release
- grab start/move/release
- movement deadzone
- left/right hand isolation
- two-hand scaling
- two-hand rotation
- reset/remove hand

### XR controllers
- controller creation
- connected/disconnected
- handedness
- target picking
- select/grab/release
- squeeze/grab/release
- hover
- cleanup

### XR hands
- 25-joint reading
- missing-pose tolerance
- left/right detection
- pinch
- grab
- target picking
- debug-joint lifecycle
- disconnect cleanup

### Picking
- screen coordinate conversion
- nested `userData.inputId`
- nearest tagged object wins / parent fallback
- recursive/non-recursive behavior
- ray intersection
- stable target IDs

### Integration
- mouse/touch/XR sharing one action stream
- no duplicate action vocabulary
- InputManager lifecycle
- XR frame forwarding
