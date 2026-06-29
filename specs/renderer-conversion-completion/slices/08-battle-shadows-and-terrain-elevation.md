# Battle Shadows And Terrain Elevation

## Contract

Battle soldiers cast a grounding shadow and sit on the terrain surface — they
climb hills and layer correctly on relief instead of floating on a flat plane.

## Why

Gaps from the gap review:

- Battle pass list (`renderer.ts:164-172`) has no shadow pass; the skinned
  shader uses sun shading only (`skinnedPipeline.ts:77-78`). Soldiers float with
  no ground contact. Campaign already has shadows
  (`web/src/campaign/renderer.ts:181-182` → `drawShadows()`) — the pattern
  exists to port.
- The old renderer applied procedural height to soldier Z
  (`renderer3d.ts:391-395,1005-1031`). New `CrowdInstance` has no elevation field
  (`instanceData.ts:15-26`); `buildCrowdInstances()` passes no height
  (`instanceData.ts:97-107`); `skinnedPipeline.ts:72` sets `world.z` model-local
  only, used solely for atmospheric tint (frag line 103). No hill climbing, no
  depth layering on terrain.

## API Seam

- **Shadows**: port the campaign shadow approach to battle — a shadow
  contribution in the battle pass list, reading the shared depth/ground contract.
  Reuse `campaign/.../drawShadows()` patterns rather than inventing a new one.
- **Elevation**: add an elevation field to `CrowdInstance`
  (`instanceData.ts`); `buildCrowdInstances()` samples the battle terrain height
  field (same source `BattleTerrainPass` uses) per soldier; `skinnedPipeline.ts`
  applies it to world Z so soldiers sit on the surface and sort by it.
- The terrain height source must be the one already feeding
  `BattleTerrainPass`/`setTintGrid` so soldiers and ground agree.

## Human Review

Battle scene on relief terrain: soldiers stand on the slope, shadows anchor each
figure to the ground beneath it, and a unit cresting a ridge occludes/sorts
correctly against the terrain. No floating, no shadow detached from feet.

## Verification

- Battle scene gate on a sloped fixture: soldier feet meet terrain; shadow sits
  under the feet; re-bless once with a change-ledger note.
- Elevation test: soldier world Z matches the sampled terrain height at its (x,y)
  within tolerance.
- Sim invariant: elevation is render-only — sim positions and `pick_unit` are
  unchanged (picking already accounts for the sim's own space).

## What Must Stay Green

- Sim/balance and `pick_unit` hit testing (render-only change).
- Flat-terrain battles look unchanged except for the new grounding shadow.
- Crowd-scale frame budget (shadow pass cost measured at battle scale).

## Feedback That Would Change This Slice

- Shadow style/softness to match campaign and the aesthetics north star.
- Whether elevation also tilts soldiers to the slope normal or only offsets Z
  (default: Z offset only, no tilt).
