# 19 — Campaign seam (cuttable)

Campaign encounters inherit generated terrain. Named here so every earlier
slice keeps the seam cheap; **cuttable** — closing the spec without it strands
nothing (it moves to a successor spec).

## Contract unlocked

A campaign battle at an open-field site fights on a recipe-generated map
seeded from campaign state — deterministic for replays.

## API seam

- `crates/contract`: `BattleSetup.terrain` grows a source enum —
  `TerrainSource::Ops(TerrainSpec) | Recipe(MapRecipe)` (`MapRecipe` has been
  serde-able since slice 01 precisely for this).
- `crates/campaign/src/battlegen.rs`: open-field sites map campaign context
  (tile features, region) to a recipe + seed derived from campaign state;
  bridge/ford/city sites **keep their paint-op templates** — they encode
  site-specific gameplay the generator doesn't do. Both paths converge on
  `Terrain` before the sim sees anything.
- Read the `tweak-campaign` skill before touching battlegen.

## Human can run

Trigger a field battle from the campaign; replay it (same seed, same map).

## Verification

- Cargo: campaign→battle handoff round-trips the recipe; replay determinism
  (same encounter → byte-identical terrain); certificates hold for
  campaign-derived recipes; bridge/city battles unchanged
  (golden/scenario tests).
- One campaign-launched battle scene snap on a pinned campaign fixture.

## Stays green

All campaign tests and scenario suites; existing battlegen template output
byte-identical for non-field sites.

## Feedback that would change it

How strongly campaign geography should steer the recipe (coastal region →
water seal, mountainous → more cliff) — start with a minimal mapping table,
grow by David's taste.
