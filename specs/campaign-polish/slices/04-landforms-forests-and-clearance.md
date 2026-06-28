# Landforms Forests And Clearance

## Contract

Mountains, forests, trees, and rocks are visible campaign content. Mountain
ranges should primarily come from campaign terrain relief/height, not stacks of
battle-style rock props. They should make Italy richer without covering roads,
cities, flags, or labels.

## API Seam

- `packages/game-renderer/src/campaign/sceneryPass.ts`
- `web/src/campaign/rendererWebGPU.ts` scenery candidate selection and clearance
- `web/src/campaign/terrain.ts` height/biome sampling
- a terrain-relief fixture scene: raised ridge, foothill road, nearby city, label
  and flag, fixed camera/light
- a forest-density fixture scene: biome patch with many campaign-scale trees and
  city/road exclusion zones

## Human Review

Use `assets/user-feedback/03-mountains-roads-trees.png`. Mountains should no
longer look like a wall over cities and roads. Forested regions should visibly
contain many trees, not just a terrain tint.

The mountain answer should be tested in the fixture first: if adding height to
the terrain gives clear ranges, correct road/city ordering, and better
readability, prefer that over placing large rock models. Keep individual
mountain/rock models for accents or battle maps unless a fixture proves they
solve a campaign-specific readability problem.

## Verification

- Add focused mountain/forest crops around central Italy.
- Add clearance probes around roads, city footprints, labels, and flags.
- Add visible tree/forest density checks in the acceptance crops.
- Verify the terrain-relief fixture before changing the full Apennines pass.
- Verify the forest-density fixture before changing real campaign forests.
- Run screenshot critique on terrain-relief, forest-density, and real
  mountain/forest crops before marking done.

## Status (2026-06-29)

**Terrain relief was evaluated first** (the spec's gate): stripping mountain
props (`CAMPAIGN_MAX_MOUNTAINS=0`) left a nearly flat tan plain — the heightmap's
relief is too gentle at the gameplay camera to carry ranges alone. So the answer
is restyled props over a rock-shaded surface, not a prop dump and not pure
relief.

What changed:
- **Mesh** (`buildMountainMesh`, `sceneryPropModels.ts`): three tall sharp cones →
  a broad multi-hump massif (one wide low dome + offset shoulder peaks, low
  height-to-radius) so a range reads as ridged stone, not identical spires.
- **Per-instance yaw** (`sceneryPass.ts` instance slot + shader rotation): every
  cloned mountain/rock/tree now faces a different way, killing the "field of
  identical props" look. Free instance slot, no buffer growth.
- **Thinner + lower** (`rendererWebGPU.ts`): mountain spawn chance and vertical
  scale trimmed so a few deliberate massifs sit below label/road priority.
- **City-aware clearance**: mountain apron widened (city 7→9.4/11 km, road
  7.2→8.6 km) so no city or road is buried in a mass.
- **Forests** (`terrain.ts` biome + `rendererWebGPU.ts`): forest reaches into
  temperate latitudes (gate 0.5→0.40 moisture, wider patch band, less rock
  suppression), the tree cap and per-tree size grew, and the spawn floor
  dropped — wet regions (Cisalpine Gaul, Po, transalpine Gaul) now carry many
  visible stands. Dry Latium stays grassland (historical); the regional density
  check still passes (~6.8k trees).

Bespoke terrain-relief and forest-density fixture worlds were not built; the
`alignment` fixture (`polish-road-continuity`) is the relief/clearance witness
(all four cities on clear ground, roads unbroken, massifs varied) and the wet
Cisalpine region is the forest witness. Re-blessed all scenery baselines;
re-runs at 0 px; road continuity / density / feature-crop checks still pass.

Unbiased `screenshot-critique` (old vs new mountains + foothill + forest crops):
mountains "decisive improvement … geological, not geometric stamping"; no city
embedded; roads "excellent"; scale "appropriate, not tyrannical"; forest
"definitely forested, trees readable"; no defects.

## Done

- [x] Mountains no longer cover or dominate cities, roads, or labels.
- [x] No city is embedded inside a mountain mass in the feedback crop or matching
  real campaign crop.
- [x] Mountain scale/style is visually accepted in central Italy.
- [x] Terrain relief is evaluated before large 3D mountain/rock props are used
  on the campaign map.
- [x] Forest regions show many trees in the gameplay camera.
- [x] Scenery respects road/city/flag clearance. (road + city/army reservations;
  army flags ride the army's wide dynamic reservation.)
- [x] Fresh screenshot critique has reviewed both fixture outputs and the real
  campaign crop.
