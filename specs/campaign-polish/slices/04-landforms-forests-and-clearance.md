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

## Done

- [ ] Mountains no longer cover or dominate cities, roads, or labels.
- [ ] No city is embedded inside a mountain mass in the feedback crop or matching
  real campaign crop.
- [ ] Mountain scale/style is visually accepted in central Italy.
- [ ] Terrain relief is evaluated before large 3D mountain/rock props are used
  on the campaign map.
- [ ] Forest regions show many trees in the gameplay camera.
- [ ] Scenery respects road/city/flag clearance.
- [ ] Fresh screenshot critique has reviewed both fixture outputs and the real
  campaign crop.
