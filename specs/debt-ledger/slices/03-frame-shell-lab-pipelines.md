# 03 — frame-shell-lab-pipelines

**Contract unlocked:** `frameShell.ts` owns device, frame-graph assertions, MSAA
and timing only. The placeholder terrain, backdrop and marker pipelines that
existed for lab stand-ins are gone, and the frame command type no longer
carries fields production never sends.

## Seam

`packages/renderer-core/src/frameShell.ts`:

- Delete `terrainWgsl`, `WIDE_DETAIL_TERRAIN_STYLE`, `terrainBackdropWgsl`
  (163-345), `markerWgsl` (346-380), `makeTerrainPipeline`,
  `makeMarkerPipeline` (917-966), `uploadTerrain`, `uploadMarkers`, the
  `terrainRect` / `terrainBackdropRect` / `markers` / `markerLayer` command
  fields, the `MarkerInstance` and `MarkerLayerIntent` types, and the guard at
  591-600 that throws when markers arrive without a layer (a guard on a field
  nothing sends).
- `drawFrame` currently uploads and draws the terrain unconditionally
  (`frameShell.ts:591`); campaign hides it with `terrainRect: [0,0,0,0]`
  (`web/src/campaign/renderer.ts:576`). Remove both sides in the same commit.
- `FrameGraphCommands` becomes what production sends: clear, passes,
  precompute. Background is consumer-owned.

Consumers to update: `web/src/campaign/renderer.ts:576`; every surviving lab
route that passed `terrainRect`, `markers`, or `markerLayer` (`capabilities`,
`skinned-depth`, `world-camera`, `campaign-map`, `campaign-ui`,
`campaign-models`, `shared-prop-models`, `shared-standard-models`,
`frame-shell`); the routes that used `generatedMarkers` (router.ts:5571) as a
crowd stand-in now use `createSkinnedPipeline`.

Gate rows to delete in `renderer-lab-routes.mjs`: "frame commands require
explicit marker layer", "frame stats publish marker layer intent", fixture id
`markersMissingLayer` in the `frame-shell` route's rejected-fixture list.

Do not touch: `web/src/battle/renderer.ts:429` `markerLayer` stat — that is a
photoreal LOD stat (`battle-renderer-default.mjs:43` asserts
`"far-lod-impostor"`), unrelated to this pipeline.

## Decisions resolved here

Two commits: terrain/backdrop first (no gate edits), then markers (gate edits
and stand-in replacement). If the `frame-shell` route's `atmosphere ===
"aegean-sky-haze"` stat came from the backdrop pipeline, it becomes a constant
published by the shell.

## Delegated to the implementer

Naming of the trimmed command type fields.

## Verification

- G0. G-lab (`renderer-lab-routes`, `frame-shell` fixtures), G-camp at **0 px**
  on every `shots/campaign/*` (campaign never drew either pipeline), G-verify.
- `frameShell.ts` ≤ 650 lines.

## Must stay green

All campaign and lab scenes byte-identical.

## Feedback that would change this slice

None.
