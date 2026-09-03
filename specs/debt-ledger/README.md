# debt-ledger — one owner per concept, repo-wide

A read-only audit at `08d8c5fe` (2026-09-02) found the codebase clean at the line
level (0 warnings, 0 clippy, 0 TODO) and heavy at the shape level: concepts with
two or more owners, god-modules fusing five to twelve responsibilities, and a
bespoke battle-renderer estate kept alive only as a lab exhibit. This spec
executes the audit in reviewable slices under the refactor-clean rules: promote
each concept to one home, delete the stale path in the same pass, prove it
through consumers. The findings live in [audit.md](audit.md); the readable
ledger in [visualizations/audit-ledger.html](visualizations/audit-ledger.html).

## Next Agent Prompt

**Status (2026-09-03):** slices 01, 15-19, 22-24, 28-31 plus 02, 03, 05, 20, 21, 25, 32 and 33 landed on main (21 of 34); lane C's own list is complete; lane W's own list is complete and it has taken the photoreal chain (integration
`bun run check` green after 15+28; typecheck + campaign tests + wasm rebuild
green after 29; slice 29 pixel-neutral — campaign-visual diff numbers identical
to main). In flight in lane worktrees `/Users/david/dev/game-wt/{r,w,s,c}`
(branches `debt-ledger/{r,w,s,c}`): 04 (R), 10 (W, resumed after a silent turn end), 26 follow-up (S — first pass moved ownership but left steer_soldiers/apply_separation/run_combat at 1,060/967/706 lines; sent back to finish the split at ≤300 lines per function, golden after each extraction), 06a (C). Slice 32 note: the first pass promoted sim to a production dependency of campaign to reach UnitClass; sent back — campaign owns option modifiers as contract::StatModifiers, sim applies them, game-wasm composes. Slice 01 notes: the seating tripwire now lives in `battle-seating` (three catalog maps; `generated-seed-7` was highland-vale under another name and was dropped) and shoots until the crowd has drawn; terrain builder invariants live in `web/tests/vitest/terrainFeatures.test.ts`; the render-graph static fixtures died with that route while `frame-shell` keeps its live fixture list. Codex
implements in the worktree; the orchestrator runs browser gates against the
lane's own dev server (`vite --port 5173+lane --strictPort`, `VERIFY_URL`),
commits, and merges to main. `choices.md` has a union merge driver.

**Incident (2026-09-03 03:20–06:35):** the Mac idle-slept twice and every Codex lane died mid-turn with no report (work preserved uncommitted in the worktrees). Lanes were resumed with `codex exec resume <id>` and `caffeinate -i -s` now holds the machine awake for the rest of the run; start it first if you resume this cold. Separately, Codex ends a turn silently (`task_complete`, no message, no `-o` file) at roughly the 60-minute mark even while awake; a watchdog (`scratchpad/codex/watchdog.sh`, state in `lane-state`) resumes any lane whose process is gone without a report. Slice 06a landed (both suns named, zero pixels); 06b runs on lane C.

**Pickup if resuming cold:** read each lane's `git status`; a dirty lane with
a `<lane>-<slice>.out` file in the session scratchpad is a finished Codex
pass awaiting review + commit; a dirty lane without one is mid-pass (check
`~/.codex/sessions` for a live session before relaunching).

**Baseline at HEAD (evidence ledger):** `bun run check` green once
`bun install --cwd web` restored the missing `node-web-audio-api` package
(environment, not code). `cargo test --workspace` green. **Pre-existing red:**
`cargo test -p sim --features force-trace --test force_trace` →
`force_trace_smoke_covers_expected_channels` panics "missing force channel
CorridorClamp" — the feature-gated file drifted from the channel set nobody
ran. Slice 23 treats that as pre-existing and fixes the drift only if the
fix is one line; otherwise records it.
**Pre-existing red (battle snapshots):** at HEAD on this machine (SwiftShader
default), `battle-smoke`, `banner-gallery`, `battle-3d-standards` fail their
committed baselines by 5–41 % (`battle-initial` 57688 px, `banner-gallery`
199319 px, `battle-standards-eye` 204743 px …). Static frames reproduce the
same pixel counts run to run; mid-battle frames (`battle-banner`,
`battle-manual`) vary by timing. **So for battle scenes the "no new reds"
contract is judged by pixel-count equality against a main-tree run of the
same scenes, not by PASS.** Campaign scenes pass. Non-snapshot checks pass.
Re-blessing these baselines is out of scope (repo-weight decision); a slice
that must move a battle baseline compares its diff numbers against main.
Also pre-existing under SwiftShader: `full-game-rendering-performance`'s
"perf campaign measures the normal raw-WebGPU campaign route" check (its
`perfStatsOk` clause), `battle-minimap` (`battle-minimap-world-dpr2` ≈89.9k px), `battle-overlays`
(`overlays/rings-close` 49302 px), `battle-input`'s freezeAtTick pixel-stability
check (22 bytes, intermittent, also on main),
and load-dependent screenshot timeouts in `battle-lod` / `banner-gallery`.

**Pick up here:** slice [01-lab-estate-routes](slices/01-lab-estate-routes.md).
It is the largest lever and it settles what survives, so every other renderer
slice waits on it. Lanes W, S and C do not depend on it and may start in
parallel in separate worktrees (see the lane table for file disjointness).

**Before you start any slice:**

1. Read this README end to end, then the slice file, then the audit record
   entries the slice cites. Run the slice's "must stay green" gates at HEAD
   first and record any red that already exists — the contract is "no new
   reds", never "make everything green". Memory says `campaign-save-load` and
   `campaign-visual` were red at HEAD after the debraid work; confirm.
2. `cargo test --workspace` never compiles `crates/sim/tests/force_trace.rs`
   (feature-gated). Any lane-S slice runs
   `cargo test -p sim --features force-trace --test force_trace` explicitly.
3. Never set `UPDATE_SHOTS=1` on a multi-scene script. Re-bless one scene at a
   time after `compare-screenshots` and `screenshot-critique`, and Read the new
   PNG.
4. Keep the choices ledger: every decision you make that this spec did not
   resolve goes into `choices.md` (audit-choices), not silently into code.

**Global TODO** (owning slice in brackets; tick as they land):

- [x] Lab estate routes, scenes, scripts, baselines gone [01]
- [x] Lab estate modules + HUD shims gone; rationale record written [02]
- [x] frameShell terrain/backdrop/marker pipelines gone; command type shrunk [03]
- [ ] Lab router one file per route; one wasm terrain-grid reader; scanners widened [04]
- [x] `noiseWgsl.ts` owns hash/vnoise/fbm [05]
- [ ] `CampaignEnvironment` owns campaign sun/haze (plumbing, then one sun) [06]
- [ ] Renderer sediment: env aliases, palette legacy anchor, rock colours, tree presets, dead exports, JS math [07]
- [ ] `growableVertexBuffer` + `cameraOnlyPipeline` own pass boilerplate [08]
- [ ] `mapPass.ts` split into surface/roads/sea-labels/label-layout owners [09]
- [ ] `battleWorld.ts` split: grass field + terrain build + orchestrator; dead options retired [10]
- [ ] Base/ring blade layers share one material per tier [11]
- [ ] `typedUniform<T>`; transition snapshot; stats stride off the frame [12]
- [ ] Battle renderer wrapper forwards `world.stats()`; mirrors deleted [13]
- [ ] Dispose measured; dispose written only on measured growth [14]
- [x] One test runner (vitest); loaders deleted [15]
- [x] `@packages/*` alias; 70 relative imports rewritten [16]
- [x] `SimClock`, `cameraKeyController`, `awaitRendererReady` shared [17]
- [x] Campaign builders → game-renderer; fixtures out of main.ts; one save owner [18]
- [x] Battle scene `enter()` split behind unchanged `__game/__cam/__ready` [19]
- [x] HUD store via `useSyncExternalStore`; one `useGraphicsSettings()` [20]
- [x] Scene boot helpers; orphan URL params deleted [21]
- [x] `Vec2::perp`, covered-files helper, `genmap/noise.rs` [22]
- [x] `Tracer` replaces 70 cfg blocks [23]
- [x] Dead knobs → constants; ignored probes and copied test helpers gone [24]
- [x] One `spawn(SpawnSpec)`; `Unit::files_bounds`; wrapper chains gone [25]
- [ ] `steer/` module, slot policy in unit.rs, separation owners [26]
- [ ] `Unit::bound_radius()`; pins re-verified per consumer [27]
- [x] Campaign golden pin [28]
- [x] `road_levels` gone end to end [29]
- [x] One flood, one Dijkstra, one partial-edge cost [30]
- [x] `Army::new`, one cost shape, one field-dims owner, dead knobs, test helpers [31]
- [x] game-wasm thin: stat resolution, manifest, class table in the crates that own them [32]
- [x] mapgen `[lib]`, one wire schema, helpers single-owned, shipped migrations deleted [33]
- [ ] Slice-narrative comments replaced by invariants [34]
- [ ] close-spec this plan

**Before ending your pass:** update this section (status, date, next pickup,
blockers), tick the TODO, append to `choices.md`, and run `change-report` if any
test or baseline moved.

## Decisions (David, 2026-09-02)

1. **Archive = delete + rationale record.** The lab look estate leaves the live
   tree; slice 02 writes `specs/done/renderer-lab-exhibits.md` naming what was
   retired, why, and the last SHA where it lived (`08d8c5fe`). Git history is
   the archive. No relocation into specs, no feature flag.
2. **Scope.** All audit high-payoff items plus three cross-cutting ones: the
   slice-narrative comment sweep, a layer-dispose *investigation* (measure
   before writing any dispose), and the HUD store. **Out:** closing the seven
   idle open specs; any repo-weight / `.git` / LFS / baseline-pruning work.
3. **Pins may move** for bound-radius and campaign-sun unification. Verify the
   mechanism first (memory: a first-principles fix that breaks a balance test
   may have exposed the test), then re-pin each moved test and re-bless each
   baseline individually.
4. **No compat, no migrations.** Hard cutovers. Three test runners collapse to
   vitest outright; `road_levels` is removed end to end; no transitional alias
   survives a slice boundary.

## Decisions (planning, with the alternative each rejected)

- **`render-graph` route and `renderGraph.ts` go.** Its skeleton pins bespoke
  battle pass ids that never shipped (`battleCrowd`, `battleTerrain`); the live
  phase/depth contract is `renderer-core/src/frameGraphContract.ts`, gated by the
  `frame-shell` route and `_renderer-contract.mjs`. *Alternative:* keep as a
  contract exhibit — rejected, a contract about passes that don't exist tests
  fiction.
- **`battle-ground-cue-depth` route and `groundCuePass.ts` go.** The
  `campaign-ui` gate row already asserts a production `world-decal` pass at
  depth `read` (`renderer-lab-routes.mjs:224-228`). *Alternative:* keep as the
  hostile-order decal fixture — rejected; `nested3d` + `world-camera` remain
  the hostile-order fixture, and decal depth is proven on the real selection
  pass.
- **Invariants pinned by doomed scenes are re-homed, not dropped.** The
  seating tripwire (`battle-terrain-elevation`) already exists on the
  production world's `stats().seating` and is asserted by
  `battle-photoreal-parity`; slice 01 widens that to the same four maps. The
  terrain builder invariants (`sealedEdges`, `featureCounts`, …) move to a
  CPU vitest over `terrainFeatures.ts`. Only then do the routes die.
- **`nested3d.ts`, `UnitCardsReact`, `photorealEarthDistance.ts` stay.** The
  audit listed them as lab-only; recon found live consumers (`world-camera`
  route, `card-bar` route + scene, `groundPass.ts` builder).
- **The grass focus ring stays; only the `meadowFocusRing` option goes.** It
  defaults ON in production. Draft A proposed deleting the ring; wrong.
- **Canonical campaign sun = the camera-uniform vector** `(-0.40,-0.28,0.87)`,
  because `sunDirection()` is the WGSL contract already spliced into every pass
  and the production skinned pipeline reads it today. Slice 06 lands the
  plumbing at zero pixels first, then the single vector with a non-blocking
  human checkpoint. *Alternative:* the pass literal `(-0.42,-0.34,0.84)`.
- **Files clamp = `(count/3).max(lower)`** (the rule at `sim.rs:644` and
  `set_files` `:823`, two of three sites and the runtime one). Tests that need
  a one-rank line re-pin individually. *Alternative:* parameterise the policy
  — rejected, that keeps two owners.
- **Campaign golden pin (slice 28) lands before any campaign behaviour slice.**
  `randomness.rs` only proves A==B; nothing pins absolute state.
- **Lane order.** Renderer slices wait on 01; W, S, C start in parallel. Within
  S, bound radius is last because it is the only slice allowed to move the sim
  golden hash, so every earlier slice proves itself a pure move by hash identity.

## Slice graph

Four lanes with disjoint files. Within a lane, order is dependency order.

| # | Slice | Lane | Depends on | Pixels / pins may move |
|---|---|---|---|---|
| 01 | lab-estate-routes | R | — | none; `battle-photoreal-parity` gains four-map seating baselines (new, not moved) |
| 02 | lab-estate-modules | R | 01 | none |
| 03 | frame-shell-lab-pipelines | R | 02 | none (campaign never drew them) |
| 04 | lab-router-routes | R | 03 | none |
| 05 | noise-wgsl | R | 03 | none (identical bodies) |
| 06 | campaign-environment | R | 05 | 06b: campaign + standards baselines, re-blessed individually |
| 07 | renderer-sediment | R | 02 | none |
| 08 | pass-primitives | R | 03 | none |
| 09 | map-pass-split | R | 08 | none |
| 10 | battle-world-split | R | 02 | none |
| 11 | blade-material-share | R | 10 | none expected; any diff stops the slice |
| 12 | blade-field-types | R | 10 | none |
| 13 | battle-renderer-wrapper | R | 10, 19 | none |
| 14 | dispose-measure | R | 10 | none |
| 15 | vitest-only | W | — | none |
| 16 | packages-alias | W | 15 | none |
| 17 | shared-shell-primitives | W | 15 | none |
| 18 | campaign-builders-home | W | 16, 17 | none |
| 19 | battle-scene-split | W | 17 | none |
| 20 | hud-store | W | 17 | none (HUD DOM untouched) |
| 21 | scene-boot-helpers | W | 19, 20 | none |
| 22 | sim-primitives | S | — | none (golden hash identical) |
| 23 | force-tracer | S | 22 | none |
| 24 | sim-knobs-and-probes | S | 23 | none |
| 25 | spawn-owner | S | 22 | named: frontage pins, campaign cavalry sidearm |
| 26 | steer-split | S | 23, 24 | none (golden identical per sub-slice) |
| 27 | bound-radius | S | 22 | golden + morale/cavalry pins, re-pinned individually |
| 28 | campaign-golden | C | — | pins a new hash |
| 29 | road-levels | C | 28 | none (`road_mult(1) == 1.0`) |
| 30 | campaign-traversal | C | 29 | none (visit order pinned first) |
| 31 | campaign-literals | C | 29 | none |
| 32 | wasm-thin | C | 31 | none |
| 33 | mapgen-owners | C | 31 | none (committed map byte-identical) |
| 34 | narrative-sweep | all | everything | none (comment-only hunks) |

Cross-lane file contacts: 13 touches `web/src/battle/renderer.ts` (lane W's 19
touches `battle/scene.ts` beside it — land 19 first); 29 touches
`web/src/campaign/{views,scene}.ts` (land after 18 or coordinate); 04 must widen
the scanner roots that 17 and 18 also rely on.

## Gate vocabulary

- **G0** — `bun run check` + `cargo test --workspace`. Every slice.
- **G-infra** — `scripts/test-infra` (golden hash `crates/sim/tests/golden.rs`).
- **G-mech / G-scn / G-bal** — `scripts/test-mechanics`, `scripts/test-scenarios`, `scripts/test-balance`.
- **G-ft** — `cargo test -p sim --features force-trace --test force_trace`.
- **G-wasm** — `bun run build:wasm`, mandatory before any scene after a Rust change.
- **G-verify** — `bun run --cwd web verify`; **G-verify-full** — `verify:full`.
- **G-camp** — `verify:campaign` + `scene:renderer:campaign`.
- **G-lab** — `scene:renderer` (includes `renderer-lab-routes`, whose source-regex checks are listed under Firewalls).
- **G-photo** — `VERIFY_GPU=1 node scene.mjs --full` filtered to `photoreal-* battle-genmap-* battle-map-style* battle-ground-turf battle-photoreal-parity`.
- **Re-bless protocol** — run the gate; open `web/shots/diff/<name>.png`; classify; for an intentional move run `compare-screenshots` (old baseline vs actual) then `screenshot-critique`; `UPDATE_SHOTS=1 … node scene.mjs <one scene>`; Read the new PNG.

## Invariants (the end state reads as designed today)

- Two renderers by design: battle = three.js WebGPU in `photoreal-renderer`,
  campaign = bespoke WGSL on `frameShell`. Not an invariant to "unify".
- A renderer-lab route exists only to pin a contract a production renderer
  honours. A pass with no production consumer is deleted, not exhibited.
- One camera WGSL, one noise WGSL, one environment owner per renderer, one
  sun direction per renderer.
- Battle CPU data-builders live in `game-renderer/src/battle` and are consumed
  by photoreal; their GPU halves do not exist.
- `window.__ready / __game / __cam / __campaign / __campaignReady /
  __rendererLabReady / __rendererLabStats` names and keys are the scene
  contract; internals move, names don't.
- `renderStats.*` (battle) and `stats().*` (campaign) keys read by scenes are
  frozen: add, never rename (list in slice 13 and 18).
- Sim: extractions never reorder an `f32` chain; the golden hash proves a pure
  move. Only slice 27 (and 25's named pins) may move it.
- Campaign: traversal visit order is deterministic and pinned by slice 28.
- One test runner in `web`; one import alias for `packages/*`.
- History lives in `specs/`; code comments state invariants, not slice diaries.

## Firewalls (all slices)

- Never edit `crates/sim/tests/golden.rs::EXPECTED` outside slices 25 and 27.
- Never fix a balance pin by changing physics or a tunable default (tweak-mechanics).
- Never change a numeric literal (colour, sun, fbm weights, camera limits) in a slice whose gate is "pixels identical".
- `renderer-lab-routes.mjs` and `_renderer-contract.mjs` scan sources by regex and path: `struct Camera {` only in `cameraWgsl.ts`; `.createShaderModule(` only in `compileShader.ts`; the five campaign pass classes and their `draw(pass: WorldRenderPass|OverlayRenderPass)` signatures must stay in `mapPass.ts`, `entityPass.ts`, `sceneryPass.ts`, `selectionPass.ts`, `atmospherePass.ts`, `territoryPass.ts`; `.ready.then(` without `.catch(` is a footgun in the scanned roots. Edit those checks only to widen roots (slice 04) or to delete rows for deleted routes (01).
- Lane R never touches `crates/`; lane S never touches `web/` or `packages/`.
- Out of scope, do not touch: the seven idle open specs, repo weight, the ≤5 Hz HUD firewall (shape changes, cadence stays), the hand-authored gazetteers, `terrain.rs:426` tint sentinel, the two campaign time scales, `value_per_soldier` decoupling, `rel_at_war` borrow-split, `in_rollout` skips, flat-float wasm layouts.

## Known unknowns (resolved inside the named slice by measurement)

- Whether photoreal's `renderer.dispose()` already tears down backend buffers (14).
- Whether `horizonPass.ts:30 HAZE` feeds the CPU layout builder photoreal reads (06a measures; if read, it joins the haze owner and any pixel move is named).
- Whether `frame-shell`'s `atmosphere` stat depends on the terrain backdrop pipeline (03).
- Cost of the blade-field CPU stats stride before/after moving it to rebuild time (12).
- Whether the `-auto` campaign save slot has any reader (18: none found; delete).

## Found during planning, deferred (not in this spec)

- `photoreal-renderer/src/battle/impostorLayer.ts:47` carries an x/y-swapped sun literal while every other photoreal layer takes the sun from `applyCivsimEnvironment`. One visual variable on impostors; its own slice when someone wants it.
- `web/src/main.ts:474` lowercases `?map=` then compares raw.
- The two ring TRANSITION checks in `battle-perf-30k` are red at HEAD (meadow-polish open item); unchanged by this spec.
- **The default mapgen bake is broken at HEAD.** With today's ORBIS/Natural Earth inputs (`crates/mapgen/data/fetch.sh`; the geography-regions file only downloads intact via the jsDelivr mirror), `cargo run -p mapgen --release` panics on main at the black-sea rim step (`faction cities` not an array on the in-progress map). The committed `web/public/data/campaign-map.json` is therefore not reproducible and stays the fixture; slice 33 was accepted on its test gates. Pipeline correctness with fresh inputs is its own follow-up.

## Review map

Every slice: `code-review` on the diff before commit; `change-report` whenever a
test or baseline moved; `codex review --uncommitted` for slices 06b, 25, 26,
27, 30 (the ones that can change behaviour). Visual slices name
`screenshot-critique` and `compare-screenshots` in their files. Human
checkpoints are non-blocking (preview-shots, ~5 min, then decide on evidence and
record it). When all 34 land, `close-spec` archives this folder.
