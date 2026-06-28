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

- [ ] Add close crops for city flag nesting, army flag direction/height, selection
  rings, shadows, and label spacing.
- [x] Add a garrison/colocation capture that renders one combined label: army name
  and size on top, city name below.
- [ ] Add fog captures proving hidden flags and markers are not rendered.
- [ ] Store captures under `visualizations/campaign-entities/`.

## Implementation Notes

- 2026-06-28: The close Roma garrison label is composed in the WebGPU label
  atlas as one army label with `ROMA` as subtext. Critique evidence lives under
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
- 2026-06-28: Label collision now has semantic city groups. A composed garrison
  label may only suppress the city label for the same occupied city; it cannot
  erase nearby settlements such as Ostia/Portus just because screen-space
  rectangles touch. The LoD scene exposes `visibleLabelNames` and asserts the
  Ostia/Portus label remains visible in close Roma views.
- 2026-06-28: Fresh screenshot critique of the corrected close Rome captures still
  flags open entity-label issues: the selected Roma ring is too low-contrast and
  is swallowed by roads/shadow, labels are blurry/heavy-haloed at zoom, the
  Roma/Ostia army-city label cluster is crowded, top-edge regional labels clip
  under the HUD, and some flags/poles still feel weakly attached. These remain
  blockers for final campaign visual acceptance.

## Done

- [x] Labels use the previous-style white text, black outline, and icon language.
- [ ] Label placement and LoD density are accepted at close, regional, and
  overview zooms. City labels are still too far from city icons/models in some
  views and must sit about one label/icon height away.
- [x] Garrisoned armies in cities use one composed army/city label rather than
  stacked labels.
- [x] Nearby city labels are not culled by unrelated garrison labels.
- [ ] Fog hides hidden markers, flags, and labels while keeping the zoomed-out
  border-fog effect.
- [x] Selection rings are perspective ground geometry.
- [ ] Selection rings are visually accepted: readable, outside the shadow/model
  footprint, and not swallowed by roads or shadows.
- [x] Nested objects rely on depth, not manual type-bucket draw ordering.
- [ ] Flag and prop attachment is visually accepted: flags emerge from city or
  army volume, and trees/scenery never appear to float over nearer flags.
