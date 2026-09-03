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
- slice 16 — preserve each package-relative suffix under `@packages/*`, including `src/`, `assets/`, and `bake/`; alternative map package names directly to `../packages/*/src`; why live consumers import the soldier card manifest and glTF baker outside `src`, so the source-only mapping cannot represent every package import with the one mandated alias.
- slice 16 — give renderer-lab a TypeScript config that extends the web config and inherits its alias; alternative duplicate the alias in an app-local resolver config; why renderer-lab is loaded by the web entry point and has no standalone Vite application, so inheritance keeps its editor/compiler resolver aligned with the actual web build.
- slice 17 — let `SimClock` own the freeze flag while each scene keeps its renderer-specific fixed-time effect; alternative keep freeze entirely in the battle loop; why freeze is a clock-stopping state in both scenes, while `fixedTime` and frozen visual effects are renderer concerns rather than clock behavior.
- slice 18 — put entity geometry, shared visibility/occupancy, markers, and road carts in `entityFrame.ts`; city/army/faction label composition in `labels.ts`; and static/dynamic prop selection in `scenery.ts`; alternative split every helper by output type into more modules; why these three homes preserve the coupled anchor and visibility rules within the builder that uses them while leaving the renderer as orchestration.
- slice 18 — define renderer-facing structural inputs in `entityFrame.ts` and pass the frontend-owned controlled-stage and climate decisions into the pure builders; alternative import `web/src/campaign` types and policies back into `game-renderer`; why the renderer package must not depend on the application that consumes it.
- slice 18 — single-own the campaign-builder hash and renderer timing rounding in `game-renderer/src/math.ts`, and the cross-renderer selection colour in `game-renderer/src/overlays.ts`; alternative keep these helpers under `web/src/shared`; why the moved package builders and both production renderers consume them, so their natural dependency direction is package to web.
- slice 18 — snapshot the keys returned by the real `stats()` method using inert pass doubles; alternative export and snapshot a separate key constant; why a parallel list could stay green while the published runtime object drifted.
- slice 18 — move `Allegiance`, `ArmyView`, and `CityView` to the campaign builder owner and delete the now-unused `campaign/status.ts`; alternative leave web-owned duplicate protocol shapes beside the moved builders; why renderer inputs that cross the package boundary need one declaration and the hard cutover forbids a dead compatibility home.
- slice 19 — build the debug API from the battle owners' methods around the shared runtime handle; alternative keep independent debug closures over the raw scene state; why the consumer contract then exercises the same freeze, order, minimap, and HUD paths as production input instead of creating parallel behavior.
- slice 19 — use `BattleWorld` only for game/memory, renderer/audio, camera rig, wasm readers, and lifecycle signal; put terrain upload, controls/selection, orders/tactical cues, crowd frames, unit presentation, and HUD/modals in separate owners; alternative turn the relocated scene body into one stateful `BattleRuntime` class; why the smaller capability owners keep policy and mutable state with the surface that consumes them while the loop only sequences a frame.
- slice 20 — keep the 60 Hz unit-card grid on its imperative handle while battle info, FPS, and toolbar state share the scene store; alternative route card paints through the same store; why card painting is a separate high-frequency firewall and React state would reconcile it unnecessarily.
- slice 20 — keep `getGraphicsSettings()` as a cloned read for imperative consumers and back `useGraphicsSettings()` with an internal cached snapshot; alternative return the cached object from `getGraphicsSettings()`; why existing non-React callers keep mutation isolation while `useSyncExternalStore` gets the stable identity it requires.
- slice 20 — cache each `useHudStore` selector result with `Object.is`; alternative subscribe every component to the full store snapshot; why unrelated HUD fields should not re-render a component whose selected value did not change.
- slice 21 — migrate repeated battle, campaign, and lab world boots while keeping direct navigation in flows that prepare storage, measure app-shell startup, or require per-DPR lab setup; alternative migrate every direct `goto` in the scene estate; why those unusual flows own meaningful work before readiness, but their ready polls can still consume the shared helper without hiding that setup.
- slice 21 — make `ready` wait on the frozen page-global boolean and let each scene assert richer renderer stats after boot; alternative accept a custom predicate per caller; why callback predicates would preserve many local definitions of ready instead of making `__ready`, `__campaignReady`, and `__rendererLabReady` the single scene contract.
- slice 21 — delete the retired `gfx=` probe branches with their orphan parameters; alternative remove only `gfx=` and keep duplicate boots of the same worlds; why an identical second world would test no distinct behavior and would violate the one-world-many-measurements scene rule.
- slice 21 — (orchestrator fixup) the shared battle boots (`battleReal`, `battleDuel`, `battle5v5`) now wait on `battleRendererReady` — renderer reports ready and every soldier uploaded — the predicate the migrated scenes used inline; alternative wait on `__ready` alone as the pre-slice helpers did; why a harness must not get easier by accident: a boot that returns before the crowd is uploaded lets a scene freeze or shoot a half-built frame.
