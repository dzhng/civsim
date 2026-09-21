# Fresh image-only critique

Inspected all 14 expected/actual pairs (640×400), full frames first, then nearest-neighbor tight3x crops. **Expected is left; actual is right.** Only supplied PNGs were used as scene evidence; no implementation, prior review, browser or GPU work. Artifacts were written only here. Target: opaque visible surfaces should interrupt overlapping cues without removing exposed portions; markers should remain distinguishable at native scale.

## Verdict
**No visible expected/actual regression in these captures (high confidence, 0.99).** This is a static-image verdict, not implementation or runtime validation. Neither member of a pair is visibly preferable.

- **Pairs (0.99):** All seven cases agree visually at both sample counts, including crops. Every changed RGBA channel differs by at most 1/255; no pixel exceeds a channel delta of 16. Changed-pixel fractions are 0.362–0.922%, with RGB MAE 0.00123–0.00314 on the 0–255 scale. These tiny distributed changes are not visible feature displacement.
- **Central occlusion (0.97; full + crops):** In composed/ground the horizontal ground cue ends at the brown block's left edge and resumes at its right edge, without a visible stroke through the face. In ring/composed, the orange ring's upper/interior covered portion disappears, while its side arcs and thin lower arc remain exposed. Blue/red neighboring rings stay intact. Unoccluded restores the orange ellipse and continuous crossing cue. Actual composed versus unoccluded changes only the block footprint: samples-1 bounds x302–337/y193–228 (1,292 pixels); samples-4 x301–338/y193–228 (1,333 pixels), consistent with a slightly softened edge. No obvious displaced clipping boundary or oversized empty halo.
- **Partially exposed markers (0.96; full + crops):** Composed shows the three gold marker tops above the green plane; their lower portions cut off exactly at the plane's straight upper edge (about y134). Marker-only shows three complete capsules, about y102–152. This is visible evidence for clipping aligned with an opaque surface, rather than arbitrary truncation. The horizon view likewise retains marker tops above the plane.
- **Fully covered markers (visibility 0.99; geometric proof limited):** Marker-occluded shows no marker fragments anywhere, just plane and central block, in both pairs. However, no exposed contour or same-position unoccluded counterpart within that case establishes where those hidden markers lie. The separate marker-only positions are above the plane, so their disappearance cannot by itself prove same-position coverage. These images demonstrate absence, not the hidden markers' depth/placement. Do not treat this as proof that all three are correctly behind the block.

## Readability limits, shared by both sides

- **High confidence (0.97):** At the horizon angle the rings collapse into short, broken near-horizontal strokes and overlap the dashed cue; the orange ring is mostly masked. Reading complete selection ellipses is poor at native size. 4-sample edges are somewhat softer but do not recover silhouette clarity. See horizon tight3x.
- **High confidence (0.95):** The ground cue is extremely thin and faint against green; the warm elevated line also has limited contrast on the gold background. Ring hues are clearer than these lines. Gold markers separate spatially, but their similar silhouettes/shading and subtle vertical color detail do not communicate strong individual identities at full-frame size.
- **Moderate confidence (0.85):** The flat brown block and unshaded plane give weak volumetric depth cues. In horizon, the warm horizontal line visibly crosses the gold marker faces. With no depth information for those elements, that crossing cannot be labeled an ordering error from PNGs alone.

## Artifacts

- `s{1,4}-*-full.png`: all seven complete pairs, no rescaling.
- `s{1,4}-*-tight3x.png`: 18 paired feature crops, including central block/rings/line, marker tops, complete markers and empty covered-marker regions.
- `crop-bounds.json`: exact source crop rectangles and layout convention.
- `metrics.json`: all 14 expected/actual pixel measurements; diff bounds include tiny background differences and are not geometry masks.
- `occluder-metrics.json`: composed/unoccluded actual-image footprint measurements.
- `make.cjs`: reproducible PNG-only artifact/metric script using web/node_modules/pngjs.
