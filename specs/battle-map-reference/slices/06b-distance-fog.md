# Slice 06B — distance fog / aerial perspective

## Contract

Add the reference's distance falloff: near grass remains readable, midground loses
contrast, far ridges and water fade toward the overcast sky. This slice is fog and
aerial perspective only.

Reuse the haze behaviour proven by the water work instead of creating a parallel
battlemap effect. The reference implementation is water Slice S6:

- `packages/game-renderer/src/water/waterPlanePass.ts` computes a distance-based
  `haze01` and clears the sky from the active preset's `hazeColor`;
- `packages/game-renderer/src/water/waterMaterialWgsl.ts` fades glint/detail by
  `(1.0 - haze01)` and finishes with `mix(surface, WATER_HAZE, haze01)`;
- `packages/game-renderer/src/water/waterEnvironment.ts` owns the preset haze
  colours, with `WATER_ENVIRONMENTS.overcast.hazeColor` as the current overcast
  battlemap reference;
- `web/scenes/system/water-haze.mjs` gates the soft seam, and the review shots
  are archived here as
  `assets/water-fog-reference/haze-gerstner.png` and
  `assets/water-fog-reference/albedo-overcast.png`.

For the battlemap, reuse that contract across terrain, ridge/backdrop, grass LOD
mass, and water: distance/projection raises a shared haze term, high-frequency
detail/glint fades as haze rises, and every far surface mixes toward the active
environment preset's haze colour so the horizon dissolves into the sky.

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
- Compare against the archived water haze shots as an architectural reference:
  far ridges and water should dissolve into the sky with the same soft seam
  behaviour, while near grass remains readable. Use `compare-screenshots` on the
  battle near/mid/far bands against the prior battle shot and use the water shots
  to validate the seam character and haze colour family, not to force the terrain
  to look like ocean.
- Run the neutral review/screenshot critique with a prompt scoped to near/mid/far
  contrast falloff and aerial perspective only.
- `battle-renderer-visual`, `battle-terrain-3d`, and `battle-map-reference` pass
  after deliberate snapshot updates.

## Next Slice

After overcast fog is accepted, move the lighting/fog knobs into named weather
presets in `06c-weather-presets.md`.
