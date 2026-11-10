# Asset and typeface notices

- Meta Horizon OS UI Set: its typeface (including Optimistic Display) is NOT
  used. The project keeps its existing local fonts and follows the kit's
  design language. No kit font asset is bundled.

- Immersive shell (`@mma/engine-ambience`): all sound is synthesised live with Web Audio
  and all nebula, star and planet visuals are generated in shaders. No third-party audio,
  image or font assets are used. One GLSL hash follows Dave Hoskins' "Hash without Sine"
  (MIT), credited in `packages/engine-ambience/src/cosmos/glsl.ts`.
