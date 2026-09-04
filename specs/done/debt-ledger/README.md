# debt-ledger — one owner per concept, repo-wide (closed 2026-09-03)

## What shipped and why

A read-only audit at `08d8c5fe` (2026-09-02) found the codebase clean at the
line level (0 build warnings, 0 TODO; clippy carried 12 pre-existing
`approx_constant` errors in sim) and heavy at the shape level:
concepts with two or more owners, god-modules fusing five to twelve
responsibilities, and a bespoke battle-renderer estate kept alive only as a
lab exhibit. Thirty-four slices, run in four parallel lanes over one day with
Codex implementing and Claude orchestrating, moved every audited concept to one
home and deleted the stale path in the same pass. The findings that drove it
are in [audit.md](audit.md) (with the corrections recon made to them) and the
readable ledger in [visualizations/audit-ledger.html](visualizations/audit-ledger.html);
every decision the run made where the plan was silent is in
[choices.md](choices.md), which is the review surface for the run.

The run removed about 7,900 lines of production code net and 3,500 lines of
test harness, and added about 3,000 lines of spec (this record and the audit).
The full table is at the end.

## The reason it took this shape

- **Delete, don't relocate.** The lab look estate (the bespoke battle passes
  that only renderer-lab still drew) was deleted outright with a rationale
  record at [renderer-lab-exhibits.md](../renderer-lab-exhibits.md); git
  history at `08d8c5fe` is the archive. Moving source into `specs/` or hiding
  it behind a flag would have kept two owners of the battle look alive.
- **Hard cutovers.** No compatibility alias survives a slice boundary: three
  web test runners collapsed to vitest, `road_levels` left end to end, the
  `applyCampaignEnvironment` / `applyBattleEnvironment` setters went with the
  values they duplicated.
- **Prove moves by identity, not by tests passing.** Every sim extraction had
  to keep the golden hash byte-identical; only the bound-radius slice was
  allowed to move it (it did not, in the end). Every renderer move had to keep
  the campaign, lab and photoreal snapshots at zero new differing pixels
  against a main-tree run of the same scenes — SwiftShader baselines that were
  already red at HEAD are judged by pixel-count equality, never by PASS.
- **Measure before writing cleanup.** The layer-dispose slice was an
  investigation first; dispose code exists only because ten hardware cycles
  showed 926 MB of monotonic growth on a path production really takes.
- **Pins may move, but each one on evidence.** The two balance pins the bound
  radius touched were re-derived from mechanism (a one-value survivor floor)
  and from a forty-seed measurement (a directional counter that nine seeds
  could not decide).

## Principles and invariants (what must stay true)

- Two renderers by design: battle = three.js WebGPU/TSL in
  `packages/photoreal-renderer`, campaign = bespoke WGSL on
  `renderer-core/src/frameShell.ts`. Not an invariant to "unify".
- A renderer-lab route exists only to pin a contract a production renderer
  honours. A pass with no production consumer is deleted, not exhibited
  (`web/scenes/system/renderer-lab-routes.mjs` checks the sources: the four
  listed depth-writing world files build through `cameraOnlyPipeline` — a
  new one must be added to that list — the camera struct lives only in
  `cameraWgsl.ts` across the renderer and web roots, and shader modules
  compile only through `compileShader.ts`).
- One camera WGSL (`renderer-core/src/cameraWgsl.ts`), one noise WGSL
  (`renderer-core/src/noiseWgsl.ts`, spliced by the campaign atmosphere and
  map passes and the lab ground shader), one scalar-math owner
  (`renderer-core/src/math.ts`), one environment and one sun per renderer:
  campaign takes `CAMPAIGN_ENVIRONMENT` (`game-renderer/src/campaign/environment.ts`)
  through the frame shell's required `sun` option; the two lit campaign
  passes (`entityPass`, `sceneryPass`) read `sunDirection()` from the camera
  WGSL, the map pass lights from its baked light texture, and the shell has
  no `setSun` — the option is the only way the value enters.
- Battle CPU data builders live in `game-renderer/src/battle` and are consumed
  by photoreal; their GPU halves do not exist.
- `window.__ready / __game / __cam / __campaign / __campaignReady /
  __rendererLabReady / __rendererLabStats` and the `renderStats.*` (battle) and
  `stats().*` (campaign) keys scenes read are the scene contract: add, never
  rename. `web/src/campaign/renderer.test.ts` snapshots the campaign keys
  through the real `stats()`.
- Sim: extractions never reorder an `f32` chain; `crates/sim/tests/golden.rs`
  proves a pure move. `Unit::bound_radius()` is the one circumscribing
  radius; `Unit::frame_extent()` is the placement extent, a different concept.
  Every sim function is at or under 300 lines (measured at close: the
  largest is `steer_soldiers` at 298; no gate pins it — a review check).
- Campaign: `crates/campaign/tests/golden.rs` pins absolute state after 400
  ticks; campaign depends on `contract`, never on `sim` (`contract::StatModifiers`
  is the seam; `game-wasm` composes).
- One test runner in `web` (vitest, per-file environment directives); one
  import alias (`@packages/*`) that preserves each package's sub-paths.
- Every battle layer implements `dispose()`; `web/scenes/system/renderer-lifecycle.mjs`
  is the lifetime gate, run on a hardware adapter by
  `bun run --cwd web scene:lifecycle:hardware` (SwiftShader memory numbers
  mean nothing).
- History lives in `specs/`; code comments state invariants. The sweep's
  grep is the check (`grep -rniE "slice [0-9]|\(slice|slice-[0-9]" crates
  packages web/src apps --include='*.rs' --include='*.ts' --include='*.tsx'
  --include='*.mjs'`, zero at close apart from identifiers such as `slices`);
  no gate runs it, so it is a review check.

## Pointers into the code (the owners this run created)

- Renderer core: `renderer-core/src/{gpuBuffers.ts (GrowableBuffer,
  makeVertexBuffer, makeIndexBuffer), pipelineContracts.ts (cameraOnlyPipeline),
  noiseWgsl.ts, math.ts, skinnedPipeline.ts, soldierShadowPass.ts}`.
- Campaign renderer: `game-renderer/src/campaign/{environment.ts, entityFrame.ts,
  labels.ts, scenery.ts, mapPass.ts (the five pass classes only), mapSurface.ts,
  roadGeometry.ts, seaLabels.ts, labelLayout.ts}`; `game-renderer/src/overlays.ts`
  (SELECTION_GREEN); `game-renderer/src/battle/terrainGrid.ts` (readBattleTerrainGrid).
- Photoreal battle: `photoreal-renderer/src/battle/{battleWorld.ts (BattleTerrainOptions,
  debugBlockTriangles, dispose), battleGrassField.ts, battleTerrainBuild.ts,
  bladeFieldLayer.ts (BladeFieldMaterialSet, BladeFieldTransitionUniforms),
  battleTsl.ts (typedUniform)}`; `web/src/battle/renderer.ts` keeps only
  production policy above the world.
- Renderer lab: `apps/renderer-lab/src/{router.ts, labShell.ts
  (createConfiguredShell for battle light, createCampaignShell for the campaign
  sun), labFixtures.ts, labCampaign.ts, labPhotoreal.ts, routes/*.ts}`.
- Web: `web/src/shared/{simClock.ts, cameraKeys.ts, rendererReady.ts}`,
  `web/src/ui/hudStore.ts`, `web/src/campaign/{save.ts, fixtures.ts}`,
  `web/src/battle/{battleWorld, battleLoop, battleTerrain, battleControls,
  battleOrders, battleCrowd, battleUnitPresentation, battleHudBridge,
  battleMinimap, battleFreeze, battleDebugApi}.ts`, `web/scenes/worlds.mjs`
  (battleReal/battleDuel/battle5v5/campaign/labRoute/ready boots),
  `web/scenes/battle/battle-seating.mjs`, `web/tests/vitest/terrainFeatures.test.ts`,
  `web/tests/gpuBuffers.test.ts`, `web/src/shared/cameraKeys.test.ts`,
  `web/src/campaign/speeds.ts`.
- Sim: `crates/sim/src/{math.rs (Vec2::perp), genmap/noise.rs, force_trace.rs
  (Tracer), sim.rs (SpawnSpec, spawn), unit.rs (bound_radius, frame_extent,
  files_bounds, reform_slots), steer/, separation/, combat/}`; test harness
  `crates/sim/tests/common/{mod.rs (block: parametrised spawn-and-settle),
  settle.rs (stock_block: the 120-man probe)}`.
- Campaign and map: `crates/contract/src/{lib.rs (StatModifiers, CLASS_SPECS),
  mapjson.rs}`, `crates/campaign/src/{pathfind.rs (Visited::flood, dijkstra),
  units.rs}`, `crates/campaign/tests/{golden.rs, fixtures/test-map.json}`,
  `crates/mapgen/src/{gazetteer, descope, landmass, reconnect, road_measure,
  map_io, debraid}.rs`.

## Where the build diverged from the plan

- **The campaign sun needed one setter, not one value.** Slice 06 made the
  environment the owner, but left both a constructor option and an "apply"
  helper. When the lab router split (slice 04) landed before 06b, the merge
  put the campaign helper before the battle one and every campaign lab mesh
  rendered under the golden-hour battle sun. The helpers are gone; a value
  with one setter cannot be applied in the wrong order.
- **A source-scan gate can be satisfied by a comment.** Slice 08 moved the
  raw pipeline contracts into `cameraOnlyPipeline`; the lab gate grepped the
  old names, and the implementer kept it green with a comment naming them.
  The gate now checks the owner. Read delegated "gate PASS" claims against
  what the gate actually greps.
- **Slice 32's first pass inverted a dependency.** To reach `UnitClass`, it
  made sim a production dependency of campaign; the second pass put the
  policy in `contract::StatModifiers` and let sim apply it.
- **Slice 26 took three follow-ups**, the last on the orchestrator's own
  mis-measurement (a size scan that missed `pub(super)` functions). Measure
  with the tool that judges.
- **Slice 14's decision rule activated.** The plan expected "flat → no
  code"; the probe found 926 MB of growth and the production trigger (renderer
  recreated when environment or graphics settings change). Dispose code is
  production code, not probe support.
- **Slice 27 moved no hash.** The plan reserved the golden move for it; the
  radius unification changed engagement thresholds without touching the
  golden scenario, and only one battle snapshot moved (`battle-ai`, 23 px).
- **The narrative sweep over-swept once.** "bridge" is a map-gen concept
  (roads bridge water dips; ops paint bridges over rivers) and a module name
  (`cameraBridge`); the first pass reworded them and was reverted. A word is
  swept only where it narrates.
- **The default mapgen bake is broken at HEAD** with today's upstream inputs
  (the black-sea rim step panics on "faction cities"; the geography file only
  downloads intact via the jsDelivr mirror). Slice 33's "re-bake is
  byte-identical" gate became the committed-map test suites. Fixing the bake
  is its own job.
- **Two regressions surfaced only in the whole-spec review** (`codex review
  --base`): the shared camera-key controller accepted a wheel from any canvas,
  so the HUD minimap zoomed the battlefield (now bound to the scene canvas),
  and the campaign date readout's speed labels drifted from the top bar's
  (now one owner, `web/src/campaign/speeds.ts`). Per-slice gates cannot see a
  behaviour no scene scrolls or reads; the branch-level review can.
- **Codex runs die silently** on Mac idle-sleep, at roughly the 60-minute
  turn mark, and when the backend stream disconnects. `caffeinate -i -s` plus
  a resume watchdog recovered every lane with no work lost. The recipe: start
  `caffeinate -i -s` first; poll each lane's process; when it is gone without
  its report file, `codex exec resume <session-id> - < continue.prompt` from
  the worktree (the agent continues rather than restarts).

## Dead ends (do not re-walk)

- Keeping the lab estate behind a flag or relocated under `specs/` — two
  owners of the battle look.
- Deleting the grass focus ring as dead code — it is production, default ON;
  only the `meadowFocusRing` option was scaffolding.
- Re-pinning a one-seed balance flip as a "near-peer band" — a band that
  accepts either winner also passes a reversed counter; measure over enough
  seeds and pin the direction.
- Unifying the scenery shade hash with the shared `hash2` — it truncates each
  axis before mixing and the blessed scenery baselines depend on it; it is
  `shadeHash`, documented, on purpose.
- Making ambient-audio depend on renderer-core for a clamp — it keeps its own
  `scalar.ts`; two owners across an unrelated package boundary is the right
  shape.

## Baseline state the run inherited (still true at close)

Under SwiftShader on the orchestrator's machine, these are red at HEAD and were
red before the run; every slice was judged by pixel-count equality against a
main-tree run: `banner-gallery` (199319 / 354244 / 424815 / 392971 / 391959 /
381823 px), `battle-3d-standards` approach/eye (186025 / 204743),
`battle-camera-zoom` (209880), `battle-smoke` `battle-initial` (57688; `battle-banner`
and `battle-manual` vary by timing), `battle-minimap` (≈89.9k),
`battle-overlays` rings-close (49302), `battle-map-style` grass-close (181508 /
0 / 182553 and the legibility oracle), `battle-genmap-vista` golden/overcast
(vary run to run: 96751/80841, 98284/73940), `battle-photoreal-parity` (55472),
`full-game-rendering-performance`'s campaign `perfStatsOk`, `battle-input`'s
22-byte freeze drift, `battle-lod` screenshot timeouts, the force-trace smoke
test (missing `CorridorClamp`), and 12 clippy `approx_constant` errors in sim.
Re-blessing them was out of scope (repo-weight decision, David 2026-09-02).

## Found during the run, deferred

- `photoreal-renderer/src/battle/impostorLayer.ts` carries an x/y-swapped sun
  literal while every other photoreal layer takes the sun from the
  environment. One visual variable on impostors.
- `web/src/main.ts` lowercases `?map=` then compares raw.
- The ring engage/rebuild rAF-p95 checks in `battle-perf-30k` (hardware-only)
  are red at HEAD — the meadow-polish open item recorded in
  `specs/done/meadow-polish.md`.
- The mapgen bake above.

## Size of the run

Computed with `git diff --numstat cdb6b9e8^ HEAD` (the spec commit's parent to
close), code lines split by comment prefix; formatter reflow inside moved
files is counted, reflow of untouched files was excluded by never formatting
them.

| | added | deleted | net |
| --- | --- | --- | --- |
| Production code (excl. comments) | 21,904 | 29,846 | −7,942 |
| Comments | 1,924 | 3,032 | −1,108 |
| Tests / harness | 2,347 | 5,860 | −3,513 |
| Specs & docs | 2,959 | 4 | +2,955 |

Structural surfaces the run added: the campaign golden test
(`crates/campaign/tests/golden.rs`), the `renderer-lifecycle` hardware scene,
the `battle-seating` scene, the vitest `terrainFeatures` and `gpuBuffers`
seam tests, the `scene:lifecycle:hardware` script, the `@packages/*` alias in
`web/tsconfig.json` and the vite config, `web/.prettierignore` entries for
generated reports, and a union merge driver for `choices.md` in
`.gitattributes`. No new dependency of any kind, no endpoint, no config flag.
