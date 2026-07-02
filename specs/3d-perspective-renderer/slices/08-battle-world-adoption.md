# Slice 08 — Battle world adoption (THE seam flip)

## STATUS: 08a DONE (2026-07-02, this branch) — 08b (the atomic production flip) is next

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
