# @mma/engine-input

Device-independent screen input for MMAXR. It turns mouse, pen and touch into the
engine's serializable action vocabulary: `hover`, `select`, `grab`,
`move`, `release`, `rotate`, `scale`, `confirm`, `back`. Modules never read raw device
events.

## What is in the package

| Part | Files | Role |
|---|---|---|
| Screen input | `mouse.ts`, `touch.ts`, `pointer-base.ts`, `input-manager.ts` | Mouse, pen and touch (including pinch) on a DOM element |
| Picking | `raycast-picker.ts` | Screen and world ray picking by `userData.inputId` |

`engine-input` may import `engine-core` types and three.js. It must not import modules or
kits.

## XR input

XR controllers and hands are handled by IWSDK, not this package (see ADR 0005). This
package covers mouse, pen and touch input for screen mode and handheld AR overlays.

## Tests

```bash
pnpm exec vitest run packages/engine-input
pnpm exec tsc -p packages/engine-input/tsconfig.json --noEmit
```

Tests use mock `XRSession`, `XRInputSource` and `XRFrame` objects (`tests/helpers/fake-xr.ts`).
They do not prove behaviour on a headset; use `docs/xr-device-testing.md` for that.
