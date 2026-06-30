# Slice 04B — ground grade and terrain texture

## Contract

With the terrain height profile frozen, tune the visible ground surface under the
grass so the foreground and hummocks read as smooth meadow, not noisy procedural
patches or flat colour bands.

## Fixed Inputs

- Freeze the accepted Slice 04A valley/hummock silhouette.
- Do not change grass density, cliff shape, cliff texture, fog, sky, water, or
  camera framing.

## Accept / Reject

Use `compare-screenshots` on ground/grass-interior crops that minimize cliff and sky
content. Judge:

- broad green hummock tone;
- low-frequency terrain texture;
- absence of hard procedural blotches or road-like stripes.

Wrong cliff geometry, missing fog, or water placement are out of scope.

## Verification

- `battle-map-reference` crop artifacts record before/after ground texture.
- Run the neutral review/screenshot critique with a prompt scoped to ground grade
  and terrain texture only.
- `battle-terrain-3d` and `battle-terrain-elevation` stay green.
- Gameplay unit readability at mid zoom remains intact.
