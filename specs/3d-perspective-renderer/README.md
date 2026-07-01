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

**Status (updated 2026-07-02):** camera spine `01`–`05a` landed on this branch
(`05b` authored, landing on the spine track); slice `06` is DONE with a substrate
verdict (below); and the **photoreal ladder `07`–`17` is now AUTHORED** — synthesized
from three independent architect drafts against the `06` verdict. The ladder's slice
files live in `slices/07-*.md` … `17-*.md`; the sketched `07`–`14` graph below was
replaced by the real `07`–`17` graph. The adoption seam, scaffolding ledger,
single-owner invariants, and standing gates are recorded in **"Photoreal ladder
invariants"** below — read that section before implementing any ladder slice.

**Exact next pickup point:** two parallel tracks.
1. **Spine track:** land `04f` (30k perf gate scene — the instrument every ladder
   slice re-runs) and `05b` (legacy projector collapse) — **both must land before
   `08b`** (the production flip deletes passes, not paths, and needs the perf gate
   in place).
2. **Ladder track:** slice `07` (`slices/07-photoreal-foundation.md`) **can start
   immediately, in parallel, in its own worktree** — it is additive + spike deletion,
   touches no production surface, and doesn't depend on `04f`/`05b`.

**Slice `06` is DONE — SUBSTRATE VERDICT: three.js WebGPU + TSL for the photoreal
layer (decided 2026-07-02, evidence-based, autonomous per the locked procedure).**
The camera spine stays bespoke. Full verdict + frame-time tables + look-parity
judgments + three.js pain points + the harness re-tooling plan are recorded in
`slices/06-photoreal-substrate-bakeoff.md` (VERDICT section) — read that before
touching `07`+. Headlines: **perf veto passed by both prongs ~6× inside the 33 ms
budget on hardware** (30,400 VAT-skinned soldiers + 200k grass + 3k trees: bespoke
3.3–4.6 ms GPU with LOD+cull; three.js 5.6–5.8 ms GPU brute-force full meshes, no
LOD/cull; both hold 60k), so perf did not discriminate. three.js won on **look**
(neutral judges: its water vista and its IBL sphere grid both "less wrong" — real
PMREM environment from a raw equirect DataTexture), on **velocity** (all three
probes in 738 lines vs bespoke needing to build IBL/CSM/post from scratch for
`07`+), and **harness survival was PROVEN not assumed** (same `__probeStats` seam,
GPU timestamps via `trackTimestamp` even under SwiftShader, `renderer.info` draw
calls, SwiftShader renders TSL fine, scene harness unchanged). Spike artifacts:
bespoke prong `apps/renderer-lab/src/bakeoffProbes.ts` (`/renderer/pbr-probe`,
`/renderer/water-pbr`, `/renderer/crowd-perf`), three.js prong
`web/three-{water,pbr,crowd}.html` + `web/src/three-probe/*` (three@0.185.1 in
`web/package.json`), measurement harness `web/bakeoff-shot.mjs`, evidence shots
`web/shots-bakeoff/`. All spike-only — nothing merged into production passes;
delete the probes when `07`+ replaces them.

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

**The substrate decision that gated the photoreal half is RESOLVED** (see the `06`
block above and the slice file's VERDICT): three.js WebGPU + TSL for the photoreal
layer; the camera spine stays bespoke `camera3d` and feeds three's camera through
`cameraBridge.applyCamera3d` (z-up, `camera.up=(0,0,1)`, proven in the spike). The
adoption seam is `web/src/battle/renderer.ts::BattleRenderer` — its **public API does
not move**; slice `08b` swaps its internals onto `PhotorealBattleWorld`
(`packages/photoreal-renderer/`) on the same canvas, mirroring `04a`'s atomic-flip
shape. No runtime substrate flag ever ships.

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

**Slice `05a` is DONE (committed, 2026-07-02).** The production campaign renderer is
flipped onto the real 3D perspective camera + reverse-Z, mirroring 04a's pattern:
- **Per-pass `real` flag on every campaign world-depth pass**, flipped atomically on
  one `reverseZ: true` shell: `mapPass` (map surface `write`, world-lines/roads
  `read`), `territoryPass`, `entityPass`, `selectionPass`, `sceneryPass` (04a's flag),
  `skinnedPipeline` + `soldierShadowPass` campaign instances. Overlay passes
  (markers/labels/fog/clouds — no depth attachment) swap projection only; the label
  shader's `projectScreen` becomes `projectReal` → NDC → device pixels, matched by
  the CPU cull (`visibleLabels` → `cameraUniform.worldToScreen`).
- **CPU:** `cameraUniform.worldToScreen`/`world3dToScreen`/`screenToWorld` delegate to
  camera3d when `CameraSnapshot.camera3d` is set (aspect pinned to live w/h).
  `CampaignRenderer.cameraParamsFor` wires `campaignCameraRig`: **the rig owns
  pitch/fovY/zoomT; `distance` derives from `cam.scale`** (vertical ground span at the
  target = height/scale device px) so the chart scale keeps its meaning — the rig's
  bounds-relative distance curve only spans 2.4× across campaign's ~28× zoom range and
  framed the whole continent at "close" zoom (caught by the campaign-lod gates). Screen
  centre = (cam.x, cam.y) exactly (no vista look-ahead); `yaw = −π/2` keeps north-up.
  `clampCam`/`nearestLoc`/city-panel flow untouched (only the projection under them).
  `cityReliefRisePx` projects z=0 vs z=h through the real camera (CSS px).
- **Verified:** typecheck + 38 unit tests green (new `web/tests/campaignPicking.test.ts`:
  ground round-trips <0.4 px at 5 zoom stops, chart-scale px/km pin, north-up
  orientation, city click→nearest-loc pick). `hasCampaignWorldDepthContract` re-derived
  to `GPU_DEPTH_FORMAT_REVERSE`. Full campaign suites green under SwiftShader
  (alignment/visual/lod/production/handoff/save-load/conquest/reinforcements/polish/
  water-sea/menu-renderer-shell), incl. the real-canvas click→army-select and
  click→city-panel checks on the real camera. `campaign-lod`'s regional fixture +
  Apennine crops re-derived (same world geography reprojected; all 13 anchor cities
  on screen; gate floors untouched). 23 campaign/ui baselines re-blessed after
  eyeballing. Critique: "coherent tilted plane, labels individually legible";
  compare vs old look: content preserved (edge-energy ratio 0.98), real perspective
  gained. **Battle byte-identical** (battle-camera-zoom + 3 terrain-elevation
  snapshots 0.0000% diff, seating tripwire `match=true`).
- **Pre-existing look items flagged by critique** (present in old baselines too;
  they land by name in photoreal slice `16d`): label anchors below-left of models,
  ROMA as army sub-label, low-contrast selection ring, roads pass through city
  models, glowing beach rim.

**Slice `05b` is DONE (committed, 2026-07-02) — the camera spine (`01`–`05`) is
COMPLETE.** The legacy 2.5D projector is deleted engine-wide; the renderer reads as
designed for a real perspective camera from scratch:
- **One projector:** `projectReal` took the canonical name **`projectWorld`**
  (`cameraWgsl.ts`); `projectGround`/`projectWorld3d`/`cameraSpace`/`perspectiveDepth`/
  `worldDepth3d`/`civsim*WorldDepth3d` deleted. Every per-pass `real` compile flag and
  every `realProjection(...)` WGSL rewriter is gone — the real WGSL body is the source
  text. Grep-proof: zero repo references to any legacy name (not even comments).
- **One depth convention:** `GPU_DEPTH_FORMAT = depth32float`, clear 0, reverse-Z;
  `gpuWorldDepthStencil` IS the reverse-Z contract (defaults `greater`/`greater-equal`);
  `gpuReverseZDepthStencil`, the `depth24plus` path, `chooseDepthFormat`, the caps
  depth probe, and `FrameShellOptions.reverseZ` deleted. `renderGraph` compares
  flipped to `greater`/`greater-equal`.
- **Camera uniform re-packed (48 floats / 192 B, layout documented in
  `cameraUniform.ts`):** matrices first, then the documented **survivor scalars** —
  `focus` (vec2, ground view centre; distance-keyed effects: terrain haze, water shore
  ramp, glint), `width`/`height` (label/marker screen offsets), `zoom` (chart-scale
  detail gate: campaign sea shimmer), `tilt` (= sin(camera3d pitch), replaces `cosP`
  in the shimmer tilt gate — value re-derived from the rig inside `cameraUniformData`),
  `time`, `zfar`, `sunAz`/`sunEl`. `cosP`/`cosYaw`/`sinYaw`/`perspective` are gone;
  `CameraSnapshot.camera3d` is REQUIRED and the CPU
  `worldToScreen`/`world3dToScreen`/`screenToWorld` are camera3d-only.
- **Fog/meadow axis pinned:** battle ground/grass fog + meadow ramps were keyed on
  legacy `cameraSpace(world).y`, which under the real battle camera (yaw = view
  azimuth) is the view's **screen-right** axis, not view-forward. Kept
  value-identical via the shared `chartDepthDist` WGSL helper (reconstructed from
  eye→focus) so blessed battle baselines stay byte-identical; re-aiming those ramps
  along true view-forward is a deliberate look change left to battle polish /
  `battle-map-reference`.
- **Lab surfaces migrated (nothing parked):** new `chartCamera3d(spec,
  viewportHeightPx)` in `camera3d.ts` resolves the chart-style framing (`{x, y,
  zoom px/world, pitch tilt-from-top-down, yaw}`) every renderer-lab route uses into
  real `Camera3DParams`; `createConfiguredShell` + all direct-shell routes go through
  it. The lab pick harness (`pickingDebug.ts` + `routeBattleInput`) converts
  css↔world through the SAME `chartCamera3d` (ray-cast
  `unprojectToPlaneZ`/`projectPoint`), and `__gpuBattleInput.project(x,y)` exposes
  the harness projection so the verification scene no longer hand-copies camera
  math. `fixtures/nested3d`, `terrainPass`, `particlePass` flipped to `projectWorld`.
- **Ownership visible:** `PROJECTION_IDENTITY = 'camera3d-viewProj-reverse-z'`
  (`cameraUniform.ts`) is published by `FrameShellStats.projection` and by every
  `__rendererLabStats` envelope; the `renderer-lab-routes` scene asserts every route
  reports the same identity, and `_renderer-contract.mjs` reads it (and the depth
  format) from source.
- **`minimapPass` stays 2D by design** (its own top-down `project()`, screen overlay)
  — the one recorded intentional exception from the legacy-collapse inventory.
- **Lab fixture gates re-derived for the real camera** (the fake projection drew
  world-Z at full scale at ANY pitch — geometrically impossible — so review
  fixtures tuned under it needed honest re-derivation, not blind re-blessing):
  soldier/entity/prop review routes moved to oblique chart pitches (1.0–1.26);
  occlusion samples are now DERIVED from the drawn fixtures (crowd-anchored ring
  azimuth for the army gate, canopy-centred tree control, `ModelShotGroundDepthPass`
  gives the campaign model shots a real ground depth-fill mirroring production so
  "hidden garrison" means occluded, not painted-over); the scene color bins gained
  `foliage`/`navy` (shaded canopy/cloth read outside the sunny-top-down bins);
  the grass model sheets re-framed (zoom 260/128) with deep-blade floors
  re-measured; the `campaign-ui` click test's fixture pick raced city-vs-road at
  Roma's node — city picks now scan city nodes directly (root cause, threshold
  untouched). The impossible-by-construction `bladeInstances >= 80` pin (1
  authored tuft × 13 blades) was re-pinned to the fixture.

**Slice `06` is DONE (committed on the bake-off branch, merged 2026-07-02) —
VERDICT: three.js WebGPU + TSL for the photoreal layer.** Both prongs passed the
30.4k-soldier + foliage hardware perf gate ~6× inside budget (bespoke 3.3–4.6 ms,
three.js 5.6–5.8 ms brute-force, both hold 60k — no veto); three.js won look parity
(real PMREM IBL, calmer Aegean water per unprimed critiques + neutral two-image
judges); harness survival PROVEN on three.js (same `__rendererLabStats`-style seam,
GPU timestamps under SwiftShader); anti-incumbency applied; tie-break not needed.
Full evidence + five recorded TSL pain points in the slice file's VERDICT section;
probe code + shots live on the merged bake-off history (`web/shots-bakeoff/`,
`bakeoffProbes.ts`, `web/src/three-probe/*` — spike, not production). The photoreal
ladder `07`–`17` was authored against the verdict via a three-draft
`/feature-slicing` synthesis.

**Exact next pickup point:** **`07` — photoreal foundation** (`packages/
photoreal-renderer` + harness re-tooling; lab-only, can start now). `04f` (30k perf
gate) lands **before `08b`** (the atomic battle flip). `04b` is descoped to decal
depth-bias only (pending David's confirm; billboards → `08`, LOD → `14b`).

**Active blockers / coordination warnings:**
- **`specs/battle-map-reference` — PAUSE / re-scope (needs David's confirm).** That
  spec is ~40 slices deep in a grass-architecture ladder tuned under the bespoke
  substrate that `08b`/`13` replace. Recommended split (recorded in slice `13`):
  this spec **owns battle look surfaces from `08b` on**; `battle-map-reference` is
  re-scoped to **target definition** (its target image — now copied to
  `assets/target-battle-map.png` here — the highland fixture, the environment
  presets already landed in `CIVSIM_ENVIRONMENTS`, and the `03b1` grass-field data
  contract that `13b` consumes); its compose gate is absorbed as `13d`; its 03B4*
  rejection ledger is required reading for `13b`. Its baselines are
  will-move-anyway. Do not continue implementing it meanwhile.
- **`04b` — descope to decal depth-bias only (needs David's confirm).** Its
  billboard items are re-homed to `08` (TSL billboards) and LOD-screen-size to
  `14b`; spending them on bespoke passes that `08b` orphans is double work. The lab
  pick harness migrates via `05b`/`08b`.
- **`three` is PINNED at `0.185.1`** until the ladder closes (`17`). WebGPU
  internals churn between minors — an upgrade is its own reviewed change with the
  full suite + perf gate as harness, never a ride-along.
- Env/weather presets live in `packages/game-renderer/src/environment/environment.ts`
  (`CIVSIM_ENVIRONMENTS`/`BATTLE_ENVIRONMENTS`) — the ONE preset owner every ladder
  slice extends, never forks.
- The photoreal north star is **`assets/target-battle-map.png`** (copied into this
  spec) + the `aesthetics` skill (Bronze-Age Aegean / Total War Saga), NOT generic
  PBR — the `compare-screenshots` target for every photoreal surface.

**Global TODO checklist:**
- [x] `01` — `camera3d` pure math library (renderer-core) + `/renderer/camera3d-probe` **(done)**
- [x] `02` — real depth + real projection proven on the **water route** (keystone) **(done — dome gone, reverse-Z on SwiftShader confirmed)**
- [x] `03` — zoom→camera rig (pure curve), battle + campaign **(done — additive `battleCameraRig`/`campaignCameraRig`; legacy `cameraForZoom` untouched until `04`)**
- [x] `04a` — flip the shared seam → **battle** engine-wide + 3D ray-cast picking **(done — per-pass `real` flag + reverse-Z shell, `Camera` delegates to camera3d, `cameraForZoom` deleted; decals/billboards/LOD resliced to `04b`–`04e`)**
- [x] `05a` — flip **campaign** to the real camera + campaign picking **(done —
      per-pass `real` + reverseZ shell, scale-faithful rig wiring, camera3d
      picking/labels; battle byte-identical)**
- [x] `05b` — **delete the legacy projection/depth scaffolding** **(done — SPINE
      COMPLETE: one projector `projectWorld`, one reverse-Z `depth32float`
      convention, zero flags, lab routes/pick harness/fixtures on
      `chartCamera3d`, projection identity published + asserted)**
- [ ] `04f` — 30k-soldier + foliage perf gate, hardware-only, standing
      (`slices/04f-30k-perf-gate.md`) — **before `08b`**
- [ ] `04b` — battle polish, **descoped to decal depth-bias only** (needs confirm;
      `slices/04b-battle-polish.md`; billboards re-homed to `08`, LOD to `14b`)
- [x] `06` — photoreal substrate bake-off → **VERDICT: three.js WebGPU + TSL**
      (`slices/06-photoreal-substrate-bakeoff.md`)
- [ ] `07` — photoreal foundation: `packages/photoreal-renderer` + harness
      re-tooling, spike promoted/deleted (`slices/07-photoreal-foundation.md`) —
      **can start now, in parallel**
- [ ] `08` — battle world adoption: `08a` parity lab world → `08b` atomic
      production flip (`slices/08-battle-world-adoption.md`)
- [ ] `09` — lighting core: physical sun + IBL + ACES from `CIVSIM_ENVIRONMENTS`
      (`slices/09-lighting-core.md`)
- [ ] `10` — physical sky + aerial-perspective ONE owner + presets
      (`slices/10-sky-atmosphere.md`)
- [ ] `11` — CSM sun shadows, deletes blob-shadow stand-in
      (`slices/11-csm-shadows.md`)
- [ ] `12` — photoreal sea: Gerstner-vs-IFFT spike → surface/foam/shore/glint;
      `seaLayer` owner (`slices/12-photoreal-sea.md`)
- [ ] `13` — photoreal terrain + foliage; absorbs battle-map-reference compose as
      `13d` (`slices/13-photoreal-terrain-foliage.md`)
- [ ] `14` — photoreal soldiers: materials, 30k LOD/impostors (absorbs `04e`),
      contact AO (`slices/14-photoreal-soldiers.md`)
- [ ] `15` — post chain: bloom + refine; ACES-vs-AgX decided here
      (`slices/15-post-chain.md`)
- [ ] `16` — campaign photoreal: `16a` register GO/NO-GO + flip, chart grade,
      entities, territory/labels (`slices/16-campaign-photoreal.md`)
- [ ] `17` — legacy deletion sweep + close-spec (`slices/17-legacy-sweep-close.md`)
- [ ] Confirm with David: `battle-map-reference` pause/re-scope (owner: `13`) and
      the `04b` descope (owner: `08`)

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
      │        ├── 05 FLIP campaign + collapse legacy projector   ✅ done (05a + 05b; SPINE COMPLETE)
      │        ├── 04f 30k-soldier + foliage perf gate            hardware-only — BEFORE 08b
      │        └── 04b battle polish (descoped: decal bias only)  needs-human-confirm
      │
06 PHOTOREAL SUBSTRATE BAKE-OFF                               ✅ done — VERDICT:
      │                                                        three.js WebGPU + TSL
   ===== PHOTOREAL LADDER (authored 2026-07-02 against the 06 verdict) =====
      │
07 substrate foundation + harness re-tooling                  can start NOW (parallel,
      │  packages/photoreal-renderer · spike promoted/deleted   lab-only)
      │
08 BATTLE WORLD ADOPTION (the seam flip)
      │  a: parity battle world in the lab (/renderer/photoreal-battle, overlay ports)
      │  b: ATOMIC production flip (BattleRenderer internals; no runtime flag)
      │
09 lighting core (physical sun + IBL + ACES from CIVSIM_ENVIRONMENTS; neutral albedos)
      │
10 physical sky + atmosphere (a: Hillaire sky · b: aerial-perspective ONE owner ·
      │                        c: presets through the sky model)
11 CSM sun shadows (deletes 08a blob-shadow stand-in; headline perf re-run)
      │
      ├── 12 photoreal sea      a: Gerstner-vs-IFFT spike · b: PBR surface · c: foam ·
      │                         d: shore blending · e: glint (pairs with 15a)
      ├── 13 terrain + foliage  a: ground PBR splat · b: grass at density (03b1
      │                         contract) · c: scenery/cliffs · d: compose vs target
      ├── 14 photoreal soldiers a: PBR materials · b: 30k LOD/impostors (absorbs 04e) ·
      │                         c: grounding AO
      │     (12/13/14 parallelizable in worktrees after 11; 12b needs 10's sky)
      │
15 post chain (a: bloom · b: refine; ACES-vs-AgX identity decided here)
      │
16 campaign photoreal (a: register GO/NO-GO spike + parity flip — campaign byte-
      │                identity deliberately ends here IF go · b: chart terrain/sea +
      │                painted grade · c: entities/scenery · d: territory/labels)
      │
17 legacy deletion sweep + close-spec (bespoke world passes, gerstnerField/
        WaterPlanePass WGSL, frameShell scope-down, grep-audit; refactor-clean +
        review + close-spec)
```

**Milestone after `05`:** entire engine on a real perspective camera, sim
untouched, playable. **Milestone after `08b`:** three.js owns battle world rendering
in production at parity — every later look slice lands in the real game. Everything
from `09` is photorealism, one visual variable per sub-slice with a named crop.

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
- **MSAA-safe:** every new/flipped bespoke pipeline keeps
  `gpuMultisample(shell.sampleCount)`; from `08b` the photoreal battle world's AA is
  owned by three (`antialias`) and the bespoke invariant retires surface-by-surface.

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
  water. The aerial-perspective slice (`10b`) **replaces all of them** with a
  single aerial-perspective source — a net deletion, not a fifth copy.
- **Water stays behind ONE seam.** Bespoke: `WaterFieldSource`. Photoreal battle
  (post-`12`): `seaLayer`'s displacement seam. Gerstner and any revived IFFT are
  swappable implementations of that seam, never parallel code paths.
- **Foliage (trees + grass) has ONE instanced/indirect owner**, shared with the LOD
  system — not per-species bespoke passes accreted over time.

Make ownership visible: publish the active projection/depth/environment identity in
`__rendererLabStats` so a test can prove every surface reports the *same* source of
truth (divergence was the original bug). If any slice starts widening into unrelated
behavior, slice it (`refactor-clean`): land the shared contract first, port consumers
in reviewable passes, then delete the stale path in the same milestone.

## Photoreal ladder invariants (07–17)

**Single owners** — every ladder slice must leave exactly one owner per concept;
`__rendererLabStats` identity fields make the ownership assertable:

- **Projection:** `camera3d`. `cameraBridge.applyCamera3d` is the ONLY way a three
  camera gets posed; `web/tests/photorealCamera.test.ts` pins the two matrix stacks
  equal.
- **Environment presets:** `CIVSIM_ENVIRONMENTS`/`BATTLE_ENVIRONMENTS` in
  `packages/game-renderer/src/environment/environment.ts`. New physical fields are
  ADDED there, never forked into a parallel table.
- **Water (battle, post-`12`):** `seaLayer.ts` — one seam, swappable displacement
  source (Gerstner / IFFT), never parallel water paths.
- **Atmosphere/aerial:** `10b`'s `aerialPerspective.ts` — one scatter/extinction
  source applied to every world surface; no material adds its own haze.
- **Crowd LOD policy:** `packages/crowd-runtime/src/lod.ts` semantics — `14b`
  consumes them; the three crowd never grows a second policy.
- **Stats seam:** the `__rendererLabStats` shape, backed by `renderer.info` +
  `trackTimestamp`, publishing `{ substrate, projection, environment }` identity.
- **Determinism:** animation keys off `PhotorealWorld.setTime` + seeded RNG; the TSL
  `time` node is banned in package code.
- **Version pin:** `three@0.185.1` until `17` closes the ladder.

**Scaffolding ledger** — everything that exists only to die, each with its named
deleter (a ladder slice is not done while its ledger row is still alive):

| Scaffold | Born | Deleted by |
|---|---|---|
| Spike: `web/three-{water,pbr,crowd}.html`, `web/src/three-probe/*`, `apps/renderer-lab/src/bakeoffProbes.ts` + `/renderer/{pbr-probe,water-pbr,crowd-perf}`, `web/bakeoff-shot.mjs`, `web/shots-bakeoff/` | 06 | **07** (promoted or deleted; nothing spike-shaped survives) |
| `web/src/three-probe/three-shims.d.ts` | 06 | **07** (`@types/three` dev-only) |
| Procedural equirect `scene.environment` stand-in | 07/09 | **10a** (physical sky feeds the IBL) |
| Parity `THREE.Fog` haze stand-in in `PhotorealBattleWorld` | 08a | **10b** (aerial-perspective owner) |
| Blob-shadow parity stand-in (decal replica) | 08a | **11** (real CSM) |
| Parity Gerstner-family sea shading in `seaLayer` | 08a | **12b–d** (photoreal surface; the seam survives) |
| Battle instances of bespoke world passes orphaned at the flip (`BattleGroundPass`, `BattleGrassPass`, `BattleHorizonPass`, `BattleGroundCuePass`, `BattleEffectLinePass`, inline `BattleTrianglePass`, battle `SkinnedCrowdPipeline`/`SoldierShadowDecalPass`) — classes live on for campaign/lab | pre-existing | **08b** orphans; **17** deletes (per `16a`'s campaign ruling) |
| Bespoke campaign world passes + `frameShell` world machinery + `WaterPlanePass`/`gerstnerField.ts` WGSL | pre-existing | **16a** orphans (if GO) → **17** sweeps; if NO-GO, recorded exception |

**Standing gates on EVERY slice `08b`→`17`** (each slice file references this list;
don't restate it, run it):

1. `cargo test --workspace` — sim firewall; zero diffs under `crates/**`.
2. `bun run --cwd web test:unit` (incl. the `photoreal*.test.ts` seam pins).
3. Full battle scene suite under SwiftShader, incl. the `battle-terrain-elevation`
   seating tripwire `match=true`.
4. Campaign scene suites **byte-identical until `16a`** (then deliberately
   re-blessed).
5. **Hardware perf gate:** `VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware
   VERIFY_BROWSER_CHANNEL=chrome node scene.mjs battle-perf-30k` — 30k+ soldiers +
   dense foliage, median ≤ ~33 ms **with every photoreal pass landed so far
   enabled**. Record the numbers in the slice file each run — this is the ladder's
   frame-time ledger (06 baseline ≈ 6 ms; `11` and `13b`/`14b` are the expected
   pressure points).
6. `screenshot-critique` as the required LAST visual check on every shot;
   `compare-screenshots` whenever a target exists (`assets/target-battle-map.png`,
   the aesthetics references, or the pre-slice look).
7. One visual variable per visual slice, with its named crop; all re-blessed
   baselines diffed individually, never blanket-overwritten.
8. SwiftShader is the capability-fallback enforcer, never a perf oracle — every
   adapter-gated feature (sky LUT `10`, CSM `11`, IFFT `12`) ships a fallback tier
   inside its seam, and the SwiftShader scene asserts *which tier ran* via the stats
   identity.

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
4. **"Make it photoreal" fog** → never one slice; `07`–`11` are shared foundations,
   every surface (`12`–`16`) is one visual variable per sub-slice with its own crop
   and critique/compare gate, against `target-battle-map.png`.
5. **Software-rasterizer CI hiding GPU-only failures** → SwiftShader is the
   weak-GPU proxy that enforces fallbacks (CSM/sky/IFFT); look + perf validate on
   hardware.
6. **Substrate misjudgment (bespoke vs three.js)** → retired in `06` by an
   evidence-based bake-off before any photoreal surface is committed. **Resolved:
   three.js WebGPU + TSL.**

## Known unknowns → where each resolves

- Reverse-Z + `depth32float` under SwiftShader → `02` (before any fan-out).
- One FOV/pitch curve keeps formations legible? → `03` curve + `04` play-test;
  fallback is a TW-style "RTS mode" FOV clamp at mid-zoom.
- Do soldier meshes/decals break under perspective? → `04` (upright/sort) + `11`
  (decal-shadow retirement) + `14b` (LOD).
- Photoreal substrate (bespoke vs three.js/TSL) → `06`. **Resolved: three.js.**
- Gerstner vs IFFT at a true horizon → `12a` technique spike; Gerstner is the
  guaranteed fallback. The current production water is a bespoke analytic Gerstner
  field (`packages/game-renderer/src/water/gerstnerField.ts`). The IFFT candidate is
  the upstream repo
  **[`Spiri0/Threejs-WebGPU-IFFT-Ocean`](https://github.com/Spiri0/Threejs-WebGPU-IFFT-Ocean)**
  (WebGPU compute, JONSWAP→IFFT, storage-buffer cascades). The water spec killed IFFT
  under the *fake* 2.5D camera because dispersion was invisible — that rationale is
  **void twice over**: the real horizon exists since `02`, and `06` picked three.js,
  so the old "replicate, don't port" caveat is dissolved — **porting is on the
  table** at `12a`.
- CSM / sky-LUT feasibility on SwiftShader → `10`/`11` verify; adapter-scaled
  fallback tiers inside their seams.
- Camera uniform buffer growth/alignment (12 → ~48+ floats, mat4 16-byte align) →
  `02` layout assertion test.

## Source material

Draft research (all three drafts): [WebGPU reversed-Z sample](https://webgpu.github.io/webgpu-samples/samples/reversedZ/),
[Reed — Depth Precision Visualized](https://www.reedbeta.com/blog/depth-precision-visualized/),
[NVIDIA depth precision](https://developer.nvidia.com/blog/visualizing-depth-precision/),
[Cascaded Shadow Maps (NVIDIA)](https://developer.download.nvidia.com/SDK/10.5/opengl/src/cascaded_shadow_maps/doc/cascaded_shadow_maps.pdf),
[JolifantoBambla/webgpu-sky-atmosphere (Hillaire LUTs, raw WebGPU)](https://github.com/JolifantoBambla/webgpu-sky-atmosphere),
[Spiri0/Threejs-WebGPU-IFFT-Ocean (three.js/TSL — portable since the `06` verdict; judged at `12a`)](https://github.com/Spiri0/Threejs-WebGPU-IFFT-Ocean),
[Total War tactical camera](https://lensviewing.com/total-war-camera-angles-up-on-zoom/).

Photoreal ladder research (union of the `07`+ drafts; per-slice pointers live in the
slice files): [Hillaire, *A Scalable and Production Ready Sky and Atmosphere
Rendering Technique*, EGSR 2020](https://sebh.github.io/publications/egsr2020.pdf) +
[sebh/UnrealEngineSkyAtmosphere](https://github.com/sebh/UnrealEngineSkyAtmosphere),
[TSL wiki](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language),
three.js `webgpu_*` examples (sky, custom fog, shadowmap CSM, ocean, postprocessing
bloom/TRAA, instancing), `CSMShadowNode` addon source, Tessendorf *Simulating Ocean
Water*, Ghost of Tsushima grass (GDC 2021), octahedral impostor notes.
