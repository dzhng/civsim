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

- [x] Add or update scenes for every core campaign LoD threshold.
- [x] Store both natural and faction-color captures where overlays differ.
- [ ] Add a small manifest that names the content expected in each LoD band.
- [ ] Store dedicated captures under `visualizations/campaign-lod/`.
- [ ] Add missing LoD scenes for synthetic road continuity, camera stability,
  fog hiding, and ambient life.

## Done

- [x] Core LoD bands have scenes and screenshots.
- [ ] LoD transitions preserve alignment, terrain identity, road continuity, and
  label readability.
- [x] The previous renderer baseline is used as a floor, not a score target.

## Implementation Notes

- 2026-06-28: The regional Italy LoD gate samples semantic city/road anchors and
  rendered road pixels at the same camera, then also inspects named terrain
  crops. This catches the alignment class of failures directly instead of
  chasing whole-image similarity against a renderer that WebGPU should surpass.
- 2026-06-28: Unprimed screenshot critique of the regional Italy candidate
  found remaining LoD/readability debt that should become follow-up scenes or
  checks before campaign parity is closed: Roma/Ostia army-city label collision,
  dense northern label overlap, thick/muddy label outlines at crop scale,
  roads reading too screen-space at perspective zoom, awkward road/city
  junctions, labels/icons crossing mountain faces, overly bright coast glow,
  cyan sea-lane strokes reading as artifacts, weak tiny city flags, top-edge UI
  clipping, and low-contrast non-mountain terrain texture. These are not
  alignment blockers for the current terrain checkpoint, but they are parity
  blockers for the campaign spec.
- 2026-06-28: Composed army-in-city labels now reserve measured overlay space
  against nearby city labels in the label atlas pass. The close Roma scene
  asserts that the combined `1ST LEGION`/`ROMA` label does not cull
  `OSTIA/PORTUS` just because rectangles touch. This keeps city/army nesting
  policy centralized in screen-space label layout rather than tuning per-city
  offsets.
- 2026-06-28: The current LoD matrix is not final acceptance. User review still
  finds city-label distance, missing trees/carts, green terrain weakness,
  mountain readability, and road/junction quality blockers across multiple
  zooms.
