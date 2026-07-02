# Slice 04 — Flip the shared seam → BATTLE engine-wide + 3D ray-cast picking

## Status (2026-07-02): resliced — `04a` landed, `04b`–`04e` deferred

`04a` (projection + depth flip of every battle world-depth pass + CPU camera3d
wiring + 3D ray-cast picking) is **committed**. The decal-re-seat (`04b`),
particle/marker billboards (`04c`/`04d`), and LOD screen-size (`04e`) sub-slices
below are deferred as clean follow-ups — the projection is done; those are polish.

**One architectural divergence from the "API seam" section below (deliberate, and
it is the shipped design):** step 1 said to rewrite the *bodies* of
`projectGround`/`projectWorld3d` and make the painter-depth helpers return 0. That
would flip campaign too (they share the WGSL), which must not happen until `05`.
Instead — exactly like slice 02's water pass — **each battle-owned pass compiles a
`real` WGSL variant that calls `projectReal(...)` and swaps to
`gpuReverseZDepthStencil`, and battle's shell opts into `reverseZ`.** The shared
`projectGround`/`projectWorld3d`/`civsim*WorldDepth3d` bodies are UNTOUCHED, so
campaign stays byte-identical on its own legacy shell. The one real projector
collapses the legacy fns + the per-pass `real` flag at the end of `05`, when nothing
consumes the legacy path (that collapse landed — `05b`).

**04a evidence (committed 2026-07-02, `785d2ee9`; spec correction `5289d54e`):**

- **Per-pass `real` flag (NOT rewriting the shared `projectGround`/`projectWorld3d`
  bodies).** Each battle-owned pass compiles a `real` WGSL variant that calls
  `projectReal(...)` and swaps its depthStencil to `gpuReverseZDepthStencil`.
  Battle sets `real: true`; campaign builds its own shell + pass instances and never
  sets it (stays byte-identical on legacy `depth24plus`). Flags added to
  `skinnedPipeline`, `soldierShadowPass`, `groundPass`, `grassPass`, `horizonPass`
  (incl. its `WaterPlanePass` ocean planes), `groundCuePass`, `effectLinePass`,
  `campaign/sceneryPass` (battle mode), the inline `BattleTrianglePass`, and the
  `frameShell` builtin terrain/backdrop/marker shaders (gated on the shell's
  `reverseZ`). Battle shell opts into `reverseZ: true`. `soldierShadowPass` drops
  the `0.72` y-squash when real.
- **CPU: `camera3d` is the ONE owner.** `web/src/shared/camera.ts` `Camera` was
  rewritten to delegate every screen↔world mapping to `camera3d`
  (`projectPoint`/`unprojectToPlaneZ` against ground z=0); `worldToScreen`/
  `screenToWorld`/`clampView`/`zoomAt`/`panPixels`/`panWorld` all go through a
  `params(): Camera3DParams` built from `battleCameraRig`. `scene.ts` feeds the rig
  (`camera.setRig(range,bounds)`); `renderer.ts` builds `CameraSnapshot.camera3d`
  and opts the shell into reverse-Z. **`cameraForZoom` + `CameraRig` +
  `BATTLE_CAMERA_RIG_LIMITS` DELETED** (only consumers were `scene.ts` +
  `cameraRig.test.ts`); the two-rig seam is collapsed. Picking firewall held:
  `input.ts` call sites + `pickUnit(wx,wy)` + `terrainHeightAt` untouched.
- **Verified:** typecheck + 34 unit tests green (incl. new
  `web/tests/battlePicking.test.ts` — worldToScreen∘screenToWorld round-trips
  <0.3 px across zoom stops; a centroid click selects its unit). Seating tripwire
  `battle-terrain-elevation` `match=true` on all 3 fixtures (heightfield firewall
  intact). Full `battle` scene suite green under SwiftShader, no page/validation
  errors. Depth-sort/upright confirmed (screenshot-critique of the camera-zoom
  contact sheet: smooth top-down→mid→vista, a proper low-oblique cinematic vista
  with upright, correctly depth-sorted soldiers; selection-ring ground decal seats
  on terrain; HUD/banners/minimap intact). Campaign frozen scenes byte-identical
  (map-alignment + campaign-visual diffs 0.003–0.08%, within SwiftShader noise).
  All moved `web/shots/battle/**` (24 baselines) re-blessed deliberately after
  eyeballing representatives. Re-derived the `battle-camera-zoom` behavioral
  asserts and the `hasBattleWorldDepthContract` depth-format expectation to the
  camera3d/reverse-Z convention.
- **Deferred follow-ups at landing:** `04b` decal depth-bias (later CANCELLED —
  superseded, see `04b-battle-polish.md`), `04c`/`04d` billboards (re-homed to
  `08a`), `04e` LOD screen-size (absorbed by `14b`), lab `routeBattleLive` +
  `pickingDebug.ts` migration (landed in `05b`), 30k perf gate (landed as `04f`).

## Contract unlocked

The **entire battle renderer** is on the real perspective camera + real depth;
picking is a 3D ray-cast; the battle is **playable** at every zoom. This is the
fan-out — and the deepest-risk slice — but it is mechanical because the seam is
centralized and already proven on the water route in `02`.

## API seam

**Packages:** `renderer-core`, `game-renderer/battle`, `web`.

1. **GPU seam bodies:** re-implement `projectGround`/`projectWorld3d` in
   `cameraWgsl.ts` to `cam.viewProj * vec4f(world, z, 1)` and make
   `worldDepth3d` / `civsimBattleWorldDepth3d` / `civsimCampaignWorldDepth3d`
   **return 0 (vestigial)** — keeping the *signatures* so all ~20 passes compile
   unchanged. The `normalizedDepth` argument at every call site becomes ignored
   (deleted in `14`).
2. **Depth flip (battle shells):** `pipelineContracts.gpuWorldDepthStencil` emits
   reverse-Z (`greater`/`greater-equal`) + `frameShell` clears `0` on
   `depth32float`. All battle world-depth passes share one buffer and flip
   **together** — this is one atomic milestone.
3. **CPU trio:** rewrite `worldToScreen`/`world3dToScreen` via
   `camera3d.projectPoint`; rewrite `screenToWorld` via `unprojectToPlaneZ(ndc, 0)`
   (ground plane). Rewrite `web/src/shared/camera.ts` `Camera` to **delegate** to
   `camera3d` (delete its duplicated `cosP`/`perspective` math); feed it the `03`
   rig. `battle/pickingDebug.ts` (`cssToBattleWorld`/`battleWorldToCss`) becomes
   matrix-based.
4. **Picking firewall:** `web/src/battle/input.ts` keeps calling
   `camera.screenToWorld(px,py)` and `sink.pickUnit(wx,wy)` — signatures unchanged;
   only the *mapping* becomes ray→z=0. Sim's `pickUnit` untouched.

**Blast radius to re-verify** (all consumers of the shared projection/depth):
`skinnedPipeline`, `soldierShadowPass`, `groundPass`, `terrainPass`, `horizonPass`,
`grassPass`, `groundCuePass`, `effectLinePass`, `particlePass`, `terrainFeatures`,
`terrainScenery`, `mapCatalog`, `frameShell` builtin terrain/marker/backdrop
shaders, `fixtures/nested3d`. `minimapPass` uses its own top-down `project()` (not
the world camera) — **leave it 2D** (intentional).

**Fog audit — sub-slices if the flip surfaces real work (one variable each):**
- **04a** projection + depth flip; soldiers verify upright + depth-sort (expected
  pass — they're real 3D meshes).
- **04b** decal re-seat: shadows/ground-cues/selection are flat ground quads at
  z≈elevation; under real depth add a pipeline `depthBias`/`depthBiasSlopeScale` so
  they sit on terrain without z-fighting. The `0.72` y-squash in `soldierShadowPass`
  is a fake-projection artifact to remove.
- **04c** particles → camera-facing billboards from `cam.eye` + view right/up.
- **04d** markers + far-LOD impostors → billboards.
- **04e** LOD screen-size: `assignCrowdLodsByDistance` uses `zoom×distance`; replace
  with real projected screen-height (∝ 1/depth). Keep a **min-size floor** so
  distant units stay readable (a deliberate non-physical clamp, per RTS research).

## What the human can run / see

`/renderer/battle-terrain-3d`, `/renderer/battle-live`, `/renderer/skinned-depth`,
`/renderer/lod-tiers`, scene `web/scenes/battle/battle-camera-zoom.mjs`.

## Verification

- **Unit (no cargo):** picking round-trip — for a grid of pixels,
  `worldToScreen(screenToWorld(px)) ≈ px` on the ground plane at several zoom/pitch
  stops; a fixture click at a unit centroid selects that unit
  (`pickingDebug.pickBattleUnit` fed by a real camera). Depth-sort: two soldiers at
  different distances sort correctly under reverse-Z. LOD monotonicity
  (`routeLodTiers` assertions) re-derived for perspective distance, incl. the
  min-size floor.
- **Visual variable = do soldiers stand upright and depth-sort correctly under
  perspective (no z-fight, no see-through)?** Crop = a formation on a slope
  (`/renderer/battle-live`). `screenshot-critique` **required last check**;
  `compare-screenshots` old-vs-new (expected different — judged "playable, not
  broken").
- **Re-bless every battle snapshot deliberately** (`web/shots/battle/**`).
- The **`battle-terrain-elevation` seating gate must stay byte-identical**
  (`match=true`) — proves the heightfield firewall intact.
- **Perf** (hardware): crowd `gpuTimeMs` at full-army N within budget.

## Must stay green

- `cargo test --workspace`; zero edits under `crates/**`; `terrainHeightAt` /
  `heightField` logic untouched.
- Campaign still renders on the legacy path this slice (it flips in `05`) — its
  frozen scenes stay byte-identical until then.

## Human feedback that would change this slice

Play `/renderer/battle-live` — selection, drag-box, zoom feel across top-down / mid
/ vista. "Playable" is the bar. **Non-blocking** but this is the gameplay-legibility
moment: open with `preview-shots`, ~5 min; if silent, decide on the round-trip +
critique evidence, record here, proceed. Feedback that the mid-zoom band is illegible
→ apply the `03` RTS-mode FOV clamp.
