/** The two cell types compared in the Cell Explorer. */
export type CellKind = "plant" | "animal";

/** Both cell kinds, in the order they are shown. */
export const CELL_KINDS: readonly CellKind[] = ["plant", "animal"];

/** Every organelle (and cell boundary) the biology kit knows about. */
export type OrganelleId =
  | "cell-wall"
  | "cell-membrane"
  | "cytoplasm"
  | "nucleus"
  | "endoplasmic-reticulum"
  | "ribosome"
  | "golgi-apparatus"
  | "lysosome"
  | "mitochondrion"
  | "chloroplast"
  | "vacuole";

/** Named parts inside an organelle that can be labelled and picked. */
export type OrganellePartId = "outer-membrane" | "inner-membrane" | "cristae" | "matrix" | "grana" | "stroma";

/** Whether the teacher has checked a piece of content. */
export type ReviewStatus = "pending" | "verified";

/** One labelled part of an organelle. */
export interface OrganellePart {
  readonly id: OrganellePartId;
  /** Label shown to students. */
  readonly name: string;
  /** Short plain-English note shown with the label, or null. */
  readonly note: string | null;
}

/** Whether an organelle is found in a cell kind, with an optional short note. */
export interface OrganellePresence {
  readonly present: boolean;
  /** For example "one large central vacuole". */
  readonly note: string | null;
}

/** One entry in the organelle table. */
export interface Organelle {
  readonly id: OrganelleId;
  /** Singular name shown to students. */
  readonly name: string;
  readonly pluralName: string;
  readonly presence: Readonly<Record<CellKind, OrganellePresence>>;
  /** Labelled parts (empty until the organelle is taught in detail). */
  readonly parts: readonly OrganellePart[];
  /** One- or two-sentence description for students, or null until it is written and reviewed. */
  readonly summary: string | null;
  /** True once the organelle has a journey chapter, facts and checkpoints. */
  readonly teachable: boolean;
  readonly reviewStatus: ReviewStatus;
}

const both = { present: true, note: null } as const;
const absent = { present: false, note: null } as const;

/**
 * The major organelles taught in school biology, with which cell kinds contain them.
 * Only mitochondria and chloroplasts are teachable so far; the rest are drawn so the
 * cells look complete. Every entry awaits the teacher's review.
 */
export const ORGANELLES: readonly Organelle[] = [
  {
    id: "cell-wall",
    name: "Cell wall",
    pluralName: "Cell walls",
    presence: { plant: both, animal: absent },
    parts: [],
    summary: null,
    teachable: false,
    reviewStatus: "pending",
  },
  {
    id: "cell-membrane",
    name: "Cell membrane",
    pluralName: "Cell membranes",
    presence: { plant: both, animal: both },
    parts: [],
    summary: null,
    teachable: false,
    reviewStatus: "pending",
  },
  {
    id: "cytoplasm",
    name: "Cytoplasm",
    pluralName: "Cytoplasm",
    presence: { plant: both, animal: both },
    parts: [],
    summary: null,
    teachable: false,
    reviewStatus: "pending",
  },
  {
    id: "nucleus",
    name: "Nucleus",
    pluralName: "Nuclei",
    presence: { plant: both, animal: both },
    parts: [],
    summary: null,
    teachable: false,
    reviewStatus: "pending",
  },
  {
    id: "endoplasmic-reticulum",
    name: "Endoplasmic reticulum",
    pluralName: "Endoplasmic reticulum",
    presence: { plant: both, animal: both },
    parts: [],
    summary: null,
    teachable: false,
    reviewStatus: "pending",
  },
  {
    id: "ribosome",
    name: "Ribosome",
    pluralName: "Ribosomes",
    presence: { plant: both, animal: both },
    parts: [],
    summary: null,
    teachable: false,
    reviewStatus: "pending",
  },
  {
    id: "golgi-apparatus",
    name: "Golgi apparatus",
    pluralName: "Golgi apparatus",
    presence: { plant: both, animal: both },
    parts: [],
    summary: null,
    teachable: false,
    reviewStatus: "pending",
  },
  {
    id: "lysosome",
    name: "Lysosome",
    pluralName: "Lysosomes",
    presence: { plant: both, animal: both },
    parts: [],
    summary: null,
    teachable: false,
    reviewStatus: "pending",
  },
  {
    id: "mitochondrion",
    name: "Mitochondrion",
    pluralName: "Mitochondria",
    presence: { plant: both, animal: both },
    parts: [
      { id: "outer-membrane", name: "Outer membrane", note: null },
      { id: "inner-membrane", name: "Inner membrane", note: null },
      { id: "cristae", name: "Cristae", note: "folds of the inner membrane" },
      { id: "matrix", name: "Matrix", note: "the fluid inside the inner membrane" },
    ],
    summary:
      "The powerhouse of the cell. It releases energy from food so the cell can do its work.",
    teachable: true,
    reviewStatus: "pending",
  },
  {
    id: "chloroplast",
    name: "Chloroplast",
    pluralName: "Chloroplasts",
    presence: { plant: both, animal: absent },
    parts: [
      { id: "outer-membrane", name: "Outer membrane", note: null },
      { id: "inner-membrane", name: "Inner membrane", note: null },
      { id: "grana", name: "Grana", note: "stacks of thylakoids" },
      { id: "stroma", name: "Stroma", note: "the fluid around the grana" },
    ],
    summary:
      "A green plastid that holds chlorophyll. It uses sunlight to make food for the plant.",
    teachable: true,
    reviewStatus: "pending",
  },
  {
    id: "vacuole",
    name: "Vacuole",
    pluralName: "Vacuoles",
    presence: {
      plant: { present: true, note: "one large central vacuole" },
      animal: { present: true, note: "small and few" },
    },
    parts: [],
    summary: null,
    teachable: false,
    reviewStatus: "pending",
  },
];

const BY_ID: ReadonlyMap<OrganelleId, Organelle> = new Map(ORGANELLES.map((organelle) => [organelle.id, organelle]));

/** Look up an organelle by id. */
export function organelleById(id: OrganelleId): Organelle {
  const organelle = BY_ID.get(id);
  if (!organelle) throw new Error(`Unknown organelle: ${id}`);
  return organelle;
}

/** Whether an organelle is found in a cell kind. */
export function isPresentIn(id: OrganelleId, kind: CellKind): boolean {
  return organelleById(id).presence[kind].present;
}

/** Organelles found in a cell kind, in table order. */
export function organellesIn(kind: CellKind): readonly Organelle[] {
  return ORGANELLES.filter((organelle) => organelle.presence[kind].present);
}

/** Organelles that have a journey chapter, facts and checkpoints. */
export function teachableOrganelles(): readonly Organelle[] {
  return ORGANELLES.filter((organelle) => organelle.teachable);
}

/** One labelled part of an organelle, or null when it has no such part. */
export function organellePart(id: OrganelleId, partId: OrganellePartId): OrganellePart | null {
  return organelleById(id).parts.find((part) => part.id === partId) ?? null;
}

/** Organelles split by where they are found, for "sort them" checkpoints. */
export interface OrganelleGroups {
  readonly plantOnly: readonly OrganelleId[];
  readonly animalOnly: readonly OrganelleId[];
  readonly both: readonly OrganelleId[];
}

/** Split organelles into plant only, animal only, and found in both. */
export function groupOrganelles(organelles: readonly Organelle[] = ORGANELLES): OrganelleGroups {
  const plantOnly: OrganelleId[] = [];
  const animalOnly: OrganelleId[] = [];
  const shared: OrganelleId[] = [];
  for (const organelle of organelles) {
    const inPlant = organelle.presence.plant.present;
    const inAnimal = organelle.presence.animal.present;
    if (inPlant && inAnimal) shared.push(organelle.id);
    else if (inPlant) plantOnly.push(organelle.id);
    else if (inAnimal) animalOnly.push(organelle.id);
  }
  return { plantOnly, animalOnly, both: shared };
}
