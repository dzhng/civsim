# 18 — campaign-builders-home

**Contract unlocked:** the campaign renderer is an orchestrator; layout
builders live beside the passes they feed; test fixtures are not in the app
entry; the campaign save has one owner.

## Seam

- `web/src/campaign/renderer.ts:876-2015` (49 free functions) →
  `packages/game-renderer/src/campaign/entityFrame.ts` (`buildEntityFrame`,
  markers, road carts), `labels.ts` (city/army/faction labels),
  `scenery.ts` (`campaignScenery`, `buildCampaignSceneryCandidates`,
  `selectRegionalScenery`, reservations). `testStageScenery` →
  `packages/game-renderer/src/fixtures/`.
- `draw()` 339-357: the 16 null guards become one
  `private passes: CampaignPasses | null` set by `init()`.
- `stats()` 632-696: keys read by scenes are frozen (add, never rename):
  `depth`, `phases`, `visibleLabels`, `cameraContract`, `labelLayer`,
  `cityEntities`, `labelVertices`, `armyEntities`, `waterLayer`, `cloudQuads`,
  `sceneryStats`, `sceneryQuads`, `fogSources`, `fogEnabled`, `factionView`,
  `borderSegments`, `visibleLabelNames`, `visible{City,Army,Faction}LabelRects`,
  `visibleCardRects`, `territoryPixels`, `seaLanes`, `sceneryCandidateStats`,
  `scenery`, `roadTriangles`, `roadJunctionCaps`, `performance`,
  `lineSegments`, `labelCollisionCulledLabels`, `labelAtlas`.
- `web/src/main.ts:143-415` (`buildTestCampaign`, `buildHandoffCampaign`,
  `buildAlignmentCampaign`, bitmaps, `smoothNoise`, `clampByte`) →
  `web/src/campaign/fixtures.ts`.
- `web/src/campaign/save.ts` exports `CAMPAIGN_SAVE_KEY`, `readCampaignSave()`,
  `writeCampaignSave()`; `main.ts:136` and `campaign/scene.ts:53` consume it.
  The write-only `-auto` slot (no reader found) is deleted.
  `web/scenes/campaign/campaign-save-load.mjs:30` keeps its literal (scenes
  cannot import TS) with a comment naming the owner.
- Duplicated helpers single-owned: `ordinal` (scene.ts:1414 / renderer.ts:1395),
  `occupiedCityForArmy` (scene.ts:709 / renderer.ts:1339), `roundMs`
  (battle/renderer.ts:638 / campaign/renderer.ts:876), `hash2`.

## Decisions resolved here

Builders are pure functions in game-renderer; the renderer file holds
orchestration only (target ≤ 800 lines).

## Delegated to the implementer

Exact split of the 49 functions across the three files.

## Verification

- G0. G-camp at **0 px**; `campaign-handoff`, `campaign-map-alignment`,
  `campaign-production` (fixture consumers); `campaign-save-load` (save-key
  hazard).
- Stats keys: a vitest snapshot of `Object.keys(stats())` pinned at HEAD.

## Must stay green

All campaign scenes.

## Feedback that would change this slice

None.
