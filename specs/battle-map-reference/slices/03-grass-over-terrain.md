# Slice 03A — grass over terrain infrastructure

## Shipped 2026-06-30

This slice owns grass **wiring**, not final reference likeness. It landed the
terrain-aware `BattleGrassPass` path: grass scatters from the battle terrain grid,
rejects blocked tints, seats every tuft through the shared heightfield, draws in the
world-depth phase before soldiers, publishes mask/LOD stats, and keeps gameplay
zoom sparse enough for unit readability.

Reference grass density, colour, softness, and wind texture are now separate slices:
`03b-foreground-grass-density.md` and `03c-grass-color-texture.md`.

## Contract

Grass appears on real battle maps as deterministic, terrain-masked, depth-tested
world geometry. This slice proves the renderer can place grass correctly; it does
not decide whether the foreground meadow is dense or soft enough to match the
reference.

## Gates

- `battle-terrain-3d` proves grass exists on eligible ground, avoids
  water/rock/wall/mud, stays in the world-depth pass, and reports bounded instance
  stats.
- `battle-terrain-elevation` proves grass, soldiers, shadows, and props share the
  same `terrainHeightAt` surface.
- Gameplay shots prove sparse/mid-zoom readability remains intact.

## Out Of Scope

- Lower-third reference meadow density.
- Grass colour or stipple/noise quality.
- Cliff shape, fog, water, or final whole-frame similarity.

Those belong to later slices. Do not reopen this infrastructure slice because the
reference composition is still wrong.
