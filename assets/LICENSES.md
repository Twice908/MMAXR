# Asset and typeface notices

- Meta Horizon OS UI Set: its typeface (including Optimistic Display) is NOT
  used. The project keeps its existing local fonts and follows the kit's
  design language. No kit font asset is bundled.

- WebXR Input Profiles assets (`apps/web/public/xr-input-profiles/`): controller
  models `meta-quest-touch-plus`, `meta-quest-touch-pro`, `oculus-touch-v3` and the
  `generic-hand` mesh, copied unmodified from `@webxr-input-profiles/assets@1.0.20`
  (`dist/profiles`). MIT License, Copyright (c) 2019 Amazon; full text in
  `apps/web/public/xr-input-profiles/LICENSE.md`. The models depict Meta Quest
  controllers; the licence does not grant use of Meta's trademarks beyond depicting
  the device. `profilesList.json` is trimmed to the bundled profiles.
