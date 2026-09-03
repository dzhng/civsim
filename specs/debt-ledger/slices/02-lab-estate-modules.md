# 02 — lab-estate-modules

**Contract unlocked:** the bespoke battle look estate no longer exists in the
tree; `game-renderer` holds only the campaign renderer and the CPU data-builders
photoreal consumes. A closed-spec record explains what went and why.

## Seam

Delete (each must have zero importers after slice 01; typecheck is the proof):

- `packages/game-renderer/src/battle/`: `grassPass.ts`, `terrainPass.ts`,
  `minimapPass.ts`, `particlePass.ts`, `pickingDebug.ts`, `crowdPass.ts`,
  `effectLinePass.ts`, `groundCuePass.ts`.
- `packages/game-renderer/src/models/shared/grassModels.ts` +
  `web/tests/grassModels.test.ts`; `web/tests/crowdPass.test.ts`. Keep
  `unitInfoLayout.ts`.
- `packages/game-renderer/src/renderGraph.ts`, `perfReport.ts`.
- `packages/game-renderer/src/water/`: `waterPlanePass.ts`, `waterField.ts`,
  `waterMaterialWgsl.ts`, `fieldWaterWgsl.ts`. Keep `gerstnerField.ts`
  (`seaLayer.ts:23`), `waterShoreRamp.ts` (`horizonPass.ts:10`,
  `photorealSea.test.ts:7`), `waterPalette.ts` (`mapPass.ts:5`,
  `territoryPass.ts:4`). If `waterField.ts` types are imported by
  `gerstnerField.ts`, fold them in rather than keeping the file.
- GPU halves of shared builders: `groundPass.ts:40-215` (`BattleGroundPass`,
  `GROUND_WGSL`), `horizonPass.ts:38-163` (`BattleHorizonPass` + WGSL). The CPU
  builders (`buildPhotorealBattleGroundMesh`, `buildBattleHorizonLayout`) stay.
  `horizonPass.ts:30 HAZE` may be read by the CPU layout builder (238-271);
  leave it for slice 06 to own.
- `web/src/battle/uiLayer.ts`, `web/src/campaign/uiLayer.ts`; the
  `campaign-ui` route mounts the real `CampaignHud` directly. Keep
  `UnitCardsReact` (used by `card-bar`).
- `PhotorealBattleWorld.create` options `meadowFocusRing` and
  `disabledGroundDetail` are retired in slice 10, not here (photoreal is lane
  R's later territory; this slice stays inside game-renderer, renderer-core
  consumers, and web/src shims).

Keep, explicitly: `fixtures/nested3d.ts`, `photorealEarthDistance.ts`,
`terrainFeatures`, `grassField`, `terrainScenery`, `windSignal`,
`meadowPalette`, `mapCatalog`, `factionColors`, `unitInfoLayout`,
`skinnedPipeline`, `soldierShadowPass`.

## Rationale record (write in this slice)

`specs/done/renderer-lab-exhibits.md`, in close-spec's voice:

- **Retired at** `<this commit>`; last tree where it lived `08d8c5fe`. Git
  history is the archive; no relocation, no flag, no shim.
- **What:** the raw-WebGPU battle exhibit estate — the grass option matrix
  (`grassPass`, 19×6×4×5 families nobody set; `grassModels`), `terrainPass`,
  minimap/particle/picking/crowd/effect-line/ground-cue passes, the
  render-graph skeleton and perf report, the open-sea/field water GPU chain,
  the GPU halves of `groundPass`/`horizonPass`, frameShell's terrain/backdrop/
  marker pipelines (slice 03), the web `uiLayer` HUD shims, the three copied
  live-battle routes, the five probe routes, seven scenes and their baselines.
- **Why:** the 3d-perspective-renderer decision (16a NO-GO) made battle =
  three.js photoreal and campaign = bespoke WGSL permanent. Everything above
  had zero production importers and existed to exhibit a battle renderer that
  will not ship. The contract value that mattered (frame phases, depth roles,
  camera identity, decal depth-read, overlay order) is asserted on production
  campaign passes, `frameGraphContract.ts`, and the `frame-shell`,
  `world-camera`, `campaign-*`, `skinned-*` routes.
- **What survived and why:** CPU data-builders (photoreal's inputs); Gerstner/
  shore-ramp/palette water (photoreal sea, campaign map); `nested3d` (the
  hostile-order world-camera fixture); `UnitCardsReact` (card-bar).
- **Invariant:** a lab route exists only to pin a contract a production
  renderer honours; a pass with no production consumer is deleted, not
  exhibited. A new look ladder goes under photoreal with its own gate.
- **Where the invariants went:** seating tripwire → `battle-photoreal-parity`
  (four maps, production world stats); terrain builder invariants →
  `web/tests/terrainFeatures.test.ts`; decal depth-read → `campaign-ui` gate
  row; frame phases/depth roles → `frame-shell` route + `frameGraphContract.ts`.
- **Pointers:** `specs/done/3d-perspective-renderer/README.md` (16a and the
  "Kept" list this supersedes — add a one-line pointer there, and note that
  its "battle-terrain-elevation seating tripwire" gate is now
  `battle-photoreal-parity`),
  `specs/done/meadow-polish.md` (the ring architecture the meadow route
  rehearsed), `specs/done/water/README.md`.

## Delegated to the implementer

Order of deletions; whether `waterField` types fold into `gerstnerField` or die.

## Verification

- G0 (typecheck catches every stale import).
- G-lab, G-photo (grassField/meadowPalette consumers), G-camp.
- `_renderer-contract.mjs` still loads (reads `depthContract.ts`,
  `frameGraphContract.ts`, `cameraUniform.ts`, photoreal `stats.ts` — all
  survive).
- `grep -rn "slice\|exhibit" specs/done/renderer-lab-exhibits.md` reads as a
  rationale, not a file list.

## Must stay green

All surviving scenes byte-identical. Expected production LOC delta ≈ −6,000.

## Feedback that would change this slice

None expected; the decision is David's.
