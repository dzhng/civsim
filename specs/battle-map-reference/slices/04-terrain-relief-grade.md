# Slice 04A — valley relief and foreground hummock silhouette

## Contract

Shape the shared heightfield so the reference view has a readable valley drop,
rolling foreground hummock, and midground recession. This slice is about large
terrain form only.

## Fixed Inputs

- Grass density/texture from Slice 03B/03C is frozen.
- Cliff silhouette/texture, sky, distance fog, water, and final composition stay
  fixed unless they prevent a fair terrain-form crop.
- `terrainHeightAt` remains the single height source. Soldiers, shadows, props, and
  grass must ride the same surface.

## Accept / Reject

Use `compare-screenshots` crops focused on:

- foreground hummock silhouette and slope direction;
- central valley recession;
- broad landform bands under the grass.

Do **not** judge cliff face shape, cliff texture, fog strength, water material, or
grass colour here. If those are visibly wrong, record them as later-slice debt.

## Verification

- `heightSpan` remains in the readable band (`> 5 && < 40`) unless the slice records
  a specific reason to widen it.
- `battle-terrain-elevation` proves soldiers/shadows/props seat on the new surface.
- `battle-terrain-3d` and `battle-map-reference` snapshots update intentionally.
- Run the neutral review/screenshot critique with a prompt scoped to valley relief
  and hummock silhouette only.
- `edgeSealMismatches` stays empty.

## Next Slice

After the terrain silhouette is accepted, freeze the height profile and tune ground
grade/texture in `04b-ground-grade-texture.md`.
