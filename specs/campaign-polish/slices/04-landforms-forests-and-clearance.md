# Landforms Forests And Clearance

## Contract

Mountains, forests, trees, and rocks are visible campaign content. They should
make Italy richer without covering roads, cities, flags, or labels.

## API Seam

- `packages/game-renderer/src/campaign/sceneryPass.ts`
- `web/src/campaign/rendererWebGPU.ts` scenery candidate selection and clearance
- `web/src/campaign/terrain.ts` height/biome sampling

## Human Review

Use `assets/user-feedback/03-mountains-roads-trees.png`. Mountains should no
longer look like a wall over cities and roads. Forested regions should visibly
contain many trees, not just a terrain tint.

## Verification

- Add focused mountain/forest crops around central Italy.
- Add clearance probes around roads, city footprints, labels, and flags.
- Add visible tree/forest density checks in the acceptance crops.
- Run screenshot critique on mountain/forest crops before marking done.

## Done

- [ ] Mountains no longer cover or dominate cities, roads, or labels.
- [ ] Mountain scale/style is visually accepted in central Italy.
- [ ] Forest regions show many trees in the gameplay camera.
- [ ] Scenery respects road/city/flag clearance.
