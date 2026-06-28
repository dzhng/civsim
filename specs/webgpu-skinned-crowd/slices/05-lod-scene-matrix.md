# LoD Scene Matrix

## Contract

Every campaign zoom band that changes visible content has an addressable scene,
stored capture, and explicit acceptance notes. No LoD transition is allowed to
silently drop mountains, roads, labels, fog, forests, trees, carts, or city
markers.

## Human Check

Review captures for close Rome, central Italy, Italy overview without faction
colors, Italy overview with faction colors, whole map, fog, and road-continuity.
The map should become more strategic as it zooms out, not less accurate.

## Verification

- Add or update scenes for every LoD threshold.
- Store both natural and faction-color captures where overlays differ.
- Add a small manifest that names the content expected in each LoD band.
- Store captures under `visualizations/campaign-lod/`.

## Done

- Each LoD band has a scene and screenshot.
- LoD transitions preserve alignment, terrain identity, road continuity, and
  label readability.
- The previous renderer baseline is used as a floor, not a score target.
