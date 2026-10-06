# CLAUDE.md: rules for AI agents working in this repo

Read this file first in every session. `README.md` is the full spec; this file is the short version of the rules that must never be broken. If the two ever conflict, stop and ask.

## 1. What this project is

MMA-XR (working title): an interactive WebXR learning platform for Math Maam Academy. One reusable engine, subject kits, and data-driven modules. Phone-first, headset optional. Runs in the browser and links to the academy's test portal.

Current status (update this block as work completes):
- Done: Phase 0 tasks 1-4 (monorepo + CI, `packages/schema`, `packages/engine-core`, `packages/kits/chemistry`).
- Done: Phase 1 task 6 lesson flow (screen-mode missions, assessments, and local-only learning events); Atom Builder remains `draft` pending assessment review.
- Done: Phase 2a screen-mode scripted narration player, ten reviewed English scripts, browser-only Piper generation, MP3 playback, and silent fallback.
- Done: Phase 3a-4a phone AR lesson flow with a world-fixed atom, DOM controls, a collapsible lesson panel, comfort safeguards, and touch-only view controls (pinch scale, one-finger rotation, reset); AR particle dragging is not enabled.
- Done: Desktop screen camera view with local-only video, screen input, and clean media-track teardown; it does not use world tracking.
- Done: Web Start page, subject pages, hash routes, manifest catalogue, and developer tool links; routes are documented in `docs/routes.md`.
- Next: Review the eight assessment items and verify generated narration on desktop and phone.
- Not started: Phase 2b live voice guide, remaining XR work (including 3a-4b and VR), portal link (Phase 4).

## 2. Phase gates (do not build ahead)

- P0 and P1: NO audio, voice, speech, WebXR/AR/VR, multiplayer, or authoring UI. Phase 2a is limited to the screen-mode scripted player and browser-only local Piper generation; no live guide, microphone, STT, LLM, or remote speech service.
- Build only the task you were given. If you see useful extra work, list it in your summary; do not do it.
- Never add a feature, dependency, or package that the task did not ask for without approval.

## 3. Architecture rules (hard rules)

1. **Dependency direction is downward only:** `apps` -> `modules` -> `kits` -> `engine-*` -> `schema`/`curriculum`. `engine-core` must not import from kits, modules, or apps, and must not depend on `three`. Kits never import modules. Lint enforces this; never disable or weaken the boundary rules.
2. **State is plain, serializable data, and changes only through `dispatch(action)`.** Reducers are pure and deterministic: no `Date.now`, no `Math.random`, no I/O, no DOM. Time and ids are injected (`Clock`, `IdGenerator`).
3. **Rendering is view-only.** 3D positions are derived from state. Rendering code subscribes to the store and never mutates it directly. Camera movement never changes learning state.
4. **Modules never read raw input.** All input goes through the action vocabulary: `hover`, `select`, `grab`, `move`, `release`, `rotate`, `scale`, `confirm`, `back`. New devices are new adapters in `engine-render`/`engine-xr`.
5. **Modules are data first.** A module is `module.json` plus assets and (rarely) a rules plugin, validated by `@mma/schema`. A module must have all four layers: Manipulate, Simulate, Mission, Check.
6. **Engine stays subject-agnostic.** Subject logic (chemistry, biology, physics) lives in `kits/*`.
7. **Degrade, never fail.** `screen` mode is always a working fallback. Do not assume AR or WebXR support.

## 4. Education content rules

- The teacher (the repo owner) is the authority on syllabus content. **Do not invent or redefine scientific or curriculum terms.** If a definition is ambiguous, list the options and ask.
- Wording for students: short, plain English, Class 9-10 reading level. Explain *why* something is rejected, not just that it is.
- Terminology: use "complete / incomplete outer shell" or "reactive". Do not use "stable/unstable atom" in code or UI text for electron arrangement (nuclear stability is a separate concept, deferred).
- Shell filling follows Bohr-Bury: capacity 2n^2 per shell, but the outermost shell holds at most 8 (K is 2,8,8,1; Ca is 2,8,8,2).
- Tests for scientific facts must use values the teacher has verified. Do not derive expected values from the implementation under test.

## 5. Privacy and safety (non-negotiable)

- No PII in telemetry or logs: only an opaque `studentRef` and `sessionId`. No names, phone numbers, emails.
- Never store camera frames or raw audio. Never commit secrets, `.env` files, or API keys. LLM/STT/TTS keys, when they exist, stay server-side only.
- Comfort rules apply to every XR feature: no smooth locomotion by default, seated-friendly, visible exit control, session break reminders.
- Third-party assets and fonts: record the license in `assets/LICENSES.md` before using them.

## 6. Commands

```bash
pnpm install --frozen-lockfile     # install exactly from the lockfile
pnpm typecheck                     # all packages
pnpm lint                          # includes dependency-boundary rules
pnpm test                          # Vitest
pnpm generate:narration             # generate local mock audio and captions
pnpm --filter @mma/web dev         # dev server (http://localhost:5173)
pnpm --filter @mma/web build       # production build
pnpm validate:manifests            # once the validator tool exists
```

Package scope is `@mma/*`. Pin exact dependency versions (no `^` or `~`) and explain every new dependency in your plan.

## 7. Definition of done (every task)

All of these must pass before you say a task is done:
1. `pnpm install --frozen-lockfile`
2. `pnpm typecheck`
3. `pnpm lint`
4. `pnpm test`
5. `pnpm --filter @mma/web build` (when apps/web is affected)

Also: new logic has unit tests; public APIs have TSDoc; no leftover debug code; no unrelated formatting churn.

## 8. How to work

1. **Plan first.** For any non-trivial task, send a short plan (files, public types, dependencies, open questions) and **wait for approval before editing**.
2. **Small steps.** One task at a time, taken from README section 16 or the prompt. Stop when it is done.
3. **Ask, don't guess.** If the README is silent or ambiguous, ask a specific question with 2-3 options and your recommendation.
4. **Test what you build.** Pure logic (rules, layout, input mapping) must be testable without a GPU. Prefer deterministic tests.
5. **Performance matters.** Target 30 fps on a mid-range Android phone. Use instancing for repeated particles, dispose geometries/materials/listeners on unmount, cap pixel ratio by quality tier, respect `prefers-reduced-motion`.
6. **Record decisions.** Significant choices go in `docs/adr/NNNN-title.md` (short: context, decision, consequences).
7. **Summarise honestly.** End each task with: what you did, what you did not do, tests added, anything you are unsure about, and how to verify manually.
8. **Git hygiene.** Do not commit, push, or rewrite history unless asked. Suggested commit style when asked: `feat:`, `fix:`, `chore:`, `docs:`, `test:`.

## 9. Where things live

- Spec and roadmap: `README.md` (sections: 6 architecture, 7 manifest, 9 portal/telemetry, 11 repo layout, 13 roadmap, 16 first tasks, 17 decisions).
- Schemas: `packages/schema` (`module-manifest.ts`, `telemetry-event.ts`).
- Engine: `packages/engine-core` (store, actions, events, missions).
- Chemistry rules: `packages/kits/chemistry`.
- Optics rules: `packages/kits/physics/optics`.
- Narration: `packages/engine-voice`; mock asset generator: `tools/generate-narration`.
- Decisions: `docs/adr/`.
- Device testing record: `docs/device-matrix.md`.

## 10. Project skills

Task-specific skills live in `.claude/skills/<name>/SKILL.md` (planned: `scaffold-module`, `author-manifest`, `optimize-assets`, `xr-input-mapping`, `perf-audit`, `curriculum-align`, `telemetry-contract`, `comfort-review`; Phase 2 adds `narration-authoring` and `voice-guide-guardrails`). Use a skill when its description matches the task.