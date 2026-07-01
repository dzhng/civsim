# Slice 06B — distance fog / aerial perspective

## Contract

Add the reference's distance falloff: near grass remains readable, midground loses
contrast, far ridges and water fade toward the overcast sky. This slice is fog and
aerial perspective only.

Reuse the haze behaviour proven by the water work instead of creating a parallel
battlemap effect. The reference implementation is the water Slice S6 horizon haze
path (`web/shots/misc/water/haze-gerstner.png`,
`web/shots/misc/water/albedo-overcast.png`): distance raises a `haze01` term,
high-frequency/glint detail fades as haze rises, and the surface mixes toward the
active environment preset's haze colour so the horizon dissolves into the sky.
For the overcast battlemap target, start from the same overcast haze colour used
by `WATER_ENVIRONMENTS.overcast` and keep the fog contract shared across terrain,
ridge/backdrop, grass LOD mass, and water.

## Fixed Inputs

- Freeze sky, grass density/texture, terrain shape/texture, cliff silhouette/texture,
  and water placement/material.
- Do not use fog to hide wrong geometry or grass density. If a variable is wrong,
  record it against its owning slice.
- Do not fork a new private fog palette. Use the active environment preset's haze
  colour and document any distance bands as part of the shared battle atmosphere
  contract.

## Accept / Reject

Use `compare-screenshots` on near/mid/far horizontal bands. Judge:

- luminance/contrast drop by distance;
- far ridge desaturation toward sky colour;
- no hard fog seam at terrain, cliff, or water intersections.

Do not judge sky shape, cliff texture, grass density, or water material here.

## Verification

- Fog parameters are published in route stats.
- Ground, grass, scenery, ridge, and water use the same distance-fog contract rather
  than private ad hoc haze constants.
- Compare against the water haze shots as an architectural reference: far ridges
  and water should dissolve into the sky with the same soft seam behaviour, while
  near grass remains readable.
- Run the neutral review/screenshot critique with a prompt scoped to near/mid/far
  contrast falloff and aerial perspective only.
- `battle-renderer-visual`, `battle-terrain-3d`, and `battle-map-reference` pass
  after deliberate snapshot updates.

## Next Slice

After overcast fog is accepted, move the lighting/fog knobs into named weather
presets in `06c-weather-presets.md`.
