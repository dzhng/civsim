# 09 — Grass production wire-in (hard cutover)

**Track:** grass · **Gate:** full battle route compare-screenshots vs hero +
screenshot-critique · **D5: no backcompat.**

## Contract
The winning grass layer + `windSignal` own the grass in the real battle world; the
old single-`sin` wind path and the losing spike branch are **deleted**.

## API seam
Swap the winner into `PhotorealBattleWorld` (replace the `PhotorealBladeFieldLayer`
construction at `battleWorld.ts` ~461 through the `MeadowGrassLayer` interface).
Delete the loser + any residual inline-wind constants + any dead abstraction the
spike left behind. Drive it from `render()` per-frame as today (`routeGpu`).

## Verification
`/renderer/photoreal-battle` route compare-screenshots vs hero + **mandatory**
screenshot-critique on the full battle frame. Re-bless the existing battle
screenshot baselines (grass/crowd/terrain) together.

## Must stay green
All battle scenes after re-bless; `battle-grass*` isolation name; cargo sim tests.

## End-state invariant
After this slice the battle reads as designed today: one grass layer, one wind
source feeding eye and ear, no parallel abstraction. (Perf tuning is `40`, run after
this.)
