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

- slice 28 — run exactly 400 ticks with commander AI disabled and two existing hostile armies placed on adjacent tiles of the committed map, then resolve the resulting battle through the campaign estimator; alternative run the whole map autonomously until contact; why the scripted contact exercises encounter and rout traversal deterministically in 0.02 s instead of depending on a slow, seed-sensitive commander search.
- slice 28 — hash the specified army movement and stance state, ordered city owners, faction treasuries, and every encounter payload plus `next_encounter_id`, with collection lengths and enum tags as delimiters; alternative hash serialized `CampaignState` wholesale; why the explicit projection pins the campaign behaviors the following slices may move without coupling the golden to unrelated save-schema fields.
- slice 28 — use campaign seed 7; alternative choose a new arbitrary fixed seed; why 7 is already the fixed-seed reference in the campaign determinism tests and also drives the scripted encounter seed.
- slice 28 — use the sim golden's word-wise FNV-1a convention and initial hash value; alternative introduce canonical byte-wise FNV-1a just for campaign; why matching the repository's existing golden makes float-bit and integer mixing consistent across both simulation crates.
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
- slice 29 — delete the parallel-route test and its single-use diamond-map fixture with the road-level behavior; alternative rebase the test on a tile-feature cost difference; why existing path tests already exercise feature-weighted route planning, while retaining a bespoke parallel fixture would preserve test-only code for a deleted production distinction.
- slice 22 — `covered_fighting_files` accepts the sim's native `alive: &[u8]`, `fighting: &[u8]`, and `soldier_slot: &[u32]` slices so extracting the duplicated loops preserves their dead-soldier filter exactly; alternative convert those arrays to the slice sketch's `&[bool]` and `&[usize]` three-argument signature; why conversion would allocate copies in two hot paths and omitting `alive` would change behavior because dead entries may retain a prior fighting flag.
- slice 16 — preserve each package-relative suffix under `@packages/*`, including `src/`, `assets/`, and `bake/`; alternative map package names directly to `../packages/*/src`; why live consumers import the soldier card manifest and glTF baker outside `src`, so the source-only mapping cannot represent every package import with the one mandated alias.
- slice 16 — give renderer-lab a TypeScript config that extends the web config and inherits its alias; alternative duplicate the alias in an app-local resolver config; why renderer-lab is loaded by the web entry point and has no standalone Vite application, so inheritance keeps its editor/compiler resolver aligned with the actual web build.
- slice 30 — name the flood callbacks `pass` and `visit` and return the location that requested `Stop`; alternative return a visit count with `can_enter` and `on_visit` callbacks; why stop-location semantics directly answer the early-exit consumers while depth remains available to the visit callback.
- slice 30 — (orchestrator note) the campaign `test_map()` literal moved to `crates/campaign/tests/fixtures/test-map.json` loaded via `include_str!`, so the lib seam test and `tests/common` share one fixture; alternative keep two inline copies; why one owner for the test map, and JSON is the wire format the real map already uses.
