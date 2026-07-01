# Slice 08 — Battle world adoption (THE seam flip)

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
