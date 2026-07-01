# Slice 1 — Parameterize scene depth in the skinned pipeline + shadow pass

The enabling refactor. Battle must stay **byte-identical**; this slice only adds an
unused-by-battle capability.

## Contract this unlocks

`SkinnedCrowdPipeline` (and the soldier shadow pass) can render under **either** scene's
world-depth model, so a single class serves both battle and campaign.

## API seam

`packages/renderer-core/src/skinnedPipeline.ts`:
- Add a constructor option `worldDepthFn?: 'battle' | 'campaign'`, default `'battle'`.
- Replace the literal `civsimBattleWorldDepth3d(world)` at `skinnedPipeline.ts:118` with
  the selected function name interpolated into `SKINNED_WGSL`. Both functions already
  exist in `WORLD_CAMERA_WGSL` (`packages/renderer-core/src/cameraWgsl.ts`).

Precedent for scene-mode specialization: `CampaignSceneryPass('battle')` reused in the
battle renderer.

**Genuine alternative (recorded for the human, not chosen):** make depth a *camera
uniform* (`depthBase/groundScale/heightScale` fields) so every world pass reads its sort
from one source of truth via `worldDepth3d(world, cam.…)`. More durable, but larger blast
radius — touches the camera uniform struct, `setCamera`, and depth assertions in the
contract. Chose the constructor param for surgical, battle-preserving scope; revisit the
uniform approach if a third scene or more passes need per-scene depth.

## What the human can run / see

Nothing new — battle renders identically (default arg). This is verified by absence of
change.

## Verification gate

- Battle byte-identity / position-hash A-B unchanged.
- Green: `web/scenes/battle/battle-terrain-elevation.mjs`, `battle-renderer-visual.mjs`,
  `web/scenes/system/per-class-vat.mjs`, `lod-tiers.mjs`, `mounted-units.mjs`,
  `soldier-materials.mjs`.
- `web/scenes/_renderer-contract.mjs` battle contract unchanged.

No shot is produced, so no screenshot-critique needed for this slice.

## What must stay green

All battle scenes, byte-for-byte. If any battle snapshot moves, the default path was
altered — stop and fix before proceeding.

## Feedback that would change this slice

If David wants the durable camera-uniform depth design instead (single source of truth
across all passes), switch to the recorded alternative here — it is cheaper to change now
than after campaign depends on the constructor param.
