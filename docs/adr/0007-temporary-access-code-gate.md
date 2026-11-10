# ADR 0007: Temporary access-code gate, student dashboard and routing

Status: Accepted (temporary; replaced by the Phase 4 portal token)

## Context

Until now the app opened straight into Atom Builder. We want a Web-view login,
then a dashboard of experiments (Physics, Chemistry, Biology), then the chosen
experiment. There is no backend or database yet, so real accounts are not possible.
The portal token in README 9.2 (a signed JWT with an opaque student id) is Phase 4.

Typical VR apps do not ask for a login inside the headset: identity comes from the
platform account or a pairing code, and WebXR apps sign in on a normal page before the
immersive session starts. Login here therefore lives only in the Web view; AR and VR
are entered from inside an experiment and reuse the page's signed-in state.

## Decision

- **Gate:** a list of access codes acts as the password; any name is accepted.
  Codes are stored only as PBKDF2-SHA256 hashes (salted, 120,000 iterations) in
  `apps/web/src/auth/access-codes.json`. The teacher keeps the plain list outside the repo
  and runs `pnpm generate:access-codes <file>` to refresh the hashes. `devHashes` holds
  test codes that only dev and test builds accept (`import.meta.env.DEV`).
- **This is a gate, not security.** Anything in the bundle can be read, and a short code
  can be guessed offline. The wrong-code lockout (5 tries, 30 s) lives in page memory and
  only slows casual guessing.
- **Session:** `{username, studentRef, signedInAt, expiresAt}` in `localStorage`, 12 hours.
  `studentRef` is random (`stu_<uuid>`) and is the only id telemetry may use. The typed name
  stays on the device and never goes into telemetry (CLAUDE.md section 5).
- **Routing:** hash routes `#/login`, `#/dashboard`, `#/experiment/<module id>`, no router
  dependency. Signed-out visitors always land on login, including for direct experiment links.
  The developer-only `?narration-generator` tool is outside the gate.
- **Catalogue:** `apps/web/src/experiments.ts` lists experiments from module manifests
  (`@mma/chem-atom-builder/manifest`, a light export that skips the 3D code). Module code
  loads only when opened. Subjects without experiments show "Coming soon".
- **Modules stay independent of the app:** `mountAtomBuilder` takes an optional `onExit`
  callback for its "Experiments" button; the module never imports the app.
- **Tests:** the browser tests start signed in through a seeded `storageState`
  (`playwright.config.ts`, `e2e/fixtures.ts`); `e2e/auth.spec.ts` covers the login itself.

## Consequences

- Production builds accept no code until `hashes` is filled in with the teacher's real list.
- Rotating a leaked code means regenerating `access-codes.json` and redeploying.
- Phase 4 replaces `apps/web/src/auth/*` with the portal token exchange; the router, dashboard
  and catalogue stay. `Session.studentRef` is the value the token's opaque student id will fill.
- The student's name is shown only on this device and is not sent anywhere.
