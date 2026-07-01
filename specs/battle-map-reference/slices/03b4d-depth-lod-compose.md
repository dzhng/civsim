# Slice 03B4D — depth LOD compose

## Contract

Compose the accepted clump-root/root-material and near-field fiber/visibility
accent layers into one 03B4 grass accent path with explicit near/mid/far depth
ownership.

## Approach

This slice owns the final 03B4 depth split:

- near: accepted field-record fiber silhouettes over clump root mass;
- mid: clump root/crown marks fading into meadow tone;
- far: 03B3 meadow material only.

Keep the budget and stats explicit. The reference route should report field
records, clump accent instances, ribbon instances, submitted triangles, and depth
bands clearly enough that 03B5 can reason about readability/perf.

Implementation seam:

- compose accepted root and ribbon paths in `BattleGrassPass` or a clearly named
  sibling pass, but keep both layers fed by the same 03B1 field/clump data so the
  depth split is deterministic;
- publish one stats object that reports source field records, meadow texture
  ownership, root clump instances, ribbon instances, submitted triangles, and the
  active near/mid/far cutoffs;
- keep root-only and ribbon-only debug route modes available until 03B4 is
  accepted, because future regressions need to isolate which layer changed;
- make the reference route default boring and explicit: accepted 03B3 meadow
  material, accepted 03B4B/03B4B2 root layer, accepted 03B4C3 near field fiber,
  then no other visual changes.

Compose approach:

1. Lock the accepted 03B4B/03B4B2 and 03B4C3 parameters before tuning the
   combined shot.
2. Capture root-only, ribbon-only, and composed crops from the same camera.
3. Compare the composed crop to each ingredient and the target. The composed crop
   should be less wrong because of depth ownership, not because one layer hides
   the other.
4. If root and ribbon layers fight, first tune depth cutoffs and contrast fade.
   Do not immediately change primitive shapes; that belongs back in 03B4B or
   03B4C.
5. Only after the crop works, run the wider route/perf gates and record final
   defaults for 03B5.

Stop and reslice if the compose pass needs terrain, fog, cliff, water, or grass
color changes to pass. Those are later visual variables, and hiding them in 03B4D
will make the next goal pass impossible to debug.

## Accept / Reject

Accept if the foreground/midground crop is less wrong than the prior
03B4B/03B4B2/03B4C3 individual proofs and neutral review no longer calls out
dots, smooth ground plane, or weak falloff as the main grass blocker.

Reject if final composition hides a failed root or ribbon layer by changing
camera, terrain, colour, fog, water, cliffs, or target crop.

## Verification

- `battle-map-reference` foreground/midground crop comparison.
- `compare-screenshots` and unprimed `screenshot-critique`, scoped to 03B4 depth
  LOD composition only.
- `battle-grass`, `battle-grass-field`, `battle-terrain-3d`,
  `battle-terrain-elevation`, `full-game-rendering-performance`, and
  `renderer-lab-routes` stay green.

## Next Slice

After 03B4D is accepted, continue with `03b5-readability-and-perf-gate.md`.
