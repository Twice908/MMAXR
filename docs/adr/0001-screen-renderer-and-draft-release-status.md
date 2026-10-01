# ADR 0001: Screen Renderer Ownership and Draft Release Status

Status: Accepted

## Context

Phase 0 task 5 needs a touch-and-mouse Three.js scene without allowing Three.js to enter `engine-core`. The module also needs to be loadable before missions and assessments are authored, while published modules must retain the four-layer contract.

## Decision

- Put the Three.js screen renderer, pointer/touch action adapter, camera controls, and view-resource lifecycle in `packages/engine-render` (`@mma/engine-render`). Keep `engine-core` free of Three.js.
- Put the Atom Builder manifest, chemistry-to-view layout, HUD, and module interaction handling in `modules/chem-atom-builder` (`@mma/chem-atom-builder`). Load it lazily from `apps/web`.
- Add `releaseStatus: "draft" | "release"` to manifests; omitted status defaults to `"release"`. Drafts may have empty mission and check layers. Release manifests still require all four interaction layers to be non-empty.
- Keep the task 5 Atom Builder in draft. Once task 6 adds missions and assessments, the module must flip to `"release"`.
- A manifest publishing validator must refuse to publish any module whose status is `"draft"`. No publishing validator exists yet; this is a required gate when publishing is implemented.

## Consequences

- Screen rendering stays replaceable and subject-neutral, while chemistry state and rules remain in the chemistry kit.
- Draft validation supports work in progress without weakening release validation.
- The task 6 completion step includes changing the manifest status and confirming the full mission/check contract.