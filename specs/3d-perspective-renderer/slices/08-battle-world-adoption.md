# Slice 08 — Battle world adoption (THE seam flip)

## STATUS: DONE — 08a + 08b (2026-07-02, this branch). three.js owns battle production.

**08b — the atomic flip landed.** `BattleRenderer.init()` constructs
`PhotorealBattleWorld` on the same `#battlefield` canvas; the `createFrameShell`
call, all bespoke battle pass instances (`BattleGroundPass`, `BattleGrassPass`,
`CampaignSceneryPass` battle instance, `BattleHorizonPass`,
`SkinnedCrowdPipeline`, `SoldierShadowDecalPass`, `BattleGroundCuePass`,
`BattleEffectLinePass`), and the inline `BattleTrianglePass` class + its WGSL
are DELETED from `web/src/battle/renderer.ts` (~480 lines gone; net −371 across
the flip). The public API did not move. Kept ABOVE the seam, unchanged:
frozen-frame caching (`fixedTime` key skips identical redraws), frozen-cue
filtering (`frozenSelectionGroundCues` + `preserveFrozenEffects`), the
`?debug=blocks` builder, CPU frame-perf split, and the device-lost fatal
surface (re-homed onto three's `GPUDevice.lost`). Pre-`ready` `setStatic`/
`setTerrain` calls are buffered and replayed at init (scene.ts calls them
synchronously after construction). Zero diff: `camera.ts`, `input.ts`,
`cameraRig.ts`, `scene.ts`, DOM minimap, HUD/banners/cards, picking, `crates/**`.

**stats() shape:** kept for everything scenes parse (`soldiers/expectedSoldiers/
lod/terrain/tacticalLines/performance.gpuTimeMs/camera/markerLayer/device`),
now backed by the photoreal seam and extended with the ownership identity
fields (`substrate/projection/environment`), `seating` (the heightfield
firewall, asserted in production now), and `depth: { owner: 'three-webgpu',
reversed }` read off the live renderer. Dropped (bespoke frame-graph concepts
with no three equivalent): `atmosphere`, `cameraContract`,
`skinnedCameraContract`, `phases`, `depth.format`.
`hasBattleWorldDepthContract` (`web/scenes/_renderer-contract.mjs`) was
re-derived to the photoreal identity + seating + overlay-seam contract
(campaign keeps the bespoke phase-graph contract until `16a`); scene asserts
re-derived: `drawCalls === 1` → `0 < drawCalls < 64` (batched, not
per-soldier), `atmosphere === 'aegean-sky-haze'` → `environment === 'golden'`,
`terrain.layer` → `'photoreal-battle-ground'`, and the `renderer-lab-routes`
source audit for `renderer.ts` now requires the photoreal seam and forbids
bespoke shells/pipelines. Two seam fixes surfaced by the gates:
`renderer.info` is reset by three's INTERNAL animation loop every browser
frame, so `PhotorealWorld.render()` snapshots drawCalls/triangles for stats
(new hazard, recorded below); `PhotorealWorldStats` grew `device`
("vendor / architecture / description" from `GPUDevice.adapterInfo`) for the
perf gate's hardware-adapter assert; grass stats grew the `environment`
identity.

**Verification (all green, 2026-07-02):**
- Full battle suite under SwiftShader: **zero baselines re-blessed** — every
  moved snapshot landed inside its existing budget. Biggest movement:
  `battle-camera-zoom` contact sheet 534 px (0.0173%); `battle-initial` 5 px,
  `battle-banner` 9 px, `battle-manual` 4 px, `battle-ai` 138 px (0.0135%),
  `battle-minimap-world-dpr2` 468 px (0.0114%), `battle-projectiles-dpr2`
  250 px, `battle-selection-dpr2` 343 px, `battle-cavalry-plow` 0 px. All
  lab-route battle scenes (terrain-3d/blockers/elevation/features, grass,
  map-reference, water-coastal/open-sea) byte-identical 0.0000%.
- `battle-terrain-elevation` seating tripwire `match=true` on all 3 maps; the
  production-page seating firewall additionally asserted every frame via
  `renderStats.seating.matches` (15,560 checked, span 3.8 m on map A).
- `battlePicking.test.ts` untouched-green (45/45 unit tests); campaign suites
  byte-identical (83 checks, 0.0000% snapshot movement); `menu-renderer-shell`,
  `full-game-rendering-performance`, `renderer-lab-routes` green;
  `water-silhouette` 8 ms SwiftShader budget red is the README-documented
  pre-existing red.
- `compare-screenshots` old-default (blessed baseline) vs new-default (flipped
  renderer, matched freeze tick 240): full-frame parityDistance **0.00002**,
  `formation-mid` centre crop **0.00001**, edgeEnergyRatio 1.00001 — verdict
  **parity / not worse**.
- **Perf (hardware apple/metal-3, `battle-perf-30k` re-run, 30,560 soldiers +
  548 scenery + vista 184.8k grass blades): GPU median 3.31 ms mid / 3.59 ms
  vista (p95 4.05/3.99), rAF 8.3 ms vsync-pinned — BEFORE the flip: 4.35/4.30.
  The photoreal world is ~25% faster than the bespoke frame.** The gate ran
  unmodified — it drives BattleRenderer, which is the point of the seam.
- Play-readiness (headful hardware Chrome, `?map=A`): top/mid/vista shots,
  real click-select (`[4]`), real drag-box (9 units), right-click order, HUD +
  unit card + banners + DOM minimap live, 96–108 fps. `screenshot-critique`
  run last on the new default + hardware shots.
- `cargo test --workspace` green; zero edits under `crates/**`.

**New TSL/three@0.185 hazard (add to the 06/07/08a list):**
4. **three's internal `Animation` loop resets `renderer.info` every browser
   frame** even when you never call `setAnimationLoop` — any stats read outside
   the render call's own task sees `drawCalls: 0`. Snapshot `info.render`
   counts immediately after `renderer.render()` (done in
   `PhotorealWorld.render()`).

**routeBattleLive disposition:** the lab route constructs its OWN bespoke
shell + passes (`createConfiguredShell` + `BattleTerrainPass` +
`SkinnedCrowdPipeline` + `BattleGroundCuePass` + `BattleMinimapPass`) and never
consumed `BattleRenderer`, so it keeps working unchanged on the bespoke path.
Its photoreal migration (or retirement) stays assigned to **`17`** with the
rest of the bespoke battle-pass sweep.

`packages/photoreal-renderer/src/battle/` is the parity battle world:
`battleWorld.ts` (`PhotorealBattleWorld`, the BattleRenderer-shaped API:
`setStatic/setTerrain/draw/drawTris/drawTacticalLines/stats/resize/setTime` on a
`BattleCameraSnapshot` — exactly what `renderer.ts::cameraSnapshot` produces),
`terrainLayer.ts` (backdrop + builtin terrain quads + ground mesh + horizon
blockers), `seaLayer.ts` (the ONE water seam: Gerstner `waterField` →
`waterShade` → `civsimWaterColor` → shore ramps as TSL, fed by
`bakeGerstnerWaves` — the shared wave source of truth), `foliageLayer.ts`
(grass tufts + scenery), `crowdLayer.ts` (per-class VAT crowd + blob-shadow
decal replica), `overlayLayer.ts` (ground cues / effect lines / debug
triangles on the unchanged `Float32Array` contracts; far-LOD markers re-homed
as camera-facing billboards — the 04c/04d item), `battleTsl.ts` (shared noise/
camera/environment node vocabulary). Every material is a literal TSL port of
the production WGSL (unlit, exposure/haze/sun baked exactly as the bespoke
passes; `NoToneMapping` + linear output = the bespoke non-sRGB swapchain).

**Geometry/scatter single owners (extracted, behavior-neutral):** the bespoke
passes and the photoreal world now consume the SAME CPU builders —
`buildBattleGroundMesh` (groundPass), `buildBattleTerrainGrass` (grassPass),
`buildBattleHorizonLayout` (horizonPass), `bakeGerstnerWaves` (gerstnerField,
quantised exactly as the WGSL literal prints), `BATTLE_RELIEF_EXAGGERATION`
(terrainFeatures; was private in BattleRenderer). Sim firewall intact:
`buildCrowdInstances` + `terrainHeightAt` are the only bridges, both unmoved.

**Lab route `/renderer/photoreal-battle`** boots the SAME wasm battle worlds
as the production page (`Game(0x5eed_c0de)` + `start_battle(A|B)`, the
production spawn path for `?count=` growth) and frames through the SAME shared
`Camera` (`window.__cam`), so compare-screenshots holds it against the
production battle at matched camera3d framing. Params: `?map/ai/ticks/count/
run/t/select/fx/debug=blocks/ref=1/zoom/cx/cy`.

**Parity evidence (matched `__cam` framing vs production `?map=A&ai=off`,
hardware, 1280×800, fixed t=0; capture pairs + diff artifacts under the
compare-screenshots protocol):**

| stop | framing | parityDistance | mae | px>32 | edgeEnergyRatio |
|---|---|---|---|---|---|
| mid | zoom 4.5 @ (0,−650) | 0.00012 | 0.004 | 0.004% | 1.0000 |
| top | zoom 1.5 (overview clamp) | 0.00022 | 0.006 | 0.005% | 0.9997 |
| vista | zoom 9.5 @ (0,−650) | 0.00252 | 0.091 | 0.12% | 1.0000 |
| sea | zoom 6 yaw π @ (600,−650) | 0.02596 | 1.884 | 1.66% | 1.0000 |

mid/top/vista are visually indistinguishable (crowd pixel-for-pixel after the
MSAA fix below). The sea divergence is wave-PHASE pattern only (per-wave phase
offsets hash `sin()` in f32 WGSL vs f64 JS): same statistics, same palette,
same haze dissolve, same shore band — edge energy and luminance identical to
4 decimal places. VERDICT: **parity / not worse** (neutral two-image judges +
critique quoted below in Verification).

**Perf ledger row (hardware apple/metal-3, chrome, 1280×800):**
`/renderer/photoreal-battle?count=30500` (30,560 soldiers + 548 scenery + full
sea + grass; vista fill 16,800 tufts / 184,800 blades = the production floors)
= **GPU 3.3–3.9 ms mid/vista, median rAF 8.33 ms vsync-pinned** — next to
production `battle-perf-30k` 4.35/4.30 ms and `photoreal-crowd` 5.29 ms;
~8.5× inside the 33 ms budget with the FULL parity world.

**Gate scene:** `web/scenes/battle/battle-photoreal-parity.mjs` (SwiftShader
green, baseline `web/shots/battle/photoreal-parity.png`): identity fields
`{substrate, projection, environment:'golden'}`, soldier count identity + floor,
the seating tripwire (`seating.matches === true` — every instance elevation
equals the shared `terrainHeightAt` sample, span > 0.5 m on map A's relief),
sealed-edge/scenery/grass floors, overlay-port contracts (gold cues + effect
lines), crowd/gold pixels on screen, fixed-`setTime` byte-determinism, and the
hardware 30.5k ≤ 33 ms leg (skipped by name under SwiftShader).

**New TSL/three@0.185 hazards recorded (add to the 06/07 hazard list):**
1. **`reversedDepthBuffer` REVERSES the sorted render lists** —
   `RenderList.sort()` runs the painter sort then `list.reverse()` when
   reversed depth is on, inverting `renderOrder` semantics for opaque AND
   transparent lists (a -10 background quad draws LAST and covers the world,
   with zero validation errors). Fix: compensating comparators via
   `renderer.setOpaqueSort/setTransparentSort` that pre-invert every axis
   (battleWorld.ts owns them).
2. **Default 4× MSAA (`antialias: true`) washes out the sub-pixel crowd** —
   at gameplay zoom soldiers are 1–2 px and multisample resolve averages them
   toward the ground; the production battle shell renders at sampleCount 1.
   `PhotorealWorld.create` grew an `{ antialias }` option; the battle world
   passes false. (Judged per-surface at 08b+; not a global photoreal setting.)
3. **`THREE.Fog` applies at overview distances the bespoke frame never fogs** —
   the top-down rig parks the eye ~3.2 km out (2×min map side), so a
   "gameplay-range" fog bleaches crowd/scenery from above. The haze stand-in
   ranges start past the rig maximum (3400→8200) until `10b` replaces it with
   the one aerial-perspective owner.

**Scaffolding ledger rows born here (README table):** `THREE.Fog` haze
stand-in (dies at 10b), blob-shadow decal replica (dies at 11), parity
Gerstner-family sea shading in `seaLayer` (dies at 12b–d; the seam survives).

**screenshot-critique (unprimed, on the route shots + crops): "needs polish
passes" — and every finding is PRE-EXISTING production look, verified present
pixel-for-pixel in the matched production captures, each already owned by a
named ladder slice:** hard map-edge/backdrop void + two-tone grass seam →
`13a/13d` (terrain compose), low-poly repetitive peaks on a flat apron →
`13c` (scenery/cliffs), noisy dithered water + pale horizon dissolve → `12b–e`
(photoreal sea; the dissolve is the honest haze-to-sky ramp), grove-wide blob
shadows / no per-tree grounding → `11` (CSM), flat hazy lighting → `09`/`10`,
thin single-file formations = the real sim spacing at rest (not a render
defect). One critique miss on our side: the "missing selection marker" crop
was mis-framed; the gold glow is verified by the scene's gold-pixel check on
both adapters and by direct crop inspection. Nothing here is an 08a
regression — 08a's contract is parity, not a new look.

**Deliberately NOT ported (production-only behavior that stays above the
seam at 08b):** frozen-frame caching/`fixedTime` cue filtering
(`frozenSelectionGroundCues`) and the render-position smoothing — both live in
`BattleRenderer`/`scene.ts` and keep working unchanged when 08b swaps the
internals; the world renders what it is handed.

## Contract unlocked

three.js owns **battle world rendering in production**. Every later look slice lands
directly in the real game — real overlays, real UI, real perf — instead of accumulating
in a lab fork (the exact failure mode `battle-map-reference`'s lab-first grass ladder
demonstrated). The adoption seam is `web/src/battle/renderer.ts::BattleRenderer`'s
**public API** (`setStatic / setTerrain / draw / drawTris / drawTacticalLines / stats /
resize`) — `scene.ts`, `input.ts`, HUD, and every battle scene talk only to that class,
so the substrate swaps **behind it**; the class name, file, and API do not move.

**Prereqs:** `07`; **`04f` (30k perf gate scene) and `05b` (legacy projector collapse)
land BEFORE `08b`** — 04f is the perf instrument this ladder re-runs, 05b keeps "no
dual projection path" true so 08b deletes passes, not paths.

## API seam

**08a — parity battle world in the LAB.**
`packages/photoreal-renderer/src/battle/battleWorld.ts` — `PhotorealBattleWorld`
accepts the exact production inputs `BattleRenderer` already holds (terrain grid +
tint + heightfield from `setTerrain`, `crowd-runtime` instance buffers via the same
`buildCrowdInstances` output, grass-field data, scenery placements, sea/horizon config,
`BattleEnvironment`) and renders the **full battle world at parity look**: same olive
terrain register, same grass/tree silhouettes, Gerstner-family sea as a TSL layer,
the proven VAT crowd, haze via `THREE.Fog` matched to `hazeColor` (stand-in, dies at
`10b`), and a **blob-shadow parity stand-in** (decal replica; dies at `11`). Soldiers
seat via the same CPU-side heightfield sampling — the sim firewall does not move.

**Overlay ports land here, not at the flip:** ground cues/selection (depth-tested
ground decals, gold glow per aesthetics rule 6), effect lines + far-LOD markers
(camera-facing TSL billboards — this re-homes bespoke `04c`/`04d`), debug
triangles/blocks — as TSL layers with explicit `renderOrder` + depth config mirroring
the old `world-decal`/`overlay` phase order in `frameGraphContract.ts`. Same
`Float32Array` upload contracts (`drawTacticalLines` inputs unchanged). The 06 verdict
priced this as mechanical (hardest pass — the VAT crowd — ported in ~330 lines).

New lab route `/renderer/photoreal-battle` (loads the same fixture worlds as
`/renderer/battle`).

**08b — ATOMIC production flip (mirrors `04a`; no runtime substrate flag — one owner).**
`BattleRenderer.init()` constructs `PhotorealBattleWorld` on **the same canvas**
(`this.canvas`); the `createFrameShell(...)` call + bespoke world/decal/overlay pass
construction is **deleted from `renderer.ts`**. One canvas, one device (three's own) —
no dual-canvas compositor ever exists in production. `BattleRenderer.stats()` keeps its
shape (scenes keep parsing it) backed by the photoreal stats seam. **Zero diff:**
`web/src/shared/camera.ts`, `input.ts`, `cameraRig.ts`, the DOM minimap
(`#minimap` 2D canvas in `scene.ts` — never a GPU pass), HUD/banners/cards, picking
(CPU `camera3d` ray-cast). Bespoke pass *classes* survive for campaign/lab until
`16`/`17`; battle's instances of them are orphaned here.

## What the human can run / see

08a: `/renderer/photoreal-battle` side by side with `/renderer/battle`.
08b: the real game — `bun run dev`, quick battle; every existing battle route/scene.

## Verification

**08a gates:**
- `compare-screenshots` production-battle vs photoreal-battle at matched `camera3d`
  framing — verdict must be **"parity / not worse"**.
- NEW scene `web/scenes/battle/battle-photoreal-parity.mjs` (SwiftShader): stats
  identity, soldier count, seating heights vs heightfield (mirrors the
  `battle-terrain-elevation` tripwire mechanics).
- Hardware perf on the route ≤ 33 ms with the full world. `screenshot-critique` last.

**08b gates (the standing set begins here — see README "Photoreal ladder invariants"):**
- Full battle scene suite under SwiftShader (`battle-renderer-default`, `battle-smoke`,
  `battle-input`, `battle-camera-zoom`, `battle-selection`, `battle-lod`,
  `battle-minimap`, `battle-terrain-*`, effects/grass scenes) with **deliberate
  re-bless** — diff each moved `web/shots/battle/**` baseline, eyeball representatives.
- `battle-terrain-elevation` seating tripwire **`match=true`** (heightfield firewall).
- `web/tests/battlePicking.test.ts` untouched-green (picking never moved).
- Campaign suites **byte-identical**.
- `compare-screenshots` old-default vs new-default full frame — "not worse" is the
  no-regression bar. Crop `formation-mid` (center of `battle-renderer-default`).
- **`battle-perf-30k` (04f's scene) re-pointed at the flipped renderer**, hardware
  ≤ 33 ms; record before/after in this file. `screenshot-critique` last.
- **Visual variable: none intended** (substrate swap at constant look). Any drift is
  recorded and judged, not silently blessed.

## Must stay green

`cargo test --workspace`; zero edits under `crates/**`; `buildCrowdInstances` +
`terrainHeightAt` are the only sim→renderer bridges and neither moves. Between 08a and
08b the default path is untouched — no user-visible regression window exists.

## Coordination / risks

- **`04b` is descoped to decal depth-bias only** (needs David's confirm — it is an
  authored slice): its billboard items re-home here (TSL billboards), its
  LOD-screen-size item re-homes to `14b`. Don't spend bespoke effort on passes this
  slice orphans.
- Lab `routeBattleLive` + `pickingDebug.ts`: re-point at production `BattleRenderer`
  or retire — assign explicitly here or at `17`, don't strand it.
- MSAA: three owns `antialias` — the bespoke `gpuMultisample` invariant retires for
  battle here.
- THE risk slice. Mitigations: 08a proved the whole world before the flip; overlays
  are the only new code at 08b; the flip is one commit, revertable.

## Research

three `renderOrder`/`depthTest`/`depthWrite` docs for overlay layering;
`webgpu_instancing_morph` / `BatchedMesh` examples for markers; the 06 pain-point list.

## Human feedback that would change this slice

If the 08a parity compare reads worse on any surface, fix that surface in the lab
before flipping. A play-test veto ("feels off at mid-zoom") blocks 08b. Non-blocking
checkpoint: open old/new side-by-side with `preview-shots` (~5 min), decide on the
evidence, record, proceed.
