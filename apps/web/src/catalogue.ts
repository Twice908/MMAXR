import type { SubjectId } from "./routes.js";

/** The manifest fields needed by the web catalogue and module host. */
export interface CatalogueManifest {
  readonly id: string;
  readonly subject: string;
  readonly title: { readonly en: string };
  readonly concepts: readonly string[];
  readonly estimatedMinutes: number;
  readonly releaseStatus: string;
  readonly description?: { readonly en?: string };
  readonly missions?: readonly { readonly goalText: string }[];
}

/** A localized manifest projected into the subject listing. */
export interface CatalogueEntry {
  readonly id: string;
  readonly subject: SubjectId;
  readonly title: string;
  readonly description: string;
  readonly estimatedMinutes: number;
  readonly isDraft: boolean;
}

/** A lazily loaded module mount surface. */
export interface ModuleRuntime {
  readonly manifest: {
    readonly id: string;
    readonly modes: readonly string[];
  };
  readonly mount: (root: HTMLElement, options: { readonly diagnostics?: boolean }) => () => void;
  readonly cameraView?: boolean;
}

/** The fixed subject navigation, including subjects with no current entries. */
export const subjects: readonly { readonly id: SubjectId; readonly title: string }[] = [
  { id: "chemistry", title: "Chemistry" },
  { id: "physics", title: "Physics" },
  { id: "biology", title: "Biology" },
];

/** Pilot visibility setting; change to false once the pilot starts. */
export const catalogueConfig = { showDraftModules: true };

interface ModuleRegistration {
  readonly id: string;
  readonly loadManifest: () => Promise<CatalogueManifest>;
  readonly loadModule: () => Promise<ModuleRuntime>;
}

const moduleRegistry: readonly ModuleRegistration[] = [
  {
    id: "chem.atom-builder",
    loadManifest: async () => (await import("../../../modules/chem-atom-builder/module.json")).default,
    loadModule: async () => {
      const module = await import("@mma/chem-atom-builder");
      return {
        manifest: module.manifest,
        mount: (root, options) => module.mountAtomBuilder(root, options),
      };
    },
  },
  {
    id: "physics.plane-mirror",
    loadManifest: async () => (await import("../../../modules/physics-plane-mirror/module.json")).default,
    loadModule: async () => {
      const module = await import("@mma/physics-plane-mirror");
      return {
        manifest: module.manifest,
        mount: (root, options) => module.mountPlaneMirror(root, options),
        cameraView: false,
      };
    },
  },
];

/** Build the visible catalogue from manifest data. */
export function buildCatalogue(
  manifests: readonly CatalogueManifest[],
  showDraftModules = catalogueConfig.showDraftModules,
): readonly CatalogueEntry[] {
  return manifests
    .filter((manifest): manifest is CatalogueManifest & { readonly subject: SubjectId } =>
      (showDraftModules || manifest.releaseStatus !== "draft") && isSubjectId(manifest.subject))
    .map((manifest) => ({
      id: manifest.id,
      subject: manifest.subject,
      title: manifest.title.en,
      description: manifest.description?.en
        ?? manifest.missions?.[0]?.goalText
        ?? "Explore this experience.",
      estimatedMinutes: manifest.estimatedMinutes,
      isDraft: manifest.releaseStatus === "draft",
    }));
}

/** Lazily load only the manifests listed in the registry. */
export async function loadCatalogue(): Promise<readonly CatalogueEntry[]> {
  const manifests = await Promise.all(moduleRegistry.map(({ loadManifest }) => loadManifest()));
  return buildCatalogue(manifests);
}

/** Load module code only after its catalogue entry is opened. */
export async function loadModuleRuntime(moduleId: string): Promise<ModuleRuntime | null> {
  const registration = moduleRegistry.find((entry) => entry.id === moduleId);
  if (!registration) {
    return null;
  }
  return registration.loadModule();
}

function isSubjectId(subject: string): subject is SubjectId {
  return subjects.some((entry) => entry.id === subject);
}
