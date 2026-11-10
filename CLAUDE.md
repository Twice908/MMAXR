# CLAUDE.md: rules for AI agents working in this repo

Read this file first in every session. `README.md` is the full spec; this file is the short version of the rules that must never be broken. If the two ever conflict, stop and ask.

## 1. What this project is

MMA-XR (working title): an interactive WebXR learning platform for Math Maam Academy. One reusable engine, subject kits, and data-driven modules. Phone-first, headset optional. Runs in the browser and links to the academy's test portal.

Current status (update this block as work completes):
- Done: Phase 0 tasks 1-4 (monorepo + CI, `packages/schema`, `packages/engine-core`, `packages/kits/chemistry`).
- Done: Phase 1 task 6 lesson flow (screen-mode missions, assessments, and local-only learning events); Atom Builder remains `draft` pending assessment review.
- Done: Phase 2a screen-mode scripted narration player, ten reviewed English scripts, browser-only Piper generation, MP3 playback, and silent fallback.
- Done: Phase 3a-4a phone AR lesson flow with a world-fixed atom, DOM controls, a collapsible lesson panel, comfort safeguards, and touch-only view controls (pinch scale, one-finger rotation, reset); AR particle dragging is not enabled.
- Done: Android handheld WebXR AR/VR selects the measured phone panel layout; world-space headset sessions keep the desktop/headset layout.
- Done: Camera view removed on all devices; supported views per device are in docs/adr/0006-supported-views.md (Screen everywhere, Android ARCore AR with a tab-bar HUD, headset AR/VR, desktop AR/VR for emulator dev only; phone VR viewer hidden).
- Done: Ported the 3D scene, XR sessions and XR input to IWSDK 1.0.1 (super-three 0.181); XR lesson UI uses the Horizon UI kit; glass panels and the custom input rig are removed (docs/adr/0005-iwsdk-runtime.md). Needs headset and Android AR checks.
- Done: Web-view access-code login, student dashboard (Physics, Chemistry, Biology sections; settings drawer) and hash routing (`#/login`, `#/dashboard`, `#/experiment/<id>`). Temporary gate, see docs/adr/0007-temporary-access-code-gate.md. The accepted code(s) are plain text in `apps/web/src/auth/access-codes.ts`, the same in dev and production.
- Done: Ionic Bonding web view (`modules/chem-ionic-bonding`, draft, NaCl): shared `engine-lesson` and `engine-ui` packages, kit compound table and bonding rules, multi-atom `MoleculeView` (docs/adr/0008-shared-lesson-packages-and-ionic-bonding.md). The liquid-glass UI skill is removed; use the Horizon UI kit and standard UX rules.
- Done: Ionic Bonding AR: phone AR (ARCore, DOM overlay HUD, in-model electron drag) and desktop emulator / headset AR (Horizon module panels with move buttons); shared `mountXrSession`, `createXrHud` (engine-ui) and `createXrModulePanels` (engine-render). Needs Android and headset checks (docs/ar-testing.md).
- Done: Ionic Bonding VR (same shared session and Horizon panels), in-scene Na/Na+ and Cl/Cl- labels for headsets and the emulator, and an opt-in `xrLift` so the model sits just above eye level. Owner checked AR and VR in the emulator.
- Done: Ionic Bonding narration (6 Piper cues, scripts pending review) in web, phone AR and headset views. Narration generator is global (any module via `?narration-generator=<id>`); narration asset loading and telemetry are shared in `engine-voice` and used by both modules; shared narration bar in `engine-ui`.
- Done: Ohm's Law stage 2: `packages/kits/physics` (`@mma/kit-physics`) with one-liner circuit parts, DC solver, filament bulb curve (pending review), meter-placement checks and a circuit bench reducer (docs/adr/0009-physics-kit-circuits.md).
- Done: Ohm's Law stage 3: screen module `modules/physics-ohms-law` (draft; 4 missions, 8 pending questions), kit `layoutSeriesLoop`, `CircuitView` (engine-render), `createDataTable` / `createXyGraph` (engine-ui), e2e spec (docs/adr/0010-ohms-law-screen-module.md).
- Done: Ohm's Law stage 4: 10 narration cues (scripts pending review, draft Piper audio), shared narration bar in the page.
- Done: Ohm's Law stage 5: phone AR (HUD: Mission, Circuit, Readings, Sound) and headset / emulator AR and VR (Horizon panels); checked in the emulator only.
- Next: Android and headset checks for Ohm's Law (docs/ar-testing.md); teacher review of Ohm's Law questions, bulb curve, graph axes and concept classes; Android and headset checks for Ionic Bonding; review the Atom Builder and Ionic Bonding assessment items and narration scripts.
- Not started: Phase 2b live voice guide, remaining XR work (including headset VR and other 3a-4b work), portal link (Phase 4).

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
pnpm --filter @mma/web dev         # IWSDK dev session: Runtime/Editor browser + Quest emulator (https://localhost:5173)
pnpm --filter @mma/web dev:runtime # plain Vite dev server only
pnpm --filter @mma/web dev:down    # stop the IWSDK dev session
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
- Narration: `packages/engine-voice`; mock asset generator: `tools/generate-narration`.
- Shared lesson flow and lesson view model: `packages/engine-lesson`; shared screen lesson UI: `packages/engine-ui`.
- XR UI reference and tokens: read `docs/horizon-ui.md` before any AR/VR/MR/XR UI work.
- Decisions: `docs/adr/`.
- Device testing record: `docs/device-matrix.md`.
- Layout reference: `docs/layout.md` (screen, AR overlays, safe zones, and spatial panel slots).

## 10. Project skills

Task-specific skills live in `.claude/skills/<name>/SKILL.md` (planned: `scaffold-module`, `author-manifest`, `optimize-assets`, `xr-input-mapping`, `perf-audit`, `curriculum-align`, `telemetry-contract`, `comfort-review`; Phase 2 adds `narration-authoring` and `voice-guide-guardrails`). Use a skill when its description matches the task.