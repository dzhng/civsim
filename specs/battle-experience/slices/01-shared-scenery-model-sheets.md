# Slice 01: Shared Scenery Model Sheets

## Contract

Reusable scenery props have shared ownership and shared review evidence. Trees,
rocks, mountains, carts, shrubs, and any generic terrain props should be modeled
under `packages/game-renderer/src/models/shared/` and baselined under
`web/shots/models/shared/props/`, not campaign-only prop folders. Campaign and
battle must reference one shared prop registry rather than copying model
definitions into surface-specific code.

## API Seam

- Source module:
  `packages/game-renderer/src/models/shared/sceneryPropModels.ts`
- Shared prop registry:
  `packages/game-renderer/src/models/shared/sceneryPropRegistry.ts` or an
  equivalent module that names prop ids, builders, review groups, and default
  scale hints.
- New or revised visual scene:
  `web/scenes/models/shared-prop-models.mjs`
- Baseline output:
  `web/shots/models/shared/props/<id>.png`
- Campaign scene ownership after migration:
  campaign model shots keep campaign entities, labels, campaign-only terrain,
  water, fog, and roads; reusable prop family shots move to shared.

## Human Review Surface

Run a shared prop sheet scene that shows each reusable prop family at the
in-game campaign/battle pitch:

- mixed trees
- conifer
- broadleaf
- rock cluster
- mountain/massif
- cart
- any new battle terrain prop family added before slice 03

The sheet should make scale and silhouette readable without city labels, roads,
or campaign UI competing for attention.

## Verification

- `VERIFY_GPU=1 UPDATE_SHOTS=1 node scene.mjs shared-prop-models` from `web/`
  writes the shared prop baselines.
- `VERIFY_GPU=1 node scene.mjs campaign-models shared-prop-models` passes.
- A source check or focused unit test proves campaign and battle import shared
  prop ids/builders from the registry instead of declaring parallel prop lists.
- The campaign model scene no longer lists reusable prop snapshots under
  `campaign/props`.
- `web/shots/models/shared/props/README.md` documents the owner split.
- Every committed prop sheet passes an unbiased screenshot-critique pass (see
  the Review Map in the feature README); critic findings are fixed or justified
  in writing before the sheet is accepted.

## Must Stay Green

- Existing soldier sheets under `web/shots/models/shared/soldiers/ingame/`.
- Campaign entity, label, road, water, fog, and terrain baselines.
- Renderer release/cutover scripts that enumerate `campaign-models`; update
  their expected detail if snapshot paths change.
- No duplicate tree/rock/cart/mountain builder tables in battle and campaign
  renderer code.

## Feedback That Changes This Slice

David may decide mountains should stay campaign-only because battle uses smaller
rock outcrops instead of map-scale massifs. If so, leave `mountain` in campaign
ownership and move only trees, rocks, carts, shrubs, and generic props to shared.
