# debt-ledger — choices ledger

Decisions implementing agents made that the spec did not resolve. One entry
per decision: slice, what was decided, the alternative, why. Reviewed with
audit-choices before close-spec.

## Planning (2026-09-02)

- **Archive semantics** — delete + rationale record; alternatives "move
  source into specs/done/assets" and "keep behind a lab-only flag" rejected
  by David.
- **Scope** — slice-narrative sweep, dispose investigation, HUD store in;
  closing the seven idle specs and any repo-weight/.git work out (David).
- **Pins** — may move for bound radius and campaign sun; re-bless
  individually (David).
- **Compat** — none anywhere (David).
- Planning-time resolutions with their alternatives are in README →
  "Decisions (planning)".

## Implementation

_(append below, newest last)_

- slice 15 — select Vitest's node environment with per-file directives for
  DOM-free suites; alternative environment globs in the shared config; why
  Vitest 4 no longer exposes `environmentMatchGlobs`, while file-local
  directives keep each suite's runtime requirement explicit.
- slice 15 — retain the `src/**/*.test.ui.ts` include alongside the slice's
  broader globs; alternative follow the listed globs literally and run 27
  files; why the verification contract requires the HEAD-equivalent 30 files
  and the listed `src/**/*.test.{ts,tsx,mjs}` glob does not match `.test.ui.ts`.
- slice 15 — (orchestrator fixup) replaced Codex's hand-written `web/tests/test-types.d.ts` (module shims for node:assert, node:fs, node:path, pngjs, node-web-audio-api) with the published `@types/node` and `@types/pngjs` dev dependencies; alternative keep the shim; why refactor-clean's first gate — the platform already provides these types, a hand-rolled copy drifts.
- slice 15 — kept `web/scenes/battle/turf-telemetry-lib.d.ts` as the typed face of the `.mjs` telemetry lib the scene runner needs as plain JS; alternative convert the lib to TS; why scene.mjs runs node without a TS loader, so the JS module must stay and a sibling declaration is the standard TS shape for it.
