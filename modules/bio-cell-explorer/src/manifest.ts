import { moduleManifestSchema } from "@mma/schema";
import rawManifest from "../module.json";

/**
 * Validated manifest for the Plant vs Animal Cell explorer. Kept apart from `index.ts` so
 * the dashboard can list the module without loading the 3D renderer.
 */
export const manifest = moduleManifestSchema.parse(rawManifest);
