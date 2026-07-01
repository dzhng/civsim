# Slice 06B — distance fog / aerial perspective

## Contract

Add the reference's distance falloff: near grass remains readable, midground loses
contrast, far ridges and water fade toward the overcast sky. This slice is fog and
aerial perspective only.

Reuse the haze behaviour proven by the water work instead of creating a parallel
battlemap effect. The reference implementation is water Slice S6:

- `packages/game-renderer/src/water/waterPlanePass.ts` computes a distance-based
  `haze01 = smoothstep(55.0, 300.0, dist)` for the lab sea plane and clears the
  sky from the active preset's `hazeColor`;
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

The shot-level target is the water folder's latest fog behavior, not a generic
grey overlay. In `web/shots/misc/water/haze-gerstner.png`, the foreground still
has wave contrast and glint, but the horizon band loses surface detail and blends
into the haze-coloured sky. In `web/shots/misc/water/albedo-overcast.png`, the
same mechanism switches mood by preset: the far sea approaches the pale
grey-blue overcast haze without repainting the underlying water albedo. The
battlemap should do the same for distant grass mass, far ridges, terrain, and
water: fade detail first, then blend final lit colour toward the preset haze.

This is a reuse requirement, not an inspiration note. Prefer extracting or
threading a shared battle atmosphere/environment helper over copying new
hard-coded constants into each pass. If a pass needs a different falloff range,
keep the colour source and final blend semantics shared, publish the range in
route stats, and record why that surface needs its own distance band.

## Approach

- Treat water S6 as the prototype: shared environment preset, distance/projection
  `haze01`, detail fade by `(1.0 - haze01)`, final `mix(surface, hazeColor,
  haze01)`.
- Add a battle atmosphere/environment seam rather than scattering fog constants
  through terrain, grass, ridge, and water passes. If the water environment module
  stays water-named for now, explicitly document the import/reuse so the shared
  colour source is still obvious.
- Apply haze in the material/shading stage for each far surface. Avoid a single
  opaque screen-space fog curtain; the reference-like effect comes from surfaces
  losing contrast into the sky while nearby grass stays readable.
- Publish the active haze colour, falloff bands, and participating passes in route
  stats so `battle-map-reference` evidence can prove the whole battlemap is using
  the water-derived contract.

## Fixed Inputs

- Freeze sky, grass density/texture, terrain shape/texture, cliff silhouette/texture,
  and water placement/material.
- Do not use fog to hide wrong geometry or grass density. If a variable is wrong,
  record it against its owning slice.
- Do not fork a new private fog palette. Use the active environment preset's haze
  colour and document any distance bands as part of the shared battle atmosphere
  contract.
- Keep grass-body, cliff-shape, cliff-texture, water-placement, and sky-plate
  variables frozen. This slice may reveal that those surfaces are wrong; it must
  not repair them while tuning haze.

## Accept / Reject

Use `compare-screenshots` on near/mid/far horizontal bands. Judge:

- luminance/contrast drop by distance;
- far ridge desaturation toward sky colour;
- far grass/meadow detail fading before it becomes a visible fog wall;
- no hard fog seam at terrain, cliff, or water intersections.

Do not judge sky shape, cliff texture, grass density, or water material here.

## Verification

- Fog parameters are published in route stats.
- Ground, grass, scenery, ridge, and water use the same distance-fog contract rather
  than private ad hoc haze constants.
- The battle route uses the same environment haze colour family as the archived
  water shots. In the overcast preset, far terrain/ridge/water should approach
  the pale grey-blue `WATER_ENVIRONMENTS.overcast.hazeColor`, and the sky clear
  or sky plate should meet that value at the horizon.
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
