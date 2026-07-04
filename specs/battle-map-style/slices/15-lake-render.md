# 15 — Lake render

The hydrology track's lake pockets get water surfaces — from the one existing
water family.

## Contract unlocked

Inland water renders at per-basin levels; no second water material is born.

## API seam

- First hour is a **spike with a recorded answer**: does
  `packages/photoreal-renderer/src/battle/seaLayer.ts` assume a single global
  water level (z≈0)? Generalize to per-basin surfaces at each lake's fill
  level (slice 04 exports basin id + level per water region) — likely one
  plane per basin sharing the sea material with becalmed
  displacement/parameters.
- Shoreline: blend against the terrain at the fill level; the marsh fringe
  tint (slice 04) does the visual hand-off from grass to water.
- Ocean `WaterReach` seals (slice 05) keep using the existing sea path — this
  slice only adds the inland case.

## Human can run

The vista route on a lake-bearing seed; a close orbit of the shoreline.

## Verification

- Judged crop: the lake pocket only (define the crop from the fixed seed's
  lake bounds). compare-screenshots against the reference's pale water
  sliver; screenshot-critique last.
- Water pixels appear only over sim water cells (mask cross-check stat — the
  render cannot invent or lose water vs gameplay truth).
- perf:30k, tripwires, both lighting presets.
- **Out of scope wrongness:** reflections beyond the existing sea family,
  ocean edges, haze, grass.

## Stays green

Sea rendering on hand maps (Coastal Scrub) unchanged; all prior gates.

## Feedback that would change it

Water mood (glassier/rougher) — parameters on the shared material. Wanting
rivers rendered as moving water is a successor slice with slice 04's
polylines as input.
