# 08 — Fog / horizon dissolve

**Track:** grass/atmosphere · **Variable:** fog/atmosphere · **Crop:** full-depth
vista horizon dissolve.

## Contract
The field dissolves into a warm, hazy horizon with valley-mist pooling — the last of
the pen's soft look (pen `fogNear 70`/`fogFar 1700` + directional Mie tint + low/far
mist).

## API seam
Tune the **existing single aerial owner** `scene.fogNode` (set via
`applyCivsimEnvironment`/`aerialPerspective.ts`) toward the pen's aerial curve. This
is an **environment-preset change, NOT a new fog owner** — no grass-local fog, no
per-material haze (single-owner rule, R6-adjacent). May add a `living-meadow`
environment preset in `CIVSIM_ENVIRONMENTS`; the Ghibli *grade* (violet shadows /
cream highlights), if chased, belongs to the **post/tonemap owner**
(`BattlePostChain`/AgX), never the grass material.

## Verification
compare-screenshots vs hero full-depth vista + screenshot-critique told it may judge
only horizon haze/atmosphere.

## Must stay green
Ground/sea/soldiers share the aerial owner — re-bless their vista baselines together.
Do **not** let mist hide unfinished grass (explicit prior warning from
`battle-map-reference`).

## Delegated
Preset tweak vs a new named preset; valley-mist band constants; whether the Ghibli
look-grade is pursued as an optional mini-slice on the post owner.
