# MMA-XR — Interactive XR Learning Platform (working title)

An interactive 3D / AR / VR learning platform for Math Maam Academy.
One reusable engine, many data-driven learning modules, delivered through the browser (WebXR) and connected to the academy's existing website and test portal.

> Status: Phase 0 (foundation). First module: **Atomic Structure Builder**.
> Planned for Phase 2 (not P0/P1): audio narration and a live voice guide (section 6.7).
> Replace the working title `MMA-XR` and the `@mma/*` package scope with your final brand name at any time (search-and-replace).

---

## 1. Vision

Students should *do* science and math in 3D, not watch it. Every module is something you grab, build, break, and fix, then get checked on.

Long-term, this is a platform:

- A shared **engine** (rendering, input, XR sessions, rules, missions, assessment, telemetry).
- Subject **kits** (chemistry, biology, physics, electronics, geometry) built on the engine.
- Many **modules** (Atom Builder, Cell Explorer, Projectile Lab, ...) defined mostly as data.
- **Audio narration and a voice guide** (Phase 2) that explain topics and help students navigate while they interact.
- Later: a **teacher authoring tool**, a **shared classroom** (multiplayer), **analytics**, and a richer **AI tutor**, all layered on without rewriting the core.

## 2. Design principles

1. **Interactive, not a presentation.** Every module must contain Manipulate, Simulate, Mission, and Check (see section 5). If a module is only "look and rotate", it doesn't ship.
2. **Phone first, headset optional.** Primary target is a mid-range Android phone in Chrome. AR is an upgrade on capable phones. VR headsets are an optional upgrade, never a requirement.
3. **Data-driven modules.** New content = new manifest + assets + (rarely) a small rules plugin. Not a new app.
4. **Tied to marks.** Every module maps to curriculum concept IDs and to portal test questions. No orphan "wow" content.
5. **Short sessions.** Missions are 5-10 minutes. Break reminders are built in.
6. **Engine stays subject-agnostic.** Subject logic lives in kits and modules, never in `engine-core`.
7. **Measure everything that matters.** Telemetry from day one so the pilot can prove (or disprove) learning gains.
8. **Child safety and privacy by default.** Minimal data, no PII in telemetry, comfort-safe locomotion.
9. **Audio is an enhancement, never a requirement.** (Phase 2) Every lesson must stay fully completable muted, with captions and text hints.

## 3. Scope

### 3.1 v0.1 — Atomic Structure Builder (Class 9-10 Science depth)

- **Atom Builder:** drag protons, neutrons, electrons into the atom. Element name, atomic number, mass number, and charge update live.
- **Shell filling:** electrons snap into shells (2, 8, 8, ...) and invalid placements are rejected with an explanation.
- **Model toggle:** Bohr model vs electron-cloud view, with a short "why they differ" panel.
- **Ions and isotopes:** add/remove electrons or neutrons and see what changes.
- **Missions:** e.g. "Make Na+", "Build carbon-14", "Fix the unstable atom".
- **Scale mode (stretch):** zoom cell -> atom -> nucleus.
- **Check:** after each mission, 2-3 questions mapped to concept IDs; results sent to the portal.

Class 11-12 depth (orbitals, quantum numbers, electron configuration) is added later as extra **depth levels** inside the same module manifest (see `levels` in section 7).

### 3.2 Next

- v0.2: Audio narration, then the voice guide, for Atom Builder (Phase 2, section 6.7).
- v0.3: AR mode (phones) and VR mode (headsets) for Atom Builder.
- v0.4: Portal integration + one-batch pilot.
- v0.5: Cell Ultrastructure module (organelle missions, protein pathway).

### 3.3 Out of scope for v0.1

Audio narration and the voice guide (Phase 2), multiplayer, teacher authoring UI, hand tracking, native apps. P0 and P1 must not include them, but must not block them either (section 6.7 lists the small hooks reserved now).

## 4. Tech stack

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript (strict) | Safety across a growing plugin ecosystem |
| 3D + XR | Three.js + built-in WebXR support | De facto standard, large ecosystem |
| Build | Vite | Fast dev, simple static output, easy code-splitting per module |
| Monorepo | pnpm workspaces (+ Turborepo optional) | Clear package boundaries, shared tooling |
| State | Small framework-agnostic store (e.g. Zustand vanilla) + typed event bus | Engine must not depend on a UI framework |
| Manifest validation | Zod (or JSON Schema) | Reject bad content at build time and load time |
| In-world UI | three-mesh-ui or troika-three-text for XR; plain DOM overlay for 2D mode | Panels must work both in and out of XR |
| Assets | glTF/GLB, Draco/Meshopt geometry compression, KTX2 textures, via glTF-Transform | Small downloads on mobile data |
| Audio playback (Phase 2) | Web Audio API, positional audio in AR/VR | Low latency; voice can come from the object being explained |
| Narration generation (Phase 2) | Build-time TTS pipeline -> compressed audio + caption files | Reliable, cacheable, no per-student runtime cost |
| Voice guide (Phase 2) | STT + LLM + TTS behind the API bridge, providers swappable | Keys and prompts stay server-side |
| Backend (portal bridge) | Node.js + Fastify (or your existing portal stack), PostgreSQL, Prisma | Fits existing backend skills; thin bridge, not a rewrite |
| Unit tests | Vitest | Rules engine and manifest logic are pure and testable |
| E2E / visual | Playwright (+ WebGL screenshot checks) | Catch regressions in the shell and UI |
| XR testing | Immersive Web Emulator (browser extension) + real devices | Emulator for speed, devices for truth |
| CI | GitHub Actions | Lint, typecheck, test, asset budget check, deploy |

Pin exact dependency versions at project setup and upgrade Three.js deliberately (its API changes between releases).

## 5. Interaction model (the "not a presentation" contract)

Every module must implement all four layers:

1. **Manipulate** — grab, drag, rotate, scale, place.
2. **Simulate** — the world reacts by rules (add a proton -> the element changes).
3. **Mission** — goal-driven tasks with success/fail states and hints.
4. **Check** — assessment questions triggered by interaction state, mapped to concept IDs.

A module's manifest is validated for the presence of all four.

## 6. Architecture

### 6.1 Layers

```
 +----------------------------------------------------------+
 |  apps/web (Shell)    host page, module loader, UI chrome |
 +----------------------------------------------------------+
 |  modules/*           atom-builder, cell-explorer, ...    |  <- mostly data
 +----------------------------------------------------------+
 |  kits/*              chemistry, biology, physics, ...    |  <- subject logic
 +----------------------------------------------------------+
 |  engine-ui     engine-assess     engine-telemetry        |
 |  engine-voice (Phase 2: narration + voice guide)         |
 |  engine-xr (sessions, input, comfort)                    |
 |  engine-core (scene, entities, rules, missions, events)  |
 +----------------------------------------------------------+
 |  Three.js / WebXR / browser                              |
 +----------------------------------------------------------+
            |  (signed token, events)
 +----------------------------------------------------------+
 |  apps/api (portal bridge)  <->  existing website + portal |
 +----------------------------------------------------------+
```

Dependency rule: arrows point **downward only**. `engine-core` imports nothing from kits or modules. Kits never import modules. Enforce with lint rules (e.g. dependency-cruiser or ESLint boundaries).

### 6.2 Core concepts

- **Module:** a self-contained learning experience, lazy-loaded. Contains a manifest, assets, and optional rules plugin.
- **Kit:** reusable subject components (e.g. chemistry kit: element table, shell model, bond rules; biology kit: organelle definitions, membrane shader).
- **Entity:** a thing in the scene with components (transform, mesh, grabbable, label, rules-state).
- **Rule:** a pure function `(state, action) -> state` plus validation messages. Rules are unit-tested without any 3D.
- **Mission:** a goal evaluated against state ("charge == +1 and symbol == Na").
- **Assessment item:** a question linked to concept IDs, shown at defined triggers.
- **Render mode:** `screen` (touch/mouse), `ar`, or `vr`. The same module runs in all three.
- **Capability profile:** detected at runtime; selects the best supported mode and quality tier.

### 6.3 Input abstraction

Modules never read raw input. The engine converts all devices to a small action vocabulary:

`hover`, `select`, `grab`, `move`, `release`, `rotate`, `scale`, `confirm`, `back`.

Mapped from: touch, mouse, phone AR taps/drags, VR controllers, and (later) hand tracking. Adding hand tracking later = adding one adapter, not touching modules.

### 6.4 Mode ladder and capability detection

1. On load, detect WebGL, WebXR `immersive-ar` / `immersive-vr` support, device memory, and GPU tier.
2. Choose the highest supported mode, **always** keeping `screen` as a working fallback.
3. Choose a quality tier (`low` / `mid` / `high`): texture size, shadow quality, particle counts, antialiasing.
4. Never block a student on unsupported hardware; degrade, don't fail.

Do not assume every phone supports AR. Maintain a tested device matrix (see section 12).

### 6.5 Comfort and safety (engine-level, not per-module)

- No artificial smooth locomotion by default; use teleport or "move the object, not the player".
- Optional vignette during any camera motion.
- Seated-friendly interactions; nothing requires standing or large movement.
- Session timer with a break reminder (default: remind at ~10 min, hard suggestion at ~20 min for younger students; configurable per level).
- Headset use only for older students with supervision; headset age guidance follows manufacturer recommendations (commonly 12-13+).
- A visible "exit to normal view" control at all times.

### 6.6 Scalability path (why this holds up)

| Future capability | Where it plugs in | Core rewrite needed? |
|---|---|---|
| New subject / module | New `modules/*` + manifest (+ kit if new subject) | No |
| Audio narration + voice guide | `engine-voice` package subscribing to the event bus and dispatching whitelisted actions | No (hooks reserved in P0, see 6.7) |
| Hand tracking, eye tracking | New input adapter in `engine-xr` | No |
| Multiplayer classroom | New `engine-net` package syncing the entity/rule state | No (state is already serializable) |
| Teacher authoring tool | Edits manifests via schema; writes to API | No |
| AI tutor | Subscribes to the event bus + mission state; sends hints | No |
| Analytics dashboard | Reads telemetry from API | No |
| Native / headset-native app | Wraps the same engine packages | No |
| Localization (English / Marathi / Hindi) | i18n keys in manifests, locale loader in shell | No |

Design rule that makes this possible: **all gameplay state is plain serializable data, and all changes go through actions** (`dispatch(action)`). That single rule enables replay, multiplayer, analytics, undo, and AI hints later.

### 6.7 Audio and voice guide (Phase 2)

Is it possible? Yes, in the browser. It is deliberately **not** part of P0 or P1. It ships in two stages so the cheap, reliable part comes first.

#### Stage 2a: Scripted narration (deterministic)

- Narration **cues** are declared in the module manifest and fire on events (`module_started`, `mission_started`, `invalid_placement`, `mission_completed`, `idle`, first time a concept appears).
- Audio is **generated at build time** from reviewed scripts via a TTS pipeline and shipped as compressed audio files plus caption files, per language. No per-student runtime cost, works offline once cached, and a teacher can review every line.
- Playback uses the Web Audio API. In AR/VR it is **positional**, so the voice seems to come from the object being explained.
- Controls: mute, replay, speed, captions on/off, language. Narration is always interruptible and never blocks interaction.

#### Stage 2b: Live voice guide (conversational)

Pipeline: push-to-talk -> speech-to-text -> guide brain (LLM, via the API bridge) -> text-to-speech -> playback with captions.

- **Context given to the guide:** module id, depth level, current mission and state, last few actions, concept IDs, and the module's approved knowledge document (grounding). Never the student's identity.
- **It can act, but only through a whitelist** sent through the same `dispatch(action)` path as the student: `highlight`, `show_hint`, `focus_camera`, `open_panel`, `start_mission`. This is how it helps students navigate ("take me to the nucleus"). Anything outside the whitelist is refused.
- **Guardrails:** stays on the module's topic and syllabus level; age-appropriate; short spoken answers; declines unrelated chat; uses a hint ladder (nudge -> clue -> explanation) instead of giving mission answers away; falls back to scripted hints when offline, over budget, or if a response fails a safety check.
- **Server-side only:** API keys, prompts, rate limits, and a cost cap per student per day.
- **Provider-agnostic:** `SttAdapter`, `GuideAdapter`, and `TtsAdapter` interfaces so providers can be swapped without touching modules.
- **Latency goal:** first audio within a few seconds, using streaming and a short "thinking" cue. Measure before promising anything.

#### Things to verify at the start of Phase 2

- Browser speech APIs differ by browser and device in support and voice quality, so they must not be the main path. Check current support at the time.
- Microphone access needs HTTPS and a user gesture. Test mic and audio behaviour inside AR/VR sessions on real devices.
- Speech recognition for Indian accents and mixed-language speech (English/Hindi/Marathi) must be tested with real students before it is promised as a feature.
- Cost per student-minute for STT + LLM + TTS, and whether it fits the academy's fees.

#### Hooks reserved in P0 (no audio is built)

1. The event bus already emits all learning events (section 6.6 rule).
2. The manifest schema accepts an optional `narration` block and ignores it (section 7.1).
3. An empty `engine-voice` package stub exists.
4. Actions are typed so the guide can reuse them later.

## 7. Module manifest

A module is described by `module.json`, validated by schema at build time and at load time. Always include `schemaVersion`.

```json
{
  "schemaVersion": "1.0",
  "id": "chem.atom-builder",
  "title": { "en": "Atom Builder" },
  "subject": "chemistry",
  "kit": "chemistry",
  "concepts": ["sci.chem.atom.structure", "sci.chem.atom.shells", "sci.chem.atom.isotopes", "sci.chem.atom.ions"],
  "boards": ["CBSE", "ICSE", "STATE"],
  "levels": [
    { "id": "class9-10", "classes": [9, 10], "features": ["particles", "shells", "ions", "isotopes"] },
    { "id": "class11-12", "classes": [11, 12], "features": ["orbitals", "quantum-numbers", "electron-config"] }
  ],
  "modes": ["screen", "ar", "vr"],
  "estimatedMinutes": 8,
  "assets": [
    { "id": "proton", "src": "assets/proton.glb", "budgetKB": 120 }
  ],
  "interactions": {
    "manipulate": ["grab-particle", "snap-to-shell", "toggle-model"],
    "simulate": ["update-element", "update-charge", "stability-check"],
    "missions": ["make-na-ion", "build-c14", "fix-unstable-atom"],
    "check": ["assess.atom.basic.01", "assess.atom.ions.02"]
  },
  "missions": [
    {
      "id": "make-na-ion",
      "goal": { "symbol": "Na", "charge": 1 },
      "hints": ["Sodium has 11 protons.", "A +1 ion has lost one electron."],
      "onComplete": { "triggerAssessment": "assess.atom.ions.02" }
    }
  ],
  "rulesPlugin": "./rules/index.ts"
}
```

Validation must fail the build if: a concept ID is unknown, an asset exceeds its budget, a mission references a missing assessment, or any of the four interaction layers is empty.

### 7.1 Reserved `narration` block (Phase 2, ignored before then)

```json
"narration": {
  "languages": ["en"],
  "cues": [
    { "id": "intro", "trigger": "module_started", "script": "narration/en/intro.txt", "target": "entity:nucleus", "interruptible": true },
    { "id": "bad-shell", "trigger": "invalid_placement", "script": "narration/en/bad-shell.txt" }
  ],
  "guide": {
    "enabled": false,
    "allowedActions": ["highlight", "show_hint", "focus_camera", "open_panel", "start_mission"],
    "groundingDocs": ["guide/atom-builder-knowledge.md"]
  }
}
```

## 8. Curriculum and concept IDs

- Every module links to **concept IDs** in a single registry (`packages/curriculum/concepts.json`), e.g. `sci.chem.atom.structure`.
- The registry maps concepts to boards (CBSE / ICSE / State / others), classes, and chapters.
- The **same concept IDs** tag questions in the test portal. This is what enables:
  - "Student got this question wrong -> open the matching module".
  - Per-concept reports comparing XR users vs non-users.
- Treat the registry as a first-class, versioned asset. Agree on the ID scheme with the portal early.

## 9. Portal integration

### 9.1 Embedding

- Modules are served as static pages under a path such as `/xr/<module-id>` on the existing site (or a subdomain).
- The portal opens them via link, iframe, or web-component wrapper, with a **deep link**:
  `/xr/chem.atom-builder?concept=sci.chem.atom.ions&from=q:12345&level=class9-10`
- XR browser permissions (camera for AR, XR sessions) require HTTPS and a user gesture; iframes need the appropriate `allow` attributes. Prefer a top-level page over an iframe if AR/VR sessions misbehave.

### 9.2 Auth

- The portal issues a short-lived signed token (JWT) containing an opaque student ID, class, and batch.
- The XR app sends that token to the API bridge. **No names, phone numbers, or emails** go into XR telemetry.

### 9.3 Telemetry events (contract)

All events share an envelope and are batched to the API.

```json
{
  "eventId": "uuid",
  "ts": "2026-10-01T10:15:30Z",
  "studentRef": "opaque-id",
  "sessionId": "uuid",
  "moduleId": "chem.atom-builder",
  "moduleVersion": "1.0.3",
  "type": "mission_completed",
  "payload": { "missionId": "make-na-ion", "attempts": 3, "hintsUsed": 1, "durationSec": 142 },
  "device": { "mode": "ar", "tier": "mid" }
}
```

Core event types: `session_started`, `session_ended`, `mode_selected`, `mission_started`, `mission_completed`, `mission_failed`, `hint_used`, `assessment_answered`, `comfort_break_shown`, `error`.

Phase 2 adds: `narration_played`, `narration_skipped`, `voice_query_asked`, `guide_action_dispatched`, `voice_fallback_used`. Voice events never contain audio; transcripts are off by default (section 15).

Rules: events are append-only, versioned, and batched; the app works offline-tolerantly (queue and retry); failures never block the learning experience.

### 9.3.1 Minimal API bridge

- `POST /v1/events` — batch ingest.
- `GET /v1/students/:ref/progress` — per-concept progress for the portal.
- `GET /v1/modules` — catalogue (id, title, concepts, levels).
- Storage: PostgreSQL (events table partitioned by month; derived `concept_progress` table).

## 10. Asset pipeline

1. Author or source models (procedural geometry for the atom; sourced/created models for biology). Record license and attribution for every third-party asset in `assets/LICENSES.md`.
2. Run `pnpm assets:optimize` (glTF-Transform): dedupe, prune, Draco/Meshopt, KTX2.
3. CI checks each asset against the manifest `budgetKB`.

### Performance budgets (starting targets, tune after device testing)

| Tier | Target | Notes |
|---|---|---|
| Initial load (shell + first module) | < 3 MB over network | Lazy-load everything else |
| Frame rate | 30 fps minimum on low tier phones; 60+ preferred; 72-90 on headsets | Measure on real devices |
| Draw calls | keep low; use instancing for repeated particles | Atoms and cells have many repeated parts |
| Texture size | 1K on low tier, 2K on high | KTX2 compressed |

## 11. Repository structure

```
/
├─ README.md
├─ CLAUDE.md                     # agent instructions (see section 14)
├─ .claude/skills/               # project skills for Claude Code (see section 14)
├─ package.json
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
├─ apps/
│  ├─ web/                       # Shell: loader, UI chrome, mode selection
│  └─ api/                       # Portal bridge: events, progress, catalogue
├─ packages/
│  ├─ engine-core/               # scene, entities, actions, rules, missions, event bus
│  ├─ engine-xr/                 # WebXR sessions, input adapters, comfort, capability detect
│  ├─ engine-ui/                 # in-world + overlay UI components
│  ├─ engine-assess/             # assessment items, triggers, scoring
│  ├─ engine-telemetry/          # event envelope, batching, offline queue
│  ├─ engine-voice/              # (Phase 2) narration player, STT/LLM/TTS adapters, guide guardrails
│  ├─ curriculum/                # concept registry, board/class mapping
│  ├─ schema/                    # manifest + event schemas (Zod/JSON Schema)
│  └─ kits/
│     ├─ chemistry/
│     └─ biology/
├─ modules/
│  ├─ chem-atom-builder/         # module.json, assets/, rules/, assessments/
│  └─ bio-cell-explorer/         # (later)
├─ tools/
│  ├─ validate-manifests/
│  ├─ optimize-assets/
│  ├─ scaffold-module/
│  └─ generate-narration/        # (Phase 2) script -> TTS -> audio + captions
├─ docs/
│  ├─ adr/                       # architecture decision records
│  ├─ device-matrix.md
│  └─ pilot-plan.md
└─ .github/workflows/
```

## 12. Testing and quality

- **Unit:** rules, missions, manifest validation, concept registry, telemetry batching (target: most logic is testable with no GPU).
- **Integration:** module loads from manifest, mission completes through dispatched actions, assessment fires.
- **E2E (Playwright):** shell loads, mode fallback works, module starts in `screen` mode.
- **Device matrix (`docs/device-matrix.md`):** list of real devices tested (low/mid Android phones, an iPhone, a laptop, a headset), browser versions, AR support yes/no, fps measured, issues. Update every release.
- **XR emulator** for fast iteration; **real devices** before every release.
- **Accessibility:** captions/labels for audio, color-blind-safe palettes, text size controls, non-VR path to complete everything.
- **Content review:** a teacher reviews every module for scientific accuracy before release.

## 13. Roadmap

| Phase | Deliverable | Exit criteria |
|---|---|---|
| 0. Foundation | Monorepo, engine-core skeleton, manifest schema, CI | Empty module loads from a manifest in `screen` mode |
| 1. Atom Builder (screen) | Full atom module in 3D screen mode, with missions and checks | A student completes all missions on a mid phone |
| 2. Audio + voice guide | 2a: scripted narration with captions. 2b: live voice guide that explains, answers, and helps navigate | Atom Builder fully completable muted; narration and guide work with guardrails; no API keys in the client |
| 3. XR modes | AR on phones, VR on a headset, capability detection, comfort features | Same module runs in all three modes; device matrix filled |
| 4. Portal link | Token auth, telemetry, concept-linked deep links | Portal question opens the right module; events visible in DB |
| 5. Pilot | One batch uses modules for a month vs a comparison batch | Compare concept-level test scores, usage, and feedback |
| 6. Cell module | Second module using the same engine | Built mostly via manifest + kit, without engine changes |
| 7+. Scale | Teacher authoring, shared classroom, richer AI tutor, more subjects | Each as a new package, no core rewrite |

Phase 2 and Phase 3 can swap order if AR/VR demos matter more than narration for the pilot. P0 and P1 stay free of audio features either way.

### Pilot success metrics (decide before the pilot starts)

- Usage: sessions per student, completion rate of missions.
- Learning: concept-level test score change vs comparison batch.
- Experience: comfort reports (nausea, eye strain), student and parent feedback.
- Technical: crash rate, load time, share of students able to use AR.

A negative or flat result is a valid outcome; it tells us what to change before scaling.

## 14. Working with AI agents (Claude Code etc.)

- `CLAUDE.md` at the root holds the rules in sections 2, 6.1 (dependency rule), and 6.6 (serializable state + actions), plus commands to build/test.
- `.claude/skills/` holds task-specific skills. Suggested set:
  - `scaffold-module` — generate a new module folder, manifest, rules stub, and tests.
  - `author-manifest` — write/validate `module.json` against the schema and the four-layer contract.
  - `optimize-assets` — run the glTF pipeline and enforce budgets.
  - `xr-input-mapping` — add/modify device adapters and keep the action vocabulary stable.
  - `perf-audit` — profile draw calls, memory, fps by tier; report against budgets.
  - `curriculum-align` — map content to concept IDs and board/class; flag gaps.
  - `telemetry-contract` — add events without breaking the envelope/versioning.
  - `comfort-review` — check a module against the comfort and session rules.
  - `narration-authoring` — (Phase 2) write lesson scripts and cues per concept, level, and language, in the academy's teaching voice.
  - `voice-guide-guardrails` — (Phase 2) review guide prompts, the action whitelist, and safety/privacy behaviour.
- Agents must: run lint, typecheck, unit tests, and manifest validation before declaring work done; never import against the dependency rule; record significant decisions in `docs/adr/`.

## 15. Privacy, safety, and compliance notes

- Collect the minimum: opaque student reference, module events, device tier. No names, contact details, camera frames, or voice recordings are stored.
- AR uses the camera only for on-device tracking; do not upload or record camera frames.
- Voice (Phase 2): do not store raw audio. The microphone is push-to-talk and requested only on a user gesture. Transcripts are off by default; if ever enabled for quality review, they are redacted and covered by parental consent. The guide must not ask for or keep personal information.
- Students are mostly minors. Get parental consent for any data collection and review India's data-protection requirements for children's data (the Digital Personal Data Protection regime) before the pilot, and confirm current rules rather than relying on this README.
- Follow manufacturer age guidance for headsets and keep sessions short and supervised.
- Third-party assets: verify licenses; keep attribution.

## 16. Getting started (Phase 0)

Prerequisites: Node.js (current LTS), pnpm, a recent Chrome, an AR-capable Android phone (for later phases).

```bash
# 1. install
pnpm install

# 2. run the shell in dev mode
pnpm --filter @mma/web dev

# 3. run unit tests
pnpm test

# 4. validate all module manifests
pnpm validate:manifests

# 5. typecheck + lint
pnpm typecheck && pnpm lint
```

WebXR needs HTTPS except on `localhost`. For on-device phone testing, use a local HTTPS tunnel or a dev certificate.

### First tasks (suggested order)

1. Initialize the monorepo, TypeScript config, lint, and CI.
2. Implement `packages/schema` (manifest + event schemas) with tests.
3. Implement `engine-core`: store, `dispatch(action)`, event bus, mission evaluator.
4. Implement the `chemistry` kit rules (element lookup, shell capacity, charge, stability) with unit tests, no 3D yet.
5. Build the `screen` mode scene: procedural nucleus + shells + draggable particles.
6. Wire missions and the first assessment items.
7. Reserve the Phase 2 hooks (section 6.7) without implementing audio.
8. Later: Phase 2 audio narration and voice guide, then Phase 3 capability detection and AR/VR sessions.

## 17. Decisions log (keep updated; move details to `docs/adr/`)

| Decision | Status |
|---|---|
| Browser/WebXR first, no native app in v0.1 | Decided |
| First module: Atom Builder | Decided |
| First depth level: Class 9-10, with 11-12 added later via `levels` | Proposed |
| Backend stack for API bridge | Open (reuse portal stack vs new Node service) |
| Final product name and domain path | Open |
| Concept-ID scheme shared with portal | Open (must be agreed before Phase 4) |
| Languages for UI text (English / Marathi / Hindi) | Open |
| Audio narration + voice guide scheduled as Phase 2, not P0/P1 | Decided |
| TTS / STT / LLM providers and cost per student-minute | Open (evaluate in Phase 2) |
| Voice languages and Indian-accent recognition quality | Open (test with real students) |
| Transcript retention for the voice guide | Open (default: none) |

## 18. License and credits

Proprietary — Math Maam Academy. Record third-party asset licenses in `assets/LICENSES.md`.