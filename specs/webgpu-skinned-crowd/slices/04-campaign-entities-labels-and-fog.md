# Campaign Entities Labels And Fog

## Contract

Campaign entities preserve the old renderer's readability while obeying the
WebGPU 3D depth model. Labels, icons, flags, selection rings, shadows, fog, and
city/army colocation must all be playable at the camera level where they appear.

## Human Check

Close Rome should show the city flag emerging from the city volume, army labels
not colliding with Roma, readable white outlined text, correct icon spacing,
selection ring on the ground, and no trees or scenery floating over nearer
flags. Fog views must not show flags, markers, or labels for hidden content.

## Verification

- Add close crops for city flag nesting, army flag direction/height, selection
  rings, shadows, and label spacing.
- Add a garrison/colocation capture that renders one combined label: army name
  and size on top, city name below.
- Add fog captures proving hidden flags and markers are not rendered.
- Store captures under `visualizations/campaign-entities/`.

## Implementation Notes

- 2026-06-28: The close Roma garrison label is composed in the WebGPU label
  atlas as one army label with `ROMA` as subtext, and nearby city labels that
  collide with that measured group are culled by the label pass. Critique
  evidence lives under
  `visualizations/critique/2026-06-28-label-collision/`.
- 2026-06-28: An unprimed critique confirmed the Ostia collision is fixed, but
  the close selected-army view still has release blockers: the selected army
  versus city subject is ambiguous, the selection ring is partly hidden and
  competes with roads, roads converge too tightly under Roma, flags/poles still
  need stronger attachment, and dense top-edge labels can clip under the HUD.
  These remain open campaign-entity acceptance work, not accepted polish.
- 2026-06-28: Selected armies inside cities now use a distinct
  `garrisoned-army` ground-selection instance and a shared garrison display
  anchor inside the occupied city footprint. The army mesh, selection ring, and
  composed army/city label all use that anchor, so the selected garrison reads
  as soldiers inside Roma instead of a city-sized halo around the road hub.
  Updated evidence lives in
  `visualizations/critique/2026-06-28-garrison-selection/`. Road convergence
  around Roma still competes with the cue and remains road/junction acceptance
  work, not selection-code polish.

## Done

- Labels match the previous text/icon style and zoom density rules.
- Fog hides hidden markers, flags, and labels while keeping the zoomed-out
  border-fog effect.
- Selection rings are perspective ground geometry and remain outside shadows.
- Nested objects rely on depth, not manual draw-order exceptions.
