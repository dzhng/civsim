# Independent city-name owners

Bright roads and card backgrounds cannot substitute for city names. The regional
scene now checks seven expected canvas names and thirteen independently projected
owned-city titles against their own hidden-owner controls. Six canvas names must
fit completely; Puteoli is explicitly a bottom-clipped edge case and must still
contribute visible text. That partial check does not claim complete readability.

Both missing-owner controls fail their own presence check while preserving the
other owner. Restoring visibility reproduces the original frame exactly. No world
pixels outside the canvas glyph quads or DOM card surfaces change. DOM card bounds
are intentional: font rasterization extends beyond DOM text ranges;57 fringe
pixels were all inside their card. Title presence itself remains restricted to the
title rectangle, so card background/income cannot satisfy missing-title coverage.

The final browser run proves these contracts. The full campaign-lod scene still
has10 failures: nine older snapshots and the southern-Apennine natural-ground
coverage assertion (0.5444). No snapshots were refreshed and the slice remains
open. Independent code review found no concrete defects. The four control images
were saved during the preceding run; identical per-name counts and exact restored
frames in the final run preserve their evidence scope.

## Changed checks

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| Regional map structure | Whole-image labelRatio≥0.002 | Existing sea/land/road/wash floors retained; names checked separately | Bright unrelated pixels cannot prove labels. **moved** |
| Canvas city names | No per-name paint proof | Seven required names contribute >20 pixels with summed RGB difference>10 versus hidden glyphs; icons excluded | Reuses raised-label paint-presence threshold, not a readability score. **moved** |
| Owned-city titles | No per-title paint proof | Required owned-city titles contribute >20 changed pixels in their title rectangles | Expected ownership/projected anchors come from map state, not only rendered cards. **moved** |
| Missing canvas names | No fault control | Canvas names fail while titles pass | Detects loss of canvas text independently. **moved** |
| Missing card titles | No fault control | Titles fail while canvas names pass | Detects loss of DOM text independently. **moved** |
| Restored controls | No repeat assertion | Exact normal/restored pixel equality | Fault controls must not alter persistent rendering state. **moved** |
| Outside-owner world | No isolation proof | Zero changes outside glyph/card surfaces for either control | Confines the fault to its owning surface; does not claim all non-title pixels inside cards unchanged. **moved** |
