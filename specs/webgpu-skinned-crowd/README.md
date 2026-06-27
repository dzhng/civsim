# WebGPU Game Port

## Goal

Port the entire browser game to a raw-WebGPU rendering architecture. The first
leg replaces battle's pose-swapped box soldiers with a GPU-owned skinned crowd
renderer; the full goal goes further: battle terrain/effects, campaign map,
campaign markers, menus, HUD/composition surfaces, verification harnesses,
performance gates, and production cutover all move onto the new WebGPU path.

This is a proper shared 3D engine port, not a painter-order approximation.
Battle and campaign both need the same foundational ability to place 3D objects
inside, behind, in front of, and on top of other 3D objects. A city standard
must be planted through the settlement volume and occluded by the roofs/walls
that stand in front of it; a future garrisoned army must be able to sit inside a
city volume with correct partial or full occlusion; battle soldiers, weapons,
shields, terrain props, buildings, projectiles, shadows, and selection markers
must share a real world-space/depth contract instead of relying on hand-authored
draw order.

The old Babylon/WebGL renderers are being removed as WebGPU reaches production
coverage. The plan is complete only when the shipped default game route can be
played without Babylon, Three, or the legacy 2D battle renderer.

## Acceptance Bar

Parity with the current game is the floor, not the finish line. The final
WebGPU game must preserve every normal player-facing flow that exists today:
menu boot, campaign play, campaign UI, save/load, campaign-to-battle handoff,
battle input, battle UI, screenshots, vibe timelines, and verification
scenarios.

Visual parity starts from the previous 3D model language, not from newly
invented flat stand-ins. The WebGPU renderer should port or faithfully recreate
the old towns/cities, trees, rocks, roads, terrain relief, army standards, and
detailed soldier model/animation silhouettes before pursuing alternate art
direction. Existing model screenshots, in-game model baselines, turntable
captures, and animation GIFs are migration references and must be used as
acceptance evidence. The concrete per-model and per-animation inventory is
tracked in `assets/MODEL_SCREENSHOT_GATES.md`.

Typography and map iconography are also part of the visual contract. The
previous campaign labels used deliberate Cinzel/Georgia styling plus small
semantic icons next to text, such as settlement houses and army figures. WebGPU
label rendering must preserve those fonts, halos, icon silhouettes, colors, and
label semantics before any alternate label treatment can be accepted.

The expected result is **better graphics and better performance** than the
current shipped renderer on the same scenes and hardware. Each late slice must
compare WebGPU against the current game with before/after screenshots and a
named-hardware performance report. A WebGPU surface is not accepted if it is
less readable, less playable, or slower than the current game unless the release
review records an explicit, temporary exception with an owner and removal test.
Those current-renderer captures are migration evidence only. After WebGPU passes
cutover, routine screenshots, vibe timelines, and verification baselines target
WebGPU alone, and the old captures are archived or deleted with the old renderer
paths.

Visual improvement means the battle and campaign should be plainly stronger
than today's renderer, not merely different: clearer unit silhouettes, richer
Bronze-Age Aegean lighting, better terrain/water/sky/haze/shadow composition,
more expressive skinned soldiers, sharper selection/order feedback, and a
campaign map whose labels, faction colors, roads, water, and markers remain
more legible at every review zoom.

Campaign parity includes the old renderer's camera perspective. Close campaign
views must not render as a flat orthographic rectangle: the terrain footprint
should project as a trapezoid, distant models should appear smaller, and roads,
labels, shadows, cities, armies, trees, rocks, and mountains must share the same
perspective projection. Selection rings are not screen-space UI circles; they
are ground-plane markers and must foreshorten with the terrain as if painted on
the world surface. The current WebGPU close-up remains blocked until this
projection gap is fixed and verified against the archived campaign-label-zoom
reference.

Depth correctness is part of parity, not polish. The renderer must support
depth-tested 3D passes, stable pass ordering, nested/interpenetrating model
fixtures, and deliberate overlay layers. Manual back-to-front mesh emission is
allowed only as a temporary scaffold for flat/impostor passes; it is not an
accepted solution for cities containing standards, garrisoned armies inside
cities, battle rank ordering, or any other true 3D composition.

Performance improvement means the same gameplay scenes run with lower median
and p95 frame time, lower CPU upload cost, stable memory, and more crowd/detail
headroom than the current renderer. Slice 24 records the baseline first, then
sets the final budgets from real hardware rather than headless SwiftShader
numbers.

## Direction

The runtime target is **raw WebGPU**, not Babylon or Three.js. Babylon/Three may
be used for import tooling, previews, asset inspection, or temporary visual
reference, but the production game renderer should own its buffers, bind groups,
compute passes, render passes, render graph, resource lifetime, and screenshot
timing directly.

The first playable checkpoint is a tiny raw WebGPU route that renders stable
terrain plus simple instanced soldier markers. No skeletal animation, real art,
or full battle integration is allowed to block that checkpoint. After that, the
plan climbs toward full-game parity slice by slice instead of stopping at crowd
rendering.

## App Shape

This repo is a monorepo; use that shape. Prefer a fresh WebGPU lab/workbench
package over more query-param modes in the current game shell. Every slice
should get a first-class route that can be opened, tested, screenshotted, and
handed to a human:

```text
/webgpu/device
/webgpu/frame-shell
/webgpu/assets
/webgpu/crowd-data
/webgpu/animation-state
/webgpu/skinned-soldier
/webgpu/skinned-crowd
/webgpu/skinned-depth
/webgpu/lod
/webgpu/battle
/webgpu/perf
/webgpu/campaign
/webgpu/render-graph
/webgpu/world-camera
/webgpu/battle-terrain
/webgpu/battle-ui
/webgpu/battle-input
/webgpu/battle-live
/webgpu/campaign-map
/webgpu/campaign-ui
/webgpu/menu
/webgpu/full-game
/webgpu/cutover
```

Proposed package layout:

```text
apps/webgpu-lab/              # fresh browser app, routes under /webgpu/...
packages/webgpu-core/         # raw WebGPU device, buffers, pipelines, helpers
packages/soldier-assets/      # manifest schema, validation, placeholders, bake IO
packages/crowd-runtime/       # crowd instance data, animation state, LOD policy
packages/game-renderer/        # full-game WebGPU render graph and scene adapters
web/                          # existing game app; imports packages when ready
```

The lab can still import shared game code from `web/src/shared`, `web/src/battle`,
and the wasm adapter when a slice needs production data. The point is to avoid a
pile of opaque `?test=` flags and make each test surface feel like a small app
with clear package ownership.

## Human Review

Open the roadmap:

```text
specs/webgpu-skinned-crowd/visualizations/roadmap.html
```

Every implementation slice should add or update a browser-playable surface:
a lab route, workbench page, scenario harness, turntable, or visual report.
The plan optimizes for fast iteration: build the smallest thing that answers the
next useful question, then lock it with tests and screenshots.

## Binding Decisions

- **Raw WebGPU runtime.** Frameworks are optional tooling, not the renderer
  architecture.
- **Shared depth-tested 3D foundation.** `packages/webgpu-core` and
  `packages/game-renderer` must expose a render graph with depth attachments,
  clear depth/write/compare policy, and pass compatibility checks before
  campaign/battle model tweaks can be accepted as final. If adding depth would
  require changing every pipeline in a pass, split the pass instead of slipping
  a one-off flag into the current flat frame shell.
- **Named live frame phases.** The raw frame shell exposes `background`,
  `world`, and `overlay` phases rather than generic draw callbacks. Depth-
  sensitive scenarios must assert that true 3D routes execute the `world-depth`
  phase with a `depth24plus` attachment, while labels, minimaps, HUD, and other
  deliberate overlays stay in a later non-depth phase. Every `world-depth` pass
  must declare its depth mode: `read` for decals/roads/ground cues, `read-write`
  for opaque/skinned/nested world geometry, and `write` only for a dedicated
  depth fill.
- **One world/camera/depth contract.** Campaign and battle model, terrain,
  decal, shadow, projectile, picking, and label-anchor code must share the same
  packed camera uniform and projection semantics. A pass can opt into a named
  overlay layer, but it cannot keep private projection/depth math as a way to
  make nested 3D objects appear correct.
- **Placeholders unblock everything.** Every renderer/art slice must ship with
  generated placeholder assets first: skeletons, meshes, clips, textures,
  faction masks, LODs, impostors, and manifests.
- **Real art is a replacement lane.** Real assets flow through the same asset
  workbench and validation contract. Missing art never blocks renderer slices.
- **Asset workbench is early.** Build a self-contained asset app/workbench near
  the start so humans and artists can upload/sample/preview/validate assets in
  3D while renderer work continues.
- **Tests are not enough.** Each visual/interactive slice needs something the
  human can run, inspect, screenshot, and critique.
- **Parity is the floor.** Production cutover requires proof that the WebGPU
  game matches current behavior and beats current graphics/performance, or that
  any exception is explicitly accepted with a named owner and follow-up test.
- **Reuse the old 3D model language first.** Babylon/legacy renderer code is
  being retired as runtime architecture, but its city/town, tree, road, terrain,
  soldier, and animation outputs remain the reference visual contract until the
  WebGPU port matches or intentionally improves them with evidence.
- **Preserve fonts and icons.** Campaign labels must keep the old readable
  Cinzel/Georgia typography, halos, faction/allegiance-colored icon markers,
  and text/icon pairings. Bare text without the associated house/army icon is a
  regression unless a later review explicitly accepts a replacement.
- **Whole-game cutover is explicit.** A WebGPU lab surface is not production.
  The plan must reach `/` and normal battle/campaign flows, then delete or
  quarantine the old renderers after parity is verified.
- **Screenshot migration is one-way.** Current-renderer screenshots are
  migration archive inputs for the cutover review, not a second baseline suite.
  Once the final WebGPU comparison is accepted, routine screenshots, vibe
  timelines, scenario baselines, and new visual coverage must target WebGPU
  only. If a later question needs historical comparison, use the archived
  cutover evidence or add a new WebGPU baseline for the shipped game. Current
  renderer screenshot commands and route switches should then be deleted or
  quarantined with the retired renderer code instead of maintained as hidden
  compatibility paths.
- **DOM is allowed only by decision.** Dense UI panels may remain DOM if they
  are intentionally better there, but each such decision needs a slice-level
  contract for layering, screenshots, input, and focus. Canvas-rendered game
  surfaces should be WebGPU.

## Current Repo Anchors

- Existing game app: `web/`
- Proposed lab app: `apps/webgpu-lab/`
- Proposed shared packages: `packages/webgpu-core/`,
  `packages/soldier-assets/`, `packages/crowd-runtime/`
- Battle entry: `web/src/battle/scene.ts`
- Production battle WebGPU adapter: `web/src/battle/rendererWebGPU.ts`
- Battle class labels: `web/src/battle/classData.ts`
- Campaign entry: `web/src/campaign/scene.ts`
- Production campaign WebGPU adapter: `web/src/campaign/rendererWebGPU.ts`
- Menu entry: `web/src/menu/scene.ts`
- Camera/picking contract: `web/src/shared/camera.ts`
- Soldier model/pose source: `web/src/shared/soldierModel.ts`
- Legacy 3D model/render references: archived current-renderer screenshots,
  tracked model baselines under `web/shots/baseline/models*`, animation GIFs
  under `web/shots/anim/`, and git-history sources such as
  `web/src/battle/renderer3d.ts`, `web/src/battle/turntable.ts`, and
  `web/src/campaign/terrain3d.ts`.
- Raw-WebGPU asset/model review surfaces: `apps/webgpu-lab/` and
  `packages/soldier-assets/`
- Scenario runner: `web/scenario.mjs`
- Visual battle wrapper: `web/verify-battle.mjs`
- Campaign visual scenario: `web/scenarios/campaign-webgpu-visual.mjs`
  (`web/verify-campaign-visual.mjs` is a compatibility wrapper)
- Vibe timelines: `web/vibe/*.mjs`

The old Babylon WebGPU spike (`?test=webgpu-skinned-vat`) has been removed in
favor of the fresh raw-WebGPU lab/package architecture described here. Current
`rendererWebGPU.ts` files are production adapters over the shared raw-WebGPU
packages, not Babylon/Three renderer forks.

## Contracts That Must Not Break

- The sim and campaign crates stay out of scope unless a later slice explicitly
  adds a read-only export. `crates/sim`, `crates/campaign`, `crates/contract`,
  and `crates/game-wasm` should not move for renderer-only slices.
- The renderer keeps reading the same zero-copy wasm buffers and the existing
  `frames` protocol until a separate slice adds a new additive contract.
- `web/src/shared/camera.ts` remains the source of truth for world/screen math.
  Picking, drag select, banners, cards, and overlays depend on it.
- `?debug=blocks` remains cheap and deterministic for vibe/behavior baselines.
- The far strategic sprite path remains available as the L3 fallback.
- Frozen visual tests cannot read wall-clock animation time.
- Campaign ownership/livery semantics stay intact: faction colors identify
  ownership; allegiance colors identify standing.
- Normal `/` boot, menu navigation, battle launch, campaign launch, save/load,
  and battle handoff stay usable throughout the transition.
- A slice may add an additive export from wasm or campaign state, but renderer
  work must not silently change sim/campaign mechanics.

## Slice Graph

1. `00-webgpu-device.md` creates the lab route shell and proves WebGPU pixels
   are available and stable.
2. `01-raw-frame-shell.md` creates the raw WebGPU renderer shell.
3. `02-asset-workbench.md` creates the placeholder-first asset app.
4. `03-crowd-data-contract.md` defines uploadable soldier instance data.
5. `04-animation-state.md` locks `frames` to deterministic clip state.
6. `05-placeholder-vat-bake.md` creates deterministic generated VAT assets.
7. `06-single-skinned-soldier.md` renders one GPU-skinned placeholder.
8. `07-skinned-crowd.md` scales to many skinned soldiers.
9. `08-lod-impostors-sprites.md` adds LOD, impostors, and sprite fallback.
10. `09-battle-integration.md` plugs raw WebGPU into the live battle path.
11. `10-performance-contract.md` records real hardware perf gates.
12. `11-campaign-reuse.md` reuses low-LOD crowd assets in campaign.
13. `12-art-production-contract.md` finalizes the real-art handoff lane.
14. `13-render-graph-resource-lifetime.md` turns the raw frame shell into a
    reusable full-game render graph with explicit depth-tested 3D passes and
    nested-object fixtures.
15. `14-battle-terrain-water-scenery.md` ports battle terrain, water, sky,
    haze, shadows, and scenery to raw WebGPU.
16. `15-battle-crowd-production-parity.md` replaces the live battle soldier
    renderer with the skinned crowd pipeline at production scale.
17. `16-battle-ui-overlays-compositor.md` ports or deliberately layers battle
    banners, selection, paths, minimap, HUD, and unit cards over WebGPU.
18. `17-battle-input-selection-parity.md` proves click, drag, orders, camera,
    DPR, and freeze semantics against the WebGPU battle path.
19. `18-battle-default-cutover.md` makes WebGPU the only battle renderer and
    removes the old battle renderer paths.
20. `19-campaign-map-renderer.md` ports campaign terrain, water, fog, roads,
    borders, territory washes, clouds, and labels to raw WebGPU, then removes
    the legacy campaign renderer path after migration evidence is captured.
21. `20-campaign-entities-and-panels.md` ports campaign cities, armies,
    selection, diplomacy/readability, and panel composition.
22. `21-campaign-battle-handoff.md` proves campaign-to-battle-to-campaign flow
    through the WebGPU renderer without changing campaign mechanics.
23. `22-menu-shell-and-app-composition.md` ports the menu/app shell, loading
    states, overlays, modals, and route transitions around the WebGPU game.
24. `23-snapshot-vibe-migration.md` migrates visual scenarios, vibe timelines,
    and screenshot baselines to the WebGPU default path, with archived
    current-renderer captures used only for the one-time cutover comparison.
25. `24-full-game-performance-and-fallbacks.md` establishes real hardware
    performance budgets, memory ceilings, capability checks, and fallback UX.
26. `25-production-cutover-and-renderer-retirement.md` ships the full WebGPU
    game route and removes obsolete Babylon/WebGL production code.

The early slices are useful even if no real art ever arrives. The later slices
are what make it a full game port instead of a crowd-rendering prototype.

## Review Checkpoints

- **Checkpoint A:** raw WebGPU lab route renders stable pixels and deterministic
  instanced markers.
- **Checkpoint B:** asset workbench opens with generated placeholders, upload
  path, validation report, and 3D preview. `/webgpu/assets` now validates the
  generated kit, shows a live skinned preview, and accepts pasted, selected, or
  dropped `manifest.json` data for replacement art-pack validation.
- **Checkpoint C:** one GPU-skinned soldier matches the previous detailed
  soldier model silhouette/pose language, with placeholder assets allowed only
  as a temporary scaffold while the old model references are being ported.
- **Checkpoint D:** a live battle renders many skinned soldiers while preserving
  the old model readability, team/faction accents, and click/drag selection.
- **Checkpoint E:** LOD/impostor/sprite transitions are visible and screenshot
  checked.
- **Checkpoint F:** art workbench can tell an artist exactly what is missing or
  invalid in a supplied asset pack.
- **Checkpoint G:** live battle can be played through WebGPU with terrain,
  skinned crowds, banners, minimap, selection, orders, pause/speed, and unit
  cards behaving like the current game. `battle-webgpu-input` now proves the
  production battle route's real click, drag-box, right-click order, wheel zoom,
  DPR, and freeze semantics on WebGPU.
- **Checkpoint H:** normal battle route defaults to WebGPU; old battle renderer
  paths are quarantined or removed after screenshot/input parity.
- **Checkpoint I:** the normal campaign route runs through WebGPU with roads,
  territory, city/army markers, labels, diplomacy colors, panels, save/load,
  and battle handoff intact. City/town models, roads, trees, rocks, terrain
  relief, army standards, and selection footprints must match or improve on the
  previous 3D campaign renderer before this checkpoint can be accepted; after
  parity/improvement review it becomes the default and the old campaign
  renderer is retired. `campaign-webgpu-save-load`
  now proves the normal menu save slot round-trips into a loaded WebGPU
  campaign, and `campaign-webgpu-conquest` proves a real-map march to an
  independent city, garrison modal, auto-resolve, and continued savable WebGPU
  campaign state. `campaign-webgpu-reinforcements` proves a split nearby stack
  joins after battle launch and the expanded army renders through WebGPU.
- **Checkpoint J:** `/` boots the full game through the WebGPU app shell, from
  menu to campaign to battle and back. The normal menu now gates game launch on
  WebGPU capability, shows an unsupported-WebGPU failure state, and is covered
  by `menu-webgpu-shell`; battle and campaign renderer-retirement work is now
  covered by the `/webgpu/cutover` report, with final release readiness still
  blocked on named-hardware performance and side-by-side visual evidence.
- **Checkpoint K:** release verification, vibe timelines, and perf reports all
  run against the WebGPU default, with old baselines retired deliberately.
  `campaign-webgpu-visual` now owns the controlled campaign marker/UI snapshots
  through the scenario runner, `verify:campaign-visual` delegates to it, and
  `webgpu-lab-routes` checks the cutover report's WebGPU-only screenshot rule.
  `webgpu-visual-report` now generates the WebGPU visual cutover contact sheet.
  `scenario:webgpu` and `scenario:webgpu:campaign` write machine-readable pass
  reports under `visualizations/scenario-runs/`, and `release:webgpu` requires
  those reports to prove the WebGPU scenario bundles actually ran cleanly.
  After this checkpoint is accepted, no routine harness should invoke or add a
  current-renderer screenshot path; any leftover current-renderer screenshot
  helper is either removed with the renderer or marked as archived migration
  evidence and excluded from ordinary scenario/vibe runs.
- **Checkpoint L:** side-by-side battle, campaign, menu, and handoff screenshots
  show the WebGPU path is at least as readable as the current game and visibly
  better in the agreed graphics categories; once accepted, those legacy
  comparison captures become archived evidence rather than test inputs. This
  checkpoint also requires dedicated model/reference screenshots for soldiers,
  animation poses, cities/towns, roads, every individual tree/rock/scenery
  model, terrain, and campaign props, so whole-scene contact sheets cannot hide
  a missing model port. Animated assets need both deterministic still-frame
  baselines and regenerated WebGPU GIFs for human review. It also requires label
  typography/icon screenshots that prove the WebGPU glyph atlas preserves the
  old map-label font and icon language. Close campaign-map acceptance also
  requires the legacy perspective/trapezoid terrain projection, including
  selection rings projected as ground-plane world geometry rather than perfect
  screen circles. A rectangular orthographic WebGPU map is not parity even if the
  individual models render. The
  current checkpoint generates
  `specs/webgpu-skinned-crowd/visualizations/webgpu-visual-report.html`
  with WebGPU captures for the required surfaces, including battle crowd
  captures that check the warm/cool skinned soldier material grade instead of
  only team-color pixels. It still needs archived current-renderer comparison
  images attached and reviewed before final acceptance. `npm run
  archive:current-renderer` captures those archive PNGs from
  `CURRENT_RENDERER_URL` into
  `specs/webgpu-skinned-crowd/visualizations/current-renderer/` and writes a
  pending review manifest at
  `visualizations/current-renderer/visual-comparison.manifest.pending.json`.
  To attach those images, rerun `webgpu-visual-report` with
  `VISUAL_CURRENT_RENDERER_DIR` pointing at the archived PNG directory and
  `VISUAL_COMPARISON_JSON` pointing at a review manifest shaped like
  `specs/webgpu-skinned-crowd/visualizations/visual-comparison.manifest.example.json`.
  Accepted statuses require an attached image; a status string without archive
  pixels is not release evidence.
- **Checkpoint M:** a named-hardware performance report compares the current
  renderer and WebGPU renderer on identical scenes, proving lower frame time,
  lower upload cost, stable memory, or materially higher detail headroom. The
  current `full-game-webgpu-performance` scenario and `/webgpu/perf` route now
  prove report plumbing and full-game WebGPU liveness, and
  `full-game-webgpu-performance` writes
  `specs/webgpu-skinned-crowd/visualizations/webgpu-performance-report.html`
  plus JSON evidence. The production battle and campaign renderers now report
  CPU `buildMs`, `uploadMs`, `drawMs`, and `frameCpuMs`, and the campaign label
  atlas skips repeated uploads when the visible labels are unchanged. The same
  report records startup/loading time and JS heap usage per scene, and hardware
  comparison rejects an archived current-renderer baseline that omits matching
  startup or memory evidence. Headless SwiftShader reports are explicitly classified as
  non-release liveness; the report becomes release evidence only when rerun
  headful on a real named GPU/browser, for example with
  `PERF_CURRENT_RENDERER_JSON=../specs/webgpu-skinned-crowd/visualizations/performance/<baseline>.json npm run perf:webgpu:hardware`
  from `web/`. That command uses `VERIFY_HEADFUL=1` and
  `VERIFY_BROWSER_CHANNEL=chrome` with `VERIFY_WEBGPU_ADAPTER=hardware` so the
  runner does not force the SwiftShader WebGPU adapter; choose another installed
  browser channel if the release machine requires it. `PERF_CURRENT_RENDERER_JSON` must point at an
  archived current-renderer baseline for the same scenes. The baseline shape is
  documented in
  `specs/webgpu-skinned-crowd/visualizations/performance/current-renderer-baseline.example.json`.
- **Checkpoint N:** `npm run release:webgpu` regenerates the cutover/parity
  report, then reads it with the generated visual and performance JSON reports,
  writes
  `specs/webgpu-skinned-crowd/visualizations/webgpu-release-audit.html`, and
  exits nonzero until scenario-run evidence plus both final proof gates pass.
  This is the non-routine ship gate; `npm run scenario:webgpu` remains the green
  WebGPU liveness/regression suite, and `npm run scenario:webgpu:campaign`
  supplies the heavier campaign conquest/reinforcement evidence.

## Known Unknowns

- Reference screenshots are still not committed in-repo. Visual matching to
  Total War-style references cannot be final until they live under
  `specs/webgpu-skinned-crowd/assets/reference/`.
- The final licensed art pack does not exist yet. Generated placeholders are the
  default and are required for every slice.
- Real hardware performance targets must be measured on a named GPU/browser.
  SwiftShader/headless numbers are liveness checks, not performance truth. The
  30k battle route is especially slow under headless SwiftShader, so do not
  infer release performance from CI numbers. The generated performance report
  refuses to mark release performance complete for SwiftShader/headless runs or
  for real-hardware runs missing archived current-renderer comparisons.
- The final UI split is decided surface by surface. Battle now has an explicit
  `webgpuUiLayer` contract: WebGPU owns world/game surfaces and minimap; dense
  HUD, toolbar, card, modal, and manual panels may remain DOM when layering,
  focus, input, and screenshot behavior are tested. The menu/app shell and
  campaign panels have the same explicit DOM decision for dense controls and
  modals, with WebGPU capability gating, selection, layering, and screenshot
  coverage recorded in the cutover/parity report.
- Campaign labels now render through a raw-WebGPU glyph atlas pass generated
  from the same Cinzel/Georgia typography contract. Dense campaign panels remain
  DOM by explicit decision; labels are no longer a transitional DOM layer.
- Battle's Babylon/2D renderers, old `?test=models` turntable, campaign legacy
  renderer, and `@babylonjs/core` dependency have been removed. `npm run build`
  chunk output is a crude signal; `npm run cutover:webgpu` now writes
  `specs/webgpu-skinned-crowd/visualizations/webgpu-cutover-report.html` plus
  JSON, proving the local full-game parity matrix, WebGPU scenario coverage,
  package/dependency state, removed renderer files, and generated evidence
  artifacts. `/webgpu/cutover` exposes the renderer-retirement and
  dependency-audit status, plus the completed campaign label pipeline, while
  keeping `releaseReady` false until archived current-renderer visual
  comparisons and named-hardware performance reports exist. The cutover route
  links both generated review artifacts:
  `visualizations/webgpu-visual-report.html` and
  `visualizations/webgpu-performance-report.html`.
- `npm run release:webgpu` is expected to fail until those artifacts contain
  accepted archived visual comparisons and a passing named-hardware performance
  comparison. Its output is the release audit, not a routine CI liveness check,
  and it is the final place where current-renderer screenshot evidence belongs.
- `webgpu-visual-report` accepts archived current-renderer captures by matching
  each capture ID to `<VISUAL_CURRENT_RENDERER_DIR>/<id>.png`, or by reading the
  explicit `image` and `status` entries from `VISUAL_COMPARISON_JSON`. Accepted
  statuses are `webgpu-better`, `equal-or-better`, `accepted-exception`, `pass`,
  and `accepted`, but release acceptance also requires the manifest entry's
  archived image to exist.
- `full-game-webgpu-performance` accepts the archived current-renderer
  performance baseline through `PERF_CURRENT_RENDERER_JSON`. Release comparison
  only passes on a real named GPU/browser when every shared scene has WebGPU
  median and p95 frame time at or below the archived current-renderer values
  within the report's explicit measurement floors: 0.25 ms median, 1.5 ms p95,
  0.25 ms upload/draw CPU, and 50 ms startup slack. Those floors exist only to
  absorb vsync/browser scheduling noise around an otherwise equal 120 Hz frame;
  larger regressions still fail.

## Art Handoff

See `assets/ART_CONTRACT.md`. That file is the contract for what you can give
artists: skeletons, clips, meshes, textures, masks, LODs, provenance, and
validation expectations. The implementation should turn it into a live asset
workbench, not just a document.

## Done

This feature is done when the shipped default browser game runs through raw
WebGPU from menu to campaign to battle and back; the battle and campaign visual
harnesses target WebGPU by default; real assets can be dropped into the
workbench and validated without code changes; obsolete Babylon/WebGL production
paths are removed or quarantined; side-by-side review shows graphics are equal
or better on every shipped surface and visibly better in the intended battle and
campaign categories; real-hardware reports show performance is equal or better
than the current game with more crowd/detail headroom; current-renderer
screenshots are no longer part of routine verification; `npm run
release:webgpu` passes; and the plan folder has been replaced by tests,
playable harnesses, code comments, and a postmortem with measured operating
points.
