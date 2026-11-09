# XR input models

Official WebXR Input Profiles models used to draw controllers and hands in XR sessions
(see ADR 0004 and `packages/engine-render/src/visuals/xr-input-models.ts`).

- Source: `@webxr-input-profiles/assets@1.0.20`, `dist/profiles/`, files unmodified.
- Licence: MIT (`LICENSE.md` here); recorded in `assets/LICENSES.md`.
- Profiles: `meta-quest-touch-plus` (Quest 3/3S), `meta-quest-touch-pro` (Quest Pro),
  `oculus-touch-v3` (Quest 2), `generic-hand` (hand tracking).
- `profilesList.json` lists only these profiles. A device whose profiles are not listed
  gets the procedural stand-in instead of a model.

To add a profile, copy its folder (`profile.json`, `left.glb`, `right.glb`) from the same
package version and add its entry to `profilesList.json`. Files load only during an XR
session, so they do not count toward the initial page load.
