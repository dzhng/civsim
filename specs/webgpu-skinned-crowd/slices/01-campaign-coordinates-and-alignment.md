# Campaign Coordinates And Alignment

## Contract

Campaign WebGPU uses one canonical coordinate transform for every map layer:
terrain, water, faction colors, cities, roads, rivers, forests, mountains,
labels, fog, minimap, picking, and screenshots. Cities and roads are treated as
ground truth because their relative positions already match the campaign data
and the previous renderer.

When alignment, geography, LoD visibility, fog hiding, road behavior, or label
placement is ambiguous, consult the previous implementation on `origin/main` or
`main` before inventing new behavior. Baseline captures are visual evidence, but
the old renderer and campaign code are the reference for the business logic that
generated those captures.

## Human Check

Open the central Italy and close Rome scenes. Roma, Ostia/Portus, Tibur,
Narnia, Spoletium, Reate, Cosa, Clusium, Volsinii, and Ferentinum must stay on
land and keep their road relationships while panning, zooming, and switching
LoD.

## Verification

- [ ] Add a fake-scene alignment harness with known grid, coastline, roads, and
  cities before debugging the real map.
- [x] Add real-map probes for named city anchors, road samples, coastline samples,
  and river samples.
- [x] Compare at least two zoom levels. Constant offset means mask shift; scaling
  offset means projection mismatch; correct coast with flooding means threshold.
- [ ] Store dedicated captures under `visualizations/campaign-alignment/`.

## Done

- [x] No sampled mainland Italy city or road anchor resolves to water-blue
  pixels in the current LoD scene matrix.
- [ ] The same anchor positions remain aligned across a dedicated camera
  pan/zoom/LoD stability harness.
- [x] Water/faction/terrain rendering uses the previous renderer's aligned map data
  rather than edited or stretched replacement assets.
- [x] Any behavior copied for alignment or visibility cites the previous
  implementation path or function in the implementation notes.

## Implementation Notes

- 2026-06-28: The campaign debug `cam()` hook now draws the world immediately
  after clamping the requested camera. Synthetic `project()` calls and mouse
  clicks therefore use the same camera snapshot, which keeps tilted-camera
  picking tests tied to the real renderer state instead of a stale previous
  frame.
- 2026-06-28: Review against `main` confirms the water-mask crisis was an
  implementation alignment problem, not incorrect city or road geography.
  Cities and roads remain ground truth. Do not edit `campaign-bg.png` or move
  cities to make the current render look plausible; keep all campaign layers on
  the canonical map projection and use `main`/`origin/main` for baseline
  business logic when behavior is unclear.
