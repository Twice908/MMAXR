import { moduleManifestSchema } from "@mma/schema";
import rawManifest from "../module.json";

/**
 * Validated manifest for the Ohm's Law module. Kept apart from `index.ts` so the
 * dashboard can list the module without loading the 3D renderer.
 */
export const manifest = moduleManifestSchema.parse(rawManifest);
