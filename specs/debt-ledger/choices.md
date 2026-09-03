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
- slice 17 — let `SimClock` own the freeze flag while each scene keeps its renderer-specific fixed-time effect; alternative keep freeze entirely in the battle loop; why freeze is a clock-stopping state in both scenes, while `fixedTime` and frozen visual effects are renderer concerns rather than clock behavior.
- slice 01 — re-home the four-map seating contract in a dedicated production `battle-seating` scene; alternative extend `battle-photoreal-parity`; why the focused gate keeps terrain seating coverage independent of parity's full-world overlay and performance contract.
- slice 01 — classify `water-coastal` and `water-open-sea` as bespoke lab-renderer pixel coverage and delete them; alternative re-home shared water math beside `photorealSea.test.ts`; why both scenes measured the doomed `battle-terrain-3d` GPU plane while surviving photoreal sea scenes and tests already own production water behavior.
- slice 01 — (orchestrator fixup) dropped `generated-seed-7` from the seating scene: the catalog generates highland-vale from seed 7, so the two baselines were byte-identical (as the old elevation baselines already were); alternative keep both names; why one owner per fixture — a duplicate gate tests nothing twice.
- slice 18 — put entity geometry, shared visibility/occupancy, markers, and road carts in `entityFrame.ts`; city/army/faction label composition in `labels.ts`; and static/dynamic prop selection in `scenery.ts`; alternative split every helper by output type into more modules; why these three homes preserve the coupled anchor and visibility rules within the builder that uses them while leaving the renderer as orchestration.
- slice 18 — define renderer-facing structural inputs in `entityFrame.ts` and pass the frontend-owned controlled-stage and climate decisions into the pure builders; alternative import `web/src/campaign` types and policies back into `game-renderer`; why the renderer package must not depend on the application that consumes it.
- slice 18 — single-own the campaign-builder hash and renderer timing rounding in `game-renderer/src/math.ts`, and the cross-renderer selection colour in `game-renderer/src/overlays.ts`; alternative keep these helpers under `web/src/shared`; why the moved package builders and both production renderers consume them, so their natural dependency direction is package to web.
- slice 18 — snapshot the keys returned by the real `stats()` method using inert pass doubles; alternative export and snapshot a separate key constant; why a parallel list could stay green while the published runtime object drifted.
- slice 18 — move `Allegiance`, `ArmyView`, and `CityView` to the campaign builder owner and delete the now-unused `campaign/status.ts`; alternative leave web-owned duplicate protocol shapes beside the moved builders; why renderer inputs that cross the package boundary need one declaration and the hard cutover forbids a dead compatibility home.
- slice 31 — use a `Cost` enum with one resolved-input `per_soldier_milligold` lookup shared by campaign-state wrappers and battle estimation; alternative keep three functions over one lookup table; why the estimator has a unit-type id but no campaign state, and the enum seam centralizes option lookup, fallbacks, and value derivation without inventing state it does not have.
- slice 31 — make `Encounter::new` take the two side-specific preparation times as `[attacker, defender]` and own encounter-id allocation plus the campaign RNG seed draw; alternative pass two preparation arguments and leave id/seed bookkeeping at each caller; why both creation paths require the same ordered pair and state mutations, and centralizing the whole creation sequence removes the duplicated path while preserving draw order.
- slice 23 — `Tracer::record` accepts an optional caller-supplied `before`, using `None` for a ready delta and `Some(before)` for a capped before/after sample; alternative separate `record_delta` and `cap` methods; why one instrumentation method meets the slice contract while retaining the existing vectors and explicit `pre`/`post` cap diagnostics without inferring cap semantics from a channel or tag.
- slice 24 — `weave_shots` includes `tests/common` by path and consumes its shared weave perturbations; alternative expose a `sim::testkit` module behind the `shots` feature; why the geometry remains test-owned and the production crate API does not gain helpers used only by tests and the review-only shot tool.
