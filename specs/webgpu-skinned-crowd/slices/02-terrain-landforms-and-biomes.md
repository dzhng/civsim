# Terrain Landforms And Biomes

## Contract

`campaign-3d.png` must read as a living 3D landscape, not a flat political
wash. WebGPU keeps the previous renderer's natural-map strengths and improves
where possible: green terrain, visible mountain ranges, forests, trees, rocks,
rivers, coast treatment, and soft terrain transitions.

## Human Check

Italy overview should immediately show green land, the Apennine mountain spine,
forest clusters, trees near settlements, coastal variation, and readable water.
Whole-map view should preserve large terrain identities without turning into
one flat color field.

## Verification

- Add feature-density probes for mountains, forests, trees, rocks, and rivers in
  the central Italy camera.
- Add crops for mountain ranges, forest regions, coastal cities, and river
  crossings.
- Use screenshot critique before accepting any terrain-refresh capture.
- Store captures under `visualizations/campaign-terrain/`.

## Done

- Green terrain is visible and varied in central Italy and overview scenes.
- Mountain ranges are materially present at the same strategic locations as the
  previous renderer.
- Forest regions contain many trees instead of only color stains.
- Terrain feature edges avoid jagged low-resolution masks.

## Implementation Notes

- 2026-06-28: WebGPU campaign scenery now follows the previous renderer's
  terrain-feature policy from `origin/main:web/src/campaign/terrain3d.ts`:
  deterministic mountains, rocks, and tree families are derived from the
  canonical height/biome field, cached as static candidates, filtered by camera
  LoD, and cleared around roads/cities/dynamic entities. Scenery instances carry
  terrain `z` so props are anchored to the same 3D surface as cities, roads,
  selections, and labels.
- 2026-06-28: The WebGPU map surface now samples the canonical biome and baked
  light textures directly instead of relying on the flat background raster for
  natural terrain color. The pass reports `mapSurface.terrainMix`,
  `terrainTextureSize`, and its terrain layer in route stats so shader mode and
  resource contract drift are visible during scenario review.
- 2026-06-28: Campaign scenery instances now separate horizontal footprint
  (`size`) from vertical scale (`height`). Mountains, rocks, and trees can match
  the previous renderer's tall/low-poly silhouettes without smuggling height
  through a uniform scale that makes props squat or oversized.
- 2026-06-28: Alignment and canonical terrain sampling are back on solid
  footing, but visible terrain-feature acceptance cannot rely on aggregate
  scenery counts or broad "model" pixel ratios because city roofs can satisfy
  those metrics while the Apennine mountain/forest silhouettes remain weak.
  The next terrain pass should add crop-level probes for named mountain and
  forest regions, then tune density/scale against those visible pixels.
- 2026-06-28: The terrain pass now reserves scenery selection by map region
  before filling the remaining budget globally. A global top-N selector erased
  valid regional landforms when stronger height/rock scores elsewhere consumed
  the budget, so geography now owns distribution and batching remains an
  implementation detail. Mountain candidates also read the canonical height
  field directly; weak rock-channel signal alone cannot be allowed to remove the
  Apennine spine.
- 2026-06-28: The campaign LoD verifier checks named northern, central, and
  southern Apennine crops for visible mountain/dark-feature/green content. These
  crop probes are readability floors, not similarity targets: the previous
  renderer is the minimum evidence for placement and content, while WebGPU is
  expected to improve style and density over time.
