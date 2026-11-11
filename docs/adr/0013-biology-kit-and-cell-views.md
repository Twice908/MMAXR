# ADR 0013: Biology kit and realistic cell views

Status: Accepted

## Context

The Plant vs Animal Cell Explorer is the first biology module: a narrated journey past a
plant cell and an animal cell, with checkpoint questions answered on the live model. The
owner's choices (2026-11-11): cover the major organelles taught in school, but teach
mitochondria and chloroplasts first; realistic cells, not glowing or stylised; keep
lysosomes (in both cells), leave out the centrosome; label the outer and inner membrane,
cristae, matrix, grana (thylakoid stacks) and stroma; no class- or board-specific wording.
Phase 1 builds the kit and the 3D models only, no journey or page.

## Decision

- New package `@mma/kit-biology` (`packages/kits/biology`), depending only on
  `@mma/engine-core`. It shares the physics kit's lint rule: no Three.js, DOM, I/O,
  `Date.now` or `Math.random`.
- `ORGANELLES` is the organelle table: name, plural, presence in plant and animal cells
  (with a note such as "one large central vacuole"), labelled parts, a short summary,
  `teachable`, and `reviewStatus`. Only mitochondria and chloroplasts are teachable and
  have summaries and parts; every entry is `pending` until the teacher reviews it.
  Helpers: `organelleById`, `isPresentIn`, `organellesIn`, `teachableOrganelles`,
  `organellePart`, `groupOrganelles` (plant only / animal only / both).
- `layoutCell(kind, { seed, position, density })` places the nucleus, reticulum, Golgi,
  vacuoles, and scattered mitochondria, chloroplasts, lysosomes and ribosomes. It is
  deterministic (seeded) and tested for containment and spacing. `density: "light"`
  places fewer small parts for phones.
- `seededRandom` moved to `@mma/engine-core` so the kit and the renderer share one
  implementation.
- `CellView` (`@mma/engine-render`) follows the `CircuitView` pattern: it takes a plain
  `CellSceneFrame` and never imports a kit (a kit cell layout fits `CellSceneCell`
  structurally). Models are procedural: rounded-box plant cell with a wall, irregular
  blob animal cell, translucent membranes, folded reticulum, curved Golgi sacs, and one
  instanced batch per scattered organelle kind. Detail models of a mitochondrion and a
  chloroplast can be cut open (a wedge facing the viewer) to show their parts.
- Pick targets: `cell:<cellId>:<organelle>` and `detail:<detailId>:<part>`
  (`cellOrganelleTarget`, `organelleDetailTarget`, `parseCellTarget`). See-through shells
  (wall, membrane, vacuole) set `userData.pickBackdrop`; `SceneRenderer.pickTarget` now
  drops those hits when something solid is also hit (`preferForeground`). Existing views
  set no backdrop flag, so their picking is unchanged.
- `?model-preview=cell` is a development-only page (like the narration generator) for
  checking models before a module uses them.
- Concept ids `sci.bio.cell.structure`, `sci.bio.cell.plant-vs-animal`,
  `sci.bio.cell.mitochondria`, `sci.bio.cell.chloroplast`, registered for classes 8 to 10 on
  all boards. These ids are never shown to students.

## Consequences

- Procedural models need no third-party assets or licences and scale by quality tier
  (`quality: "low"` uses fewer polygons). They are less detailed than sculpted models.
- Adding an organelle to the journey later is a table change (`teachable`, summary,
  parts) plus, where needed, a detail model in `CellView`.
- Organelle presence, summaries and part notes await the teacher's review.
