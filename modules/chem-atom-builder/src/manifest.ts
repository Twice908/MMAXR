import { moduleManifestSchema } from "@mma/schema";
import rawManifest from "../module.json";

/**
 * Validated manifest for the Atom Builder module.
 *
 * Kept apart from `index.ts` so the dashboard can list the module without
 * loading the 3D renderer and the rest of the lesson code.
 */
export const manifest = moduleManifestSchema.parse(rawManifest);
