# ADR 0001: Screen Renderer Ownership and Draft Release Status

Status: Accepted

## Context

The screen-mode Atom Builder needs a touch-and-mouse Three.js scene without allowing Three.js to enter `engine-core`. The module is authored as a draft until its missions and assessments are complete and reviewed, while released modules must retain the four-layer contract and curriculum links.

## Decision

- Put the Three.js screen renderer, pointer/touch action adapter, camera controls, and view-resource lifecycle in `packages/engine-render` (`@mma/engine-render`). Keep `engine-core` free of Three.js.
- Put the Atom Builder manifest, chemistry-to-view layout, HUD, and module interaction handling in `modules/chem-atom-builder` (`@mma/chem-atom-builder`). Load it lazily from `apps/web`.
- Add `releaseStatus: "draft" | "release"` to manifests; omitted status defaults to `"release"`. Drafts may have empty mission and check layers. Release validation requires all four interaction layers to be non-empty, every concept ID to exist in `@mma/curriculum`, and every assessment item to be marked `reviewed`.
- Keep the Atom Builder in draft while the teacher reviews its eight assessment items. The release validator refuses drafts and pending items; after review, changing `releaseStatus` to `"release"` is a one-line module-manifest change.
- Learning telemetry is emitted through engine-core to a local in-memory sink only in this phase. No network delivery is implemented before Phase 4.

## Consequences

- Screen rendering stays replaceable and subject-neutral, while chemistry state and rules remain in the chemistry kit.
- Draft validation supports work in progress without weakening the explicit release gate.
- Mission completion triggers its ordered assessment items; pending review keeps the module out of release.