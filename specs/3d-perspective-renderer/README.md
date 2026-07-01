# 3D perspective renderer + photorealism

Replace the engine's 2.5D "tilted-ortho" pseudo-perspective projection with a
**real 3D perspective camera** (view + projection matrices, real depth buffer),
engine-wide across **battle and campaign**, and build a **photoreal** look on top
of it (PBR materials, real sun shadows, physical sky/atmosphere, photoreal
sea/terrain/soldiers). The motivating symptom: `/renderer/water-bakeoff` renders
a "dome + radial streaks" because the finite water quad converges to a wedge under
the fake perspective (`projectGround` fakes depth from world-Y with a fixed
pixels-per-world-unit `zoom`). A real camera fixes that for free — and unlocks the
photoreal register the `aesthetics` skill targets.

## Next Agent Prompt

**Status:** Plan synthesized 2026-07-02 from three independent architect drafts
(strong convergence). Spec materialized: this README + the spine slice files
(`01`–`05`) + the photoreal-substrate bake-off (`06`). The photoreal *surface*
slices (`07`+) are sketched in the slice graph below but **not yet authored as
detailed files** — they are deliberately deferred until slice `06` decides the
materials substrate (bespoke WGSL vs three.js/TSL).

**Slice `01` is DONE (committed, 2026-07-02).** Landed the pure `camera3d` math
library + `mat4` (`packages/renderer-core/src/`), reverse-Z infinite-far
perspective, and the WebGPU-free `/renderer/camera3d-probe` route (ground grid +
unit cube + formation, project→unproject round-trip readout). 7 unit tests green
(`web/tests/camera3d.test.ts`). **Infra reconcile:** the `web/tests/*.test.ts`
node:test suites (camera3d, cameraRig, grassField, grassModels) were orphaned —
run by no gate. Added `web` script `test:unit` (`node --experimental-strip-types
--import ./tests/register-ts-extension-loader.mjs --test tests/*.test.ts`) and
chained it into the root `test:web`, so `check`/CI now runs all 25. camera3d is
the single projection owner; the 2.5D fake path in `cameraUniform.ts` is untouched
(it is collapsed in `04`/`05`, per the clean-architecture invariants).

**The one decision that gates the photoreal half — resolve before authoring `07`+:**
the *camera spine* (`01`–`05`) is settled as **bespoke** (the conversion is a small
centralized seam change, and the entire verification harness — seam unit tests,
`__rendererLabStats` behavioral publishing, screenshot routes — is built on the
bespoke renderer; moving it to a framework would be a bad trade). The *photoreal
layer* (PBR/shadows/sky/ocean/post) is the only place a framework earns its keep,
so slice `06` is a **three.js WebGPU + TSL vs bespoke bake-off** (water vista + PBR
sphere grid + a **30k-soldier + foliage** crowd-perf probe) that picks the substrate
on evidence. **The `06` agent makes the substrate call itself** using the locked
decision procedure in that slice file (perf veto at ~33 ms / 30 fps · look parity ·
harness heavily-weighted-but-tradeable · near-tie → three.js), then **re-invokes
`/feature-slicing` with the results** to author `07`+. No human sign-off gates it.

**Slice `02` is DONE (committed, 2026-07-02).** The keystone landed: the water
route runs on the real 3D perspective camera + a reverse-Z `depth32float` buffer,
and the **dome/streak wedge is GONE** — `/renderer/water-bakeoff` now reads as a
flat sea meeting a straight, level true horizon (screenshot-critique: "straight and
flat, not domed, waves recede correctly"; compare-screenshots old-dome vs new: new
decisively less wrong). Reverse-Z + `depth32float` render **non-blank on
SwiftShader** (risk retired). New gate scene `web/scenes/system/water-horizon-real.mjs`
(depth-format + level-horizon asserts). Unit gate `web/tests/cameraUniform.test.ts`
(4 tests): packed `viewProj`/`invViewProj`/`eye` equal `camera3d`, 52-float/208-byte
layout, and the 12 legacy scalars are byte-identical with/without the real camera.
All `web/shots/misc/water/**` deliberately re-blessed (geometry moved under the real
projection). Non-water frozen scenes verified byte-identical (battle/campaign diff
counts vs baseline unchanged before/after; `battle-terrain-elevation` seating
tripwire `match=true`).

**Decisions recorded this slice:**
- **How the shell receives the real camera:** additive optional field
  `CameraSnapshot.camera3d?: Camera3DParams`. When set, `cameraUniformData` resolves
  `viewProj`/`invViewProj`/`eye`/`znear`/`zfar` via `camera3d` and packs them after
  the 12 legacy scalars (offsets: float 12 / 28 / 44 / 47 / 48; struct = 52 floats /
  208 B). **`aspect` is overridden by the live width/height** so the projection
  follows resize with a single owner. Legacy passes read only floats 0..11 →
  byte-identical.
- **Uniform is a superset, not a replacement:** `CAMERA_UNIFORM_WGSL` `struct Camera`
  appends `viewProj`/`invViewProj`/`eye`/`znear`/`zfar`; `projectReal(world)` is the
  new real projector. All legacy fns (`projectGround`/`projectWorld3d`/`worldDepth3d`/
  `civsim*WorldDepth3d`) are untouched — the short-lived migration seam collapsed at
  `04`/`05`.
- **Reverse-Z is opt-in per shell:** `FrameShellOptions.reverseZ` → `depth32float`,
  clear `0`; `depthContract` adds `GPU_DEPTH_FORMAT_REVERSE` + clear consts;
  `pipelineContracts` adds `gpuReverseZDepthStencil(mode)` (compare `greater` /
  `greater-equal`). Battle/campaign shells stay on legacy `depth24plus` painter.
- **`WaterPlanePass` real path is opt-in (`opts.real`)** because battle's
  `horizonPass` ocean edge shares that class on the legacy `depth24plus` shell — the
  flag keeps that byte-identical while only the bake-off route flips to
  `projectReal` + `gpuReverseZDepthStencil('read-write')`.
- **Water framing:** an oblique out-to-sea camera (`yaw = −π/2`, infinite far →
  true-horizon vanishing line). Battle default `target[0,140,0]/dist 190/pitch 0.22/
  fov 0.78`; campaign (`?cam=campaign`) `target[0,200,0]/dist 240/pitch 0.38/fov 0.70`.
  URL-tunable (`pitch/dist/fov/targetY`). Two water look-scenes (`foam`, `albedo`)
  were re-based to sample the **near sea** (below the honest horizon-haze band) —
  the real camera reveals a real hazed horizon the fake projection compressed away,
  so the old fixed bands were reading haze as whitecaps / averaging albedo through
  aerial haze (haze is gated separately by `water-haze`). Dusk's mean is warm by
  design; blue-dominance is asserted for the daytime presets, dusk only stays off
  neon-green. No thresholds were loosened to hide a look.

**Known non-blocking reds (pre-existing on HEAD, not this slice):** the format gate
(single/double quotes) is red on committed HEAD; several water/coastal battle
snapshot baselines are stale (identical diff counts before/after this slice); the
`water-silhouette` 8ms budget check fails only on the **SwiftShader software
rasterizer** (perf gates are hardware-only per this README).

**Slice `03` is DONE (committed, 2026-07-02).** The zoom→camera rig landed as a
pure, deterministic curve mapping zoom → real `Camera3DParams` framing. **Purely
additive** (refinement over the slice file, which said "rewrite `cameraForZoom`"):
the legacy `cameraForZoom` + `scene.ts` 2.5D path is UNTOUCHED (battle renders
byte-identical) and stays wired until slice `04` swaps `scene.ts` onto the new rig
and deletes `cameraForZoom`. Two rigs coexist only across that short migration seam
— collapse it at `04`.
- **New in `web/src/battle/cameraRig.ts`:** `battleCameraRig(zoom, zoomRange,
  bounds)` and `campaignCameraRig(...)`, both returning `ZoomCameraRig
  { target:[x,y,z]; distance; pitch; fovY; zoomT }` (camera3d convention: pitch π/2
  = top-down, small = oblique; **pitch/distance DECREASE with zoom, fovY increases**
  — opposite sign to the legacy flat-convention `cameraForZoom` pitch). `yaw`/
  `aspect`/`near` are the caller's to fill at wire-time (`04`); `target` is a forward
  look-ahead offset along −X (the yaw-0 view direction) added to the ground
  view-centre by the caller. `zoomT` still exported (grass/haze read it).
- **Chosen curve endpoints (the human tuning knob):**
  battle pitch **1.35 → 0.28 rad** (~77°→16° down), fovY **0.50 → 0.85 rad**
  (~29°→49°), distance **2.0·min(w,h) → 0.6·min(w,h)**, forward look-ahead
  **0 → 0.30·min(w,h)**. Campaign is flatter/narrower and lingers near top-down:
  pitch **1.42 → 0.55**, fovY **0.45 → 0.65**, `easeBias` **1.8** (vs battle 1.0) so
  it stays a near-top-down chart past the midpoint. One `smoothstep(zoomT)^easeBias`
  eased parameter drives every axis → monotonic + continuous by construction.
- **Single-curve legibility:** the monotonic curve kept mid-zoom legible in the probe
  contact sheet, so the **RTS-mode fovY clamp fallback was NOT needed** (recorded as
  available if `04`'s play-test finds mid-zoom too wide).
- **Verified:** `web/tests/cameraRig.test.ts` extended (+9 tests, 37 total green) —
  pitch/fovY/distance monotonic, near-top-down band out / vista band in, continuous,
  clamped past both ends, deterministic, campaign-flatter-than-battle. `typecheck`
  green. Probe extended additively to accept `targetX/targetY/targetZ` (was fixed
  `[0,0,0]`). Contact sheet (top-down→mid→vista) captured via the `/renderer/
  camera3d-probe` route; screenshot-critique verdict: reads as a smooth dolly from
  tactical top-down to cinematic horizon vista.

**Slice `04a` is DONE (committed, 2026-07-02).** The battle engine is flipped onto
the real 3D perspective camera + reverse-Z depth, and picking is a 3D ray-cast — the
fan-out landed atomically. **Resliced:** `04` was cut to `04a` (projection/depth flip
+ CPU camera3d wiring + 3D picking, this commit) with the decal/billboard/LOD polish
deferred to follow-up slices (`04b`–`04e`, below).
- **Per-pass `real` flag (NOT rewriting the shared `projectGround`/`projectWorld3d`
  bodies).** Exactly like slice 02's water pass: each battle-owned pass compiles a
  `real` WGSL variant that calls `projectReal(...)` and swaps its depthStencil to
  `gpuReverseZDepthStencil`. Battle sets `real: true`; **campaign builds its own shell
  + its own pass instances and never sets it, so campaign stays byte-identical on the
  legacy `depth24plus` painter path.** Flags added to `skinnedPipeline`,
  `soldierShadowPass`, `groundPass`, `grassPass`, `horizonPass` (incl. its
  `WaterPlanePass` ocean planes), `groundCuePass`, `effectLinePass`,
  `campaign/sceneryPass` (battle mode), the inline `BattleTrianglePass`, and the
  `frameShell` builtin terrain/backdrop/marker shaders (gated on the shell's
  `reverseZ`). Battle shell opts into `reverseZ: true`. `soldierShadowPass` drops the
  `0.72` y-squash when real.
- **CPU: `camera3d` is the ONE owner.** `web/src/shared/camera.ts` `Camera` was
  rewritten to delegate every screen↔world mapping to `camera3d`
  (`projectPoint`/`unprojectToPlaneZ` against ground z=0); `worldToScreen`/
  `screenToWorld`/`clampView`/`zoomAt`/`panPixels`/`panWorld` all go through a
  `params(): Camera3DParams` built from `battleCameraRig`. `scene.ts` feeds the rig
  (`camera.setRig(range,bounds)`); `renderer.ts` builds `CameraSnapshot.camera3d` and
  opts the shell into reverse-Z. **`cameraForZoom` + `CameraRig` + `BATTLE_CAMERA_RIG_LIMITS`
  DELETED** (only consumers were `scene.ts` + `cameraRig.test.ts`); the two-rig seam
  is collapsed. Picking firewall held: `input.ts` call sites + `pickUnit(wx,wy)` +
  `terrainHeightAt` untouched.
- **Verified:** typecheck + 34 unit tests green (incl. new `web/tests/battlePicking.test.ts`
  — worldToScreen∘screenToWorld round-trips <0.3 px across zoom stops; a centroid click
  selects its unit). Seating tripwire `battle-terrain-elevation` `match=true` on all 3
  fixtures (heightfield firewall intact). Full `battle` scene suite green under
  SwiftShader, no page/validation errors. Depth-sort/upright confirmed
  (screenshot-critique of the camera-zoom contact sheet: smooth top-down→mid→vista, a
  proper low-oblique cinematic vista with upright, correctly depth-sorted soldiers;
  selection-ring ground decal seats on terrain; HUD/banners/minimap intact). Campaign
  frozen scenes byte-identical (map-alignment + campaign-visual diffs 0.003–0.08%,
  within SwiftShader noise). All moved `web/shots/battle/**` (24 baselines) re-blessed
  deliberately after eyeballing representatives. Re-derived the `battle-camera-zoom`
  behavioral asserts and the `hasBattleWorldDepthContract` depth-format expectation to
  the camera3d/reverse-Z convention.

**Deferred to follow-up slices (clean handoff — the projection is done, these are
polish on top):**
- **`04b` decals:** add `depthBias`/`depthBiasSlopeScale` to the shadow/ground-cue/
  selection pipelines so decals never z-fight on tilted terrain (they read fine today
  via the +0.015/+0.02 z-lift + reverse-Z read; bias is the belt-and-braces).
- **`04c`/`04d` billboards:** particles/effect-lines/markers → camera-facing billboards
  from `cam.eye` + view right/up (today they project as flat ground quads — correct
  placement, not yet camera-facing). The `frameShell` far-LOD marker likewise.
- **`04e` LOD screen-size:** `packages/crowd-runtime/src/lod.ts assignCrowdLodsByDistance`
  still uses `zoom×distance`; swap to real projected screen-height (∝ clipW) with a
  min-size floor, and re-derive the `lod-tiers` monotonicity assert. (Battle currently
  renders full-detail correctly under the real camera; this is a perf/readability tune.)
- **lab `routeBattleLive` + `pickingDebug.ts`:** the lab pick harness (and its
  `cssToBattleWorld`/`RendererBattlePickCamera`) is still on the legacy 2.5D camera and
  was left UNTOUCHED — flipping it means flipping that whole lab route's shell/terrain.
  The production gameplay picking (the `Camera` class, used by `input.ts`) IS the
  ray-cast and is verified; the lab harness's camera3d migration is a `04`-followup.
- **30k-soldier + foliage perf gate:** author it next (README TODO), hardware-only.

**Exact next pickup point:** **slice `05` (flip campaign to the real camera + campaign
picking), then delete the legacy projection/depth scaffolding** — OR land the `04b`–`04e`
battle polish + perf gate first. `05` mirrors this slice on `web/src/campaign/renderer.ts`
(pass `real: true`, `reverseZ` shell, `campaignCameraRig`) and rewrites campaign picking;
the legacy `projectGround`/`projectWorld3d`/`civsim*WorldDepth3d` + the per-pass `real`
flag can then collapse into the one real projector once nothing consumes the legacy path.
The `06` bake-off can still run in parallel.

**Active blockers / coordination warnings:**
- **Overlap with `specs/battle-map-reference/`** (active, in-flight). That spec is
  matching a highland-valley Bronze-Age Aegean vista *under the current 2.5D
  camera* (deep grass/terrain/cliff/sky/water work, slices up to `07-distant-water`
  / `08-reference-map-compose`). This feature pulls the projection out from under
  it. **Recommended sequencing (needs human confirm):** land the camera spine
  (`01`–`05`) first, then rebase `battle-map-reference`'s look work onto the real
  camera — tuning the look twice (once under fake perspective, once under real) is
  wasted, and some of its grass pain is downstream of the projection we're
  replacing. Until confirmed, treat `battle-map-reference` baselines as
  will-move-anyway.
- The env/weather presets moved to `packages/game-renderer/src/environment/environment.ts`
  (`CIVSIM_ENVIRONMENTS`; `WATER_ENVIRONMENTS` is now an alias). Photoreal lighting
  slices consume that owner, not the old `waterEnvironment.ts`.
- The photoreal north star is **`specs/battle-map-reference/assets/target-battle-map.png`**
  + the `aesthetics` skill (Bronze-Age Aegean / Total War Saga), NOT generic PBR.
  Copy that image into `assets/` here when photoreal slices are authored, and make
  it the `compare-screenshots` target for every photoreal surface.

**Global TODO checklist:**
- [x] `01` — `camera3d` pure math library (renderer-core) + `/renderer/camera3d-probe` **(done)**
- [x] `02` — real depth + real projection proven on the **water route** (keystone) **(done — dome gone, reverse-Z on SwiftShader confirmed)**
- [x] `03` — zoom→camera rig (pure curve), battle + campaign **(done — additive `battleCameraRig`/`campaignCameraRig`; legacy `cameraForZoom` untouched until `04`)**
- [x] `04a` — flip the shared seam → **battle** engine-wide + 3D ray-cast picking **(done — per-pass `real` flag + reverse-Z shell, `Camera` delegates to camera3d, `cameraForZoom` deleted; decals/billboards/LOD resliced to `04b`–`04e`)**
- [ ] `05` — flip **campaign** to the real camera + campaign picking, then **delete
      the legacy projection/depth scaffolding** (no dual path survives the spine;
      follow the **legacy-collapse inventory** in the invariants section — the lab
      pick harness + `fixtures/nested3d` are still legacy)
- [ ] `04b` — battle polish: decal depth-bias, camera-facing billboards, LOD
      screen-size, lab pick-harness migration (`slices/04b-battle-polish.md`)
- [ ] `04f` — **30k-soldier + foliage perf gate**, hardware-only, standing
      (`slices/04f-30k-perf-gate.md`)
- [ ] `06` — **photoreal substrate bake-off** (bespoke vs three.js/TSL, 30k-crowd
      veto) → verdict (`slices/06-photoreal-substrate-bakeoff.md`; unblocked now
      that `04a` gives the bespoke prong a real-camera crowd)
- [ ] `07`+ — photoreal ladder (author after `06`): PBR/lighting core, sky+aerial,
      CSM shadows, sea, terrain, soldiers, campaign surfaces, cleanup/close-spec
- [ ] Confirm `battle-map-reference` sequencing with the human

**Instruction to the next agent:** update this section (status, pickup point,
checklist) before ending your pass.

## Human decisions already locked (do not re-litigate)

From the interview:
- **One real 3D perspective camera engine-wide**, battle AND campaign.
- **Zoom-coupled FOV** (near-top-down out → cinematic vista in). Preserving today's
  ortho tactical legibility is **not** required — "playable" is the only bar. If
  faithfully emulating ortho over-complicates the rig, go full perspective.
- **Photorealism is in scope in this feature** (not a follow-on): PBR, real
  lighting/shadows, photoreal water/terrain/soldiers/campaign — in the Bronze-Age
  Aegean register, matched to `target-battle-map.png`.
- **All visual baselines re-bless deliberately.** Accepted.
- **SIM IS UNTOUCHED.** Presentation + input only. No changes to `crates/**`,
  pathing, ranges, or `terrainHeightAt`. Hard firewall.

## The master architectural finding (why this is sliceable)

100% of GPU projection funnels through **two WGSL functions** in
`packages/renderer-core/src/cameraWgsl.ts` — `projectGround(world2, d)` and
`projectWorld3d(world3, d)` (plus `cameraSpace`, `perspectiveDepth`, and the
`worldDepth3d` / `civsim*WorldDepth3d` painter-depth helpers). Every one of ~20
passes (`battle/*`, `campaign/*`, `water/*`, `skinnedPipeline`, `soldierShadowPass`,
`frameShell` builtin terrain/marker shaders, `fixtures/nested3d`) calls exactly
those. No pass builds its own projection. The CPU mirrors it in three places:
`cameraUniform.ts` (`worldToScreen` / `world3dToScreen` / `screenToWorld`),
`web/src/shared/camera.ts` (the `Camera` class), and `battle/pickingDebug.ts`.

**The conversion as SHIPPED (corrected 2026-07-02 — supersedes the original
body-rewrite plan):** grow the camera uniform *additively* (keep the 12 legacy
scalars so un-migrated passes stay byte-identical; append `viewProj`, `invViewProj`,
`eye`, `near/far`) and add ONE new WGSL projector, `projectReal(world)`. The
original plan — rewrite the *bodies* of `projectGround`/`projectWorld3d` — was
**abandoned during `04a`**: battle and campaign compile the same WGSL source but
must flip at different times, so a body rewrite would have flipped campaign
prematurely. What shipped instead: **each pass takes an opt-in `real` compile flag**
(switches its WGSL to `projectReal` + its depthStencil to
`gpuReverseZDepthStencil`), and **each shell takes an opt-in `reverseZ` flag**
(`depth32float`, clear 0). Battle set them in `04a`; campaign sets them in `05`; a
renderer's world-depth passes flip together (atomic shared depth buffer). The
per-pass flag is deliberate, *temporary* migration scaffolding — when `05` lands and
nothing consumes the legacy path, the flags and the legacy fns
(`projectGround`/`projectWorld3d`/`worldDepth3d`/`civsim*WorldDepth3d`) are deleted
and `projectReal` becomes the one canonical projector. The CPU trio delegates to
`camera3d` (done for battle in `04a`). The ladder proved matrices + reverse-Z on
**one isolated surface (the water route)** before any fan-out — that keystone is
what made `04a` mechanical.

Verified current facts: `struct Camera` is 12 floats; `zoom` = pixels/world-unit;
`perspectiveDepth(ry)=max(0.32,1+ry*perspective)`; depth written is a painter value
keyed to world-Y (`civsimBattleWorldDepth3d = 0.50 + y*0.0012 − z*0.0030`), format
`depth24plus`, clear `1`, compare `less`/`less-equal` (`pipelineContracts.ts
::gpuWorldDepthStencil`). Soldiers are real 3D VAT-skinned meshes standing in
world-Z. Depth/overlay ordering is centralized in `depthContract.ts`,
`pipelineContracts.ts`, `renderGraph.ts`/`frameGraphContract.ts`.

## Verification environment (plan around these)

- **Headless WebGPU is NOT blank** — `web/scene.mjs` launches Chromium under
  **SwiftShader** (`--use-vulkan=swiftshader --use-angle=swiftshader
  --enable-unsafe-swiftshader`) when `VERIFY_GPU=1`. Treat SwiftShader as the
  **weak-GPU CI proxy**: it renders correctness fine (incl. `depth32float` +
  reverse-Z), but CSM arrays, sky-LUT compute, and any IFFT compute are a
  SwiftShader risk → use it to *enforce* capability fallbacks; run **perf gates on
  hardware only** (`VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome`).
- Routes: `apps/renderer-lab/src/router.ts`. Scenes: `web/scenes/**`. Baselines:
  `web/shots/**` via `snapCheck`. **Seam unit tests: `bun run --cwd web test:unit`**
  (node:test over `web/tests/*.test.ts` — the runner this spec's gates live in;
  wired into root `test:web` in slice `01`). Vitest (`bun run --cwd web test`) owns
  the React component tests only. Rust: `cargo test --workspace`. Animated gates
  snap at a fixed `shell.setTime(t)`.
- **House style trap:** do NOT run `bunx oxfmt` — it fetches the wrong formatter
  version (double-quote defaults) and cannot reach `packages/`/`apps/`. Match the
  single-quote 2-space style of sibling files by hand. The repo format gate is red
  on committed HEAD (pre-existing); don't chase it.

## Performance floor (hard requirement)

The battle renderer must sustainably render **30,000 soldiers** plus **countless
trees and grasses**, with **healthy margin above 30k** — the frame budget is judged
*with* the full crowd and dense foliage on screen, not a bare field. The locked
budget is **~33 ms/frame (30 fps) on the hardware adapter (this Mac's GPU)**. This is
a first-class acceptance criterion, not a "later optimization":

- **Standing perf gate (hardware only):** a battle scene at **30k+ soldiers + dense
  tree/grass fill** must hold **≤ ~33 ms/frame** (`shell.stats().gpuTimeMs`,
  `VERIFY_GPU_ADAPTER=hardware`). Author it as a scene the moment the battle seam
  flips (`04`) and keep it green through every photoreal slice — each new
  material/shadow/foliage pass re-runs it. SwiftShader is not a perf oracle.
- **Substrate veto (`06`):** the crowd-perf probe is sized at **30k+ soldiers with
  foliage**, not a token few thousand. A substrate (bespoke or three.js/TSL) that
  cannot hold **~33 ms** at that scale on hardware is **rejected** regardless of how
  good it looks. This is the axis most likely to decide `06`.
- **Design consequence:** favors GPU-driven instancing/indirect draw, aggressive
  distance LOD + impostors for both soldiers and foliage, and frustum/So culling that
  a real perspective camera makes *cheaper* (a true frustum culls the off-screen
  world the fake ortho could not). Foliage is instanced/indirect from the start, not
  retrofitted.

## Slice graph

```
01 camera3d math lib (pure, no GPU)                          ✅ done
      │
02 real depth + real projection proven on WATER route        ✅ done (keystone; dome gone)
      │
03 zoom→camera rig (pure curve, battle + campaign)           ✅ done
      │
      ├── 04a FLIP battle + 3D ray-cast picking               ✅ done (per-pass `real` flag)
      │        │
      │        ├── 05 FLIP campaign + collapse legacy projector   ← in flight
      │        │
      │        ├── 04b battle polish (decal bias · billboards · LOD screen-size ·
      │        │        lab pick-harness migration)               after 05's collapse
      │        └── 04f 30k-soldier + foliage perf gate            hardware-only, standing
      │
06 PHOTOREAL SUBSTRATE BAKE-OFF (bespoke WGSL vs three.js/TSL)  ← decides 07+
      │  (water vista · PBR sphere grid · 30k crowd-perf probe)
      │  gates on 04a: the bespoke prong's crowd must run on the REAL camera,
      │  or the probe is 2.5D-bespoke vs 3D-three.js apples-to-oranges. Unblocked now.
      ▼
   ===== PHOTOREAL LADDER (author after 06 picks substrate) =====
   07 PBR BRDF + scene-lighting uniform (shared foundation)
   08 sky + atmosphere + aerial-perspective LUT (a: sky, b: aerial haze, c: sun)
   09 cascaded shadow maps (new frame-graph phase; retires decal shadows)
   10 photoreal sea (a: Gerstner-vs-IFFT spike at true horizon, b: PBR+reflection,
        c: foam, d: depth turbidity, e: glint)
   11 photoreal terrain (a: PBR mat, b: receive CSM+aerial, c: grass relit/LOD,
        d: scenery/features)
   12 photoreal soldiers (a: PBR+CSM cast/receive, b: screen-size LOD under
        perspective, c: contact AO)
   13 campaign photoreal surfaces (a: map/sea, b: entities, c: scenery,
        d: territory/atmosphere)
   14 post-photoreal cleanup + close-spec (the LEGACY-PROJECTOR deletion belongs to
        `05`, not here — this is the final sweep: dead decal path once CSM lands,
        stale fixtures, close-spec archive)
```

**Milestone after `05`:** entire engine on a real perspective camera, sim
untouched, playable. Everything from `07` is photorealism, resliced to one visual
variable per sub-slice with a named crop.

## Firewalls & "must stay green" (every slice)

- **SIM untouched.** No edits under `crates/**`; `cargo test --workspace` green at
  every slice. No change to `terrainHeightAt`, `heightField`, pathing, ranges,
  `pickUnit`. The `battle-terrain-elevation` seating gate (soldiers seat
  byte-identical, `match=true`) is the tripwire that proves the heightfield firewall.
- **Picking moves to a 3D ray-cast but keeps its signature** — `screenToWorld(px,py)
  → (wx,wy)` becomes a ray→ground-plane intersection; `pickUnit(wx,wy)` unchanged.
- **Depth-convention change is the deepest risk.** Every consumer of the shared
  projection/depth is in the blast radius (enumerated in `04`). The flip is
  centralized, so passes move together; per-pass verification is the fan-out. `02`
  isolates the reverse-Z proof to the water route first.
- **All baselines re-blessed deliberately**, never blanket-overwritten. Diff each.
- **MSAA-safe:** every new/flipped pipeline keeps `gpuMultisample(shell.sampleCount)`.

## Clean architecture — end-state invariants (non-negotiable)

The finished renderer must read as if it were **designed for a real 3D perspective
camera from scratch** — not the 2.5D engine with a perspective adapter bolted on. The
additive-uniform / legacy-signature scaffolding in `02`–`04` is an explicit
**short-lived migration seam**, and it has a removal condition: the instant both
battle (`04`) and campaign (`05`) flip, *nothing* consumes the legacy path, so the
vestiges are deleted **at the end of `05`** — not carried to a distant cleanup slice.
No dual projection path survives the spine. Enforced invariants (each is a single
owner; divergence from these is the bug class this whole feature exists to kill):

- **Projection/camera has ONE owner: `camera3d`.** The GPU seam is a thin
  `viewProj * world` matmul; the CPU side delegates to `camera3d`. No pass builds its
  own projection; no `cosP`/`perspective`/`zoom`-as-pixels/`perspectiveDepth` fake
  fields remain; the real projector takes the canonical name (`projectGround`/
  `projectWorld3d` become the real ones, or are renamed — but there is exactly one).
  The `normalizedDepth` argument and `worldDepth3d`/`civsim*WorldDepth3d` painter
  helpers are **deleted**, not left returning 0.
- **Legacy-collapse inventory (check BEFORE deleting the legacy projector).** Known
  consumers still on the legacy path after `04a` — each must be flipped/migrated (or
  named an exception) before `projectGround`/`projectWorld3d` can be deleted, else
  those routes break silently: the lab **`routeBattleLive` + `pickingDebug.ts`**
  (`cssToBattleWorld`/`RendererBattlePickCamera` — the lab pick harness, deliberately
  left legacy in `04a`), **`fixtures/nested3d.ts`**, and any renderer-lab route whose
  shell never opts into `reverseZ`. Grep for every `projectGround`/`projectWorld3d`/
  `worldDepth3d`/`civsim*WorldDepth3d`/`gpuWorldDepthStencil` call site and account
  for each. **Intentional exception: `minimapPass`** — it uses its own top-down 2D
  `project()`, not the world camera, and stays 2D by design (record it, don't flip it).
- **Depth convention has ONE owner: the depth contract** (`depthContract.ts` +
  `pipelineContracts.ts`). One format, one Z direction, one clear value across the
  engine.
- **Environment/lighting has ONE owner: `CIVSIM_ENVIRONMENTS`**
  (`packages/game-renderer/src/environment/environment.ts`). Photoreal lighting
  *extends* that owner; it must NOT introduce a parallel lighting-preset system.
- **Distance haze/atmosphere collapses to ONE owner.** Today `haze`/`aerial`/`dust`
  is duplicated inline across `frameShell` terrain, `groundPass`, `horizonPass`, and
  water. The sky/aerial-perspective slice (`08`) **replaces all of them** with a
  single aerial-perspective source — a net deletion, not a fifth copy.
- **Water field stays behind the ONE `WaterFieldSource` seam.** Gerstner and any
  revived IFFT are swappable implementations of that seam, never parallel code paths.
- **Foliage (trees + grass) has ONE instanced/indirect owner**, shared with the LOD
  system — not per-species bespoke passes accreted over time.

Make ownership visible: publish the active projection/depth/environment identity in
`__rendererLabStats` so a test can prove every surface reports the *same* source of
truth (divergence was the original bug). If any slice starts widening into unrelated
behavior, slice it (`refactor-clean`): land the shared contract first, port consumers
in reviewable passes, then delete the stale path in the same milestone.

## Standing verification gates (every visual slice)

- **Unit at the seam** (cheap, no GPU): `camera3d` round-trips; `cameraUniformData`
  legacy-byte identity; picking round-trip; LOD monotonicity.
- **Scene/screenshot** under SwiftShader, ONE named visual variable + crop/mask per
  slice. `screenshot-critique` (unprimed second-eyes) is a **required last check**
  on any shot. When a slice has a target to compare against (a prior look it
  changes, or `target-battle-map.png`), `compare-screenshots` judges
  candidate-vs-target ("less wrong", not pixel-match).
- **Perf** (hardware adapter only): `shell.stats().gpuTimeMs` budget per route.
- **Human eyeball** at each checkpoint — **non-blocking** (open with
  `preview-shots`, ~5 min window, then decide on the evidence, record the call,
  close the shots, proceed).

## Biggest risks → how the ladder retires them early

1. **Matrix pipeline + real depth correctness** (could sink everything) → retired in
   `02` on the isolated water route, zero gameplay-legibility risk, and it kills the
   exact motivating symptom (dome→flat).
2. **Engine-wide seam flip breaking 20 passes at once** → mechanical *because* the
   seam is centralized; happens in `04` only after `01`/`02`/`03` are green; battle
   (`04`) and campaign (`05`) flip separately.
3. **Losing tactical legibility under perspective** → `03` makes the rig a pure,
   tunable, testable curve with a genuine near-top-down end; `04` gates it with a
   human play-test; "playable" is the explicit bar.
4. **"Make it photoreal" fog** → never one slice; `07`–`09` are shared foundations,
   every surface (`10`–`13`) is one visual variable per sub-slice with its own crop
   and critique/compare gate, against `target-battle-map.png`.
5. **Software-rasterizer CI hiding GPU-only failures** → SwiftShader is the
   weak-GPU proxy that enforces fallbacks (CSM/sky/IFFT); look + perf validate on
   hardware.
6. **Substrate misjudgment (bespoke vs three.js)** → retired in `06` by an
   evidence-based bake-off before any photoreal surface is committed.

## Known unknowns → where each resolves

- Reverse-Z + `depth32float` under SwiftShader → `02` (before any fan-out).
- One FOV/pitch curve keeps formations legible? → `03` curve + `04` play-test;
  fallback is a TW-style "RTS mode" FOV clamp at mid-zoom.
- Do soldier meshes/decals break under perspective? → `04` (upright/sort) + `12`
  (LOD, decal retirement).
- Photoreal substrate (bespoke vs three.js/TSL) → `06`.
- Gerstner vs IFFT at a true horizon → `10a` replication spike; default Gerstner.
  The current production water is a bespoke analytic Gerstner field
  (`packages/game-renderer/src/water/gerstnerField.ts`). Its look target and the
  origin of the deleted IFFT candidate is the upstream repo
  **[`Spiri0/Threejs-WebGPU-IFFT-Ocean`](https://github.com/Spiri0/Threejs-WebGPU-IFFT-Ocean)**
  (WebGPU compute, JONSWAP→IFFT, storage-buffer cascades). The water spec killed IFFT
  under the *fake* 2.5D camera because dispersion was invisible — that rationale is
  now **void** under a real perspective horizon, so re-judge it. It is three.js/TSL,
  so **replicate the technique, do not port** (unless `06` picks three.js).
- CSM / sky-LUT feasibility on SwiftShader → `08`/`09` verify; adapter-scaled.
- Camera uniform buffer growth/alignment (12 → ~48+ floats, mat4 16-byte align) →
  `02` layout assertion test.

## Source material

Draft research (all three drafts): [WebGPU reversed-Z sample](https://webgpu.github.io/webgpu-samples/samples/reversedZ/),
[Reed — Depth Precision Visualized](https://www.reedbeta.com/blog/depth-precision-visualized/),
[NVIDIA depth precision](https://developer.nvidia.com/blog/visualizing-depth-precision/),
[Cascaded Shadow Maps (NVIDIA)](https://developer.download.nvidia.com/SDK/10.5/opengl/src/cascaded_shadow_maps/doc/cascaded_shadow_maps.pdf),
[JolifantoBambla/webgpu-sky-atmosphere (Hillaire LUTs, raw WebGPU)](https://github.com/JolifantoBambla/webgpu-sky-atmosphere),
[Spiri0/Threejs-WebGPU-IFFT-Ocean (three.js/TSL — replicate, don't port)](https://github.com/Spiri0/Threejs-WebGPU-IFFT-Ocean),
[Total War tactical camera](https://lensviewing.com/total-war-camera-angles-up-on-zoom/).
