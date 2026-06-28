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
