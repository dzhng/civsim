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

## Code landing notes (BMS15-SLICE-B8D2)

- Spike answer: `seaLayer.ts` did assume the ocean case — each plane had one
  `baseZ` datum and shore depth keyed from `abs(world.x - shoreX)`. The landed
  generalization keeps that path unchanged and adds inland lake planes with
  per-basin levels.
- Wasm seam: generated map descriptor and drainage certificate JSON now export
  `lakeSurfaces` / `drainage.lakes` with `{id, level, cell bbox, world bbox,
  cells}`. The mask remains the existing terrain tint pointer (`tint == 1`).
- Renderer seam: generated maps pass those lake summaries through
  `BattleRenderer.setTerrain` into `PhotorealBattleWorld`; hand maps pass none.
  Each lake mesh is a planar patch built only from water-tint cells inside the
  bbox, seated at the fill level, sharing `seaLayer` water nodes with tiny
  becalmed displacement.
- Scene seam: `battle-genmap-lake.mjs` boots `?map=gen&seed=7`, derives the
  camera/crop from the exported lake bbox, snapshots golden and overcast crops,
  and checks projected rendered water pixels against the wasm tint mask.
- ORCHESTRATOR-TODO: run browser scene, bless both lake crops, run
  screenshot-critique, perf:30k hardware, and the elevation tripwire.

## Landed (2026-07-05)

- Spike answer: seaLayer assumed the OCEAN SHAPE (one rect plane, one baseZ,
  shore depth from abs(x - shoreX)), not a hardcoded z=0. Generalized:
  createLakePlaneMesh builds one surface per generated lake from the same
  water material family, clipped to the sim tint=water mask, seated at fill
  level, becalmed displacement; hand-map ocean path untouched; stats report
  oceanPlanes/lakePlanes separately (the vista scene's no-legacy-planes
  assert keeps its meaning).
- Orchestrator review fixes: a becalmed lake at ocean-glint smoothness is a
  MIRROR - the whole surface rendered as a blown-white sun disk; lakes get
  real ripple normals (0.42) and a 0.3 roughness floor. The scene's
  water-pixel classifier demanded BLUE and scored real water 0 - water's
  honest signatures are specular-bright (golden), blue-dominant, or
  desaturated grey (overcast; grass is always green-dominant). Page-context
  helper inlined (the slice-14 evaluate trap again).
- Result: the lake reads as glinting water under golden sun and a pale
  grey-blue pool with a sandy rim under overcast - the reference's pale
  sliver family; mask cross-check green with zero dry-cell leakage.

## Feedback that would change it

Water mood (glassier/rougher) — parameters on the shared material. Wanting
rivers rendered as moving water is a successor slice with slice 04's
polylines as input.
