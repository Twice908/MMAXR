# engine-input update

This package is a replacement for the supplied `engine-input` folder.

## Production changes

- Fixed adapter `on()` initialization order in `PointerAdapterBase`, `XrControllerInputAdapter`, and `XrHandInputAdapter`. The old class-field initializers accessed `this.events` before the constructor assigned it.
- Changed adapter event subscription to a normal method so it is available safely after construction.
- Fixed pointer-adapter disposal so an adapter does not clear a shared `InputEventBus`. `InputManager` remains the owner of its shared bus lifecycle.
- Removed the unused `camera` field from `RaycastPickerOptions`.

## Test changes

- Corrected the raycast parent-fallback fixture: an untagged child now verifies parent `inputId` fallback.
- Added coverage proving the nearest tagged object wins when both child and parent have `inputId` values.
- Added shared-event-bus disposal coverage.
- Added public `adapter.on()` initialization coverage.
- Made the test action helper package-local instead of relying on the package's own workspace alias.
- Added package-local `test` and `test:watch` scripts.

## Validation

All 26 TypeScript source/test files pass a TypeScript transpile/syntax check in this environment.

The full Vitest suite could not be executed in this environment because the uploaded archive contains broken workspace `node_modules` symlinks and the environment cannot fetch dependencies from the network. Run from the MMAXR repository root:

```bash
pnpm exec vitest run packages/engine-input/tests
pnpm exec tsc -p packages/engine-input/tsconfig.json --noEmit
```
