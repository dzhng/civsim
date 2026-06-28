# Campaign Coordinates And Alignment

## Contract

Campaign WebGPU uses one canonical coordinate transform for every map layer:
terrain, water, faction colors, cities, roads, rivers, forests, mountains,
labels, fog, minimap, picking, and screenshots. Cities and roads are treated as
ground truth because their relative positions already match the campaign data
and the previous renderer.

## Human Check

Open the central Italy and close Rome scenes. Roma, Ostia/Portus, Tibur,
Narnia, Spoletium, Reate, Cosa, Clusium, Volsinii, and Ferentinum must stay on
land and keep their road relationships while panning, zooming, and switching
LoD.

## Verification

- Add a fake-scene alignment harness with known grid, coastline, roads, and
  cities before debugging the real map.
- Add real-map probes for named city anchors, road samples, coastline samples,
  and river samples.
- Compare at least two zoom levels. Constant offset means mask shift; scaling
  offset means projection mismatch; correct coast with flooding means threshold.
- Store captures under `visualizations/campaign-alignment/`.

## Done

- No inland city or road sample resolves to water-blue pixels.
- The same anchor positions remain aligned across camera pan, zoom, and LoD.
- Water/faction/terrain rendering uses the previous renderer's aligned map data
  rather than edited or stretched replacement assets.
