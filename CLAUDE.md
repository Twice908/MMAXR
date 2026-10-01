# MMA-XR Agent Notes

- Follow the dependency direction in README section 6.1. `engine-core` must not import apps, kits, or modules; kits must not import modules.
- State is plain serializable data changed only through `dispatch(action)`. Reducers are deterministic and do not read time, generate IDs, or perform I/O; inject clocks and ID generators.
- P0 and P1 must not implement audio, voice, XR, or 3D rendering.

## Commands

- Install: `pnpm install`
- Typecheck: `pnpm typecheck`
- Lint: `pnpm lint`
- Test: `pnpm test`