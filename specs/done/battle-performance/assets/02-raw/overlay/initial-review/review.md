# Fresh overlay visual review

## Scope and verdict

Inspected all 22 full actual/expected pairs (44 source PNGs, each 640×400) in `specs/done/battle-performance/assets/02-raw/overlay/samples-{1,4}`: composed, marker, marker-occluded, ground, ring, horizon, growth, shrink, empty, effect and triangle. Viewed full frames side by side without resizing their constituent images, then nearest-neighbor tight3x crops through the image tool. No implementation, report.json, prior assessments or code diff was read. No browser/GPU work or tracked edits. Temporary scripts use the repository's `web/node_modules/pngjs`.

Target used for visual judgment: distinguishable cues, stable silhouettes and stripes, coherent intersections, and no visible remnants where cues are absent. Expected images are comparators, not proof that shared behavior is correct. Precise intended colors, blend behavior and occluder geometry cannot be established from these images alone.

**No visible actual-versus-expected regression found (confidence 0.99).** This is not an implementation-correctness certification. The shared visual concerns and limitations below remain even though the pairs match.

## Concrete observations

| Observation | Full-frame visibility | Tight3x visibility | Confidence and interpretation |
|---|---|---|---|
| Horizon cues lose legibility: the blue and red rings collapse into separated horizontal fragments; orange becomes short side/bottom strokes. The triangle is a very shallow colored sliver. | Clearly much harder to read than composed; the original shapes are difficult to distinguish at 640×400. | Fragmented outlines and interrupted arcs are explicit in `samples1-v-4-horizon-tight3x.png`. | 0.99 observed; medium confidence this needs a visual remedy, conditional on cues needing to remain legible at this viewing angle. Shared by actual and expected, both sample counts. Not evidence of a newly introduced defect. |
| The ground cue is an extremely thin, low-contrast cyan/ochre segmented line with a central gap. | Faint but present in ground; easily lost against the green plane. | Alternating colored segments are clear; gap remains clean. `1-ground-tight3x.png`, `4-ground-tight3x.png`. | 0.98 observed; intended dash/color pattern and minimum contrast are unknown. Do not call this z-fighting from a still. |
| Marker contours have stepped/chamfered shoulders, and the right marker has a narrow vertical ochre stripe left of its center. | Contour is polygonal but stable; stripe is subtle. | Steps and stripe are clear. Samples-4 modestly softens outer edges compared with samples-1; no visible stripe break, halo or displaced contour. | 0.99 observed. No pair discrepancy. The horizon shot instead shows blue/red stripes on the first two markers; this is a different camera/scene and cannot establish an erroneous stripe change. |
| Ring/line intersections show cyan/ochre line segments across blue/red ring interiors, with no visible doubled contour or spike. The center orange ring lacks its upper arc and has small gaps separating side strokes from the bottom arc. | Center reads as an open U; small lower gaps are much less apparent. | Side/bottom separation is explicit in ring/composed crops. Central line gap aligns with the open central area. | 0.99 observed. Shared by both sides. No distinct occluder silhouette explains all missing portions, so correctness of the cutout is unproven; do not label it a rendering failure without scene intent. |
| Growth is visibly brighter/more saturated than composed: especially the red/orange outlines and RGB triangle, also the line. Silhouettes remain essentially the same. | Visible when switching/comparing full frames. | Very obvious in `4-composed-v-growth-tight3x.png` (composed left, growth right). | 0.99 observed. Occurs equally in actual and expected and at both sample counts. Could be intentional repeated overlapping cues; cannot infer a stale-buffer or alpha bug from the filename. |
| Shrink returns exactly to composed; empty contains only the background and green plane. | No extra cue or residual marker visible. | Empty central crop is uniformly green. | 1.00 for saved-pixel comparison: composed/shrink are byte-identical after decoding, separately for each side and sample count. This does not prove temporal cleanup between saved frames. |
| Marker-occluded contains no marker at all, and is pixel-identical to empty. Composed retains three marker tops above the rear plane boundary. | Complete absence in marker-occluded; partial tops clearly visible in composed. | Marker-occluded crop has only the background/plane boundary, no leaked stripe. | 1.00 saved-pixel result. A positive no-leak observation, but absence alone cannot distinguish successful depth rejection from markers not being submitted. |

## Pair, sample-count and repeat discrepancies

All 22 actual/expected pairs have **maximum RGBA channel delta 1 on the 0–255 scale**; none has any pixel over 16. Differences are not visibly distinguishable in full images or crops. Full-frame RGBA MAE ranges from 0.0009248 to 0.0023545. Raw unequal-pixel counts are 926–2361 of 256,000; treating these tiny differences as failed visual parity would be misleading.

| Case | Unequal pixels samples-1 | Unequal pixels samples-4 |
|---|---:|---:|
| composed / growth / shrink (each) | 930 | 926 |
| marker | 1089 | 1089 |
| marker-occluded / ground / ring / empty / effect / triangle (each) | 952 | 948 |
| horizon | 2354 | 2361 |

The composed, ground, ring, growth, shrink and empty selected cue crops are **exactly identical** within their actual/expected pair. Marker crops differ at 5 pixels by at most 1; horizon crops at 48/50 pixels by at most 1. See `roi-metrics.json`.

Samples-1 versus samples-4 is NOT an independent repeat: it changes the named sample setting. Visible differences concentrate on boundary coverage: slightly softened marker/plane/triangle edges and a thicker, softer horizontal effect line (especially horizon). Both actual and expected show the same changes. Actual cross-setting unequal counts: marker 220, ground 721, ring 743, composed 1519, horizon 2209. Large isolated channel deltas here describe edge changes, not actual/expected failures.

Composed versus growth differs at 2871 pixels (samples-1) / 3237 (samples-4), maximum channel delta 149, equally on both sides. Composed versus shrink differs at zero pixels. Marker-occluded versus empty differs at zero pixels. These are cross-case comparisons, not independent capture-repeat measurements. No same-configuration independent rerun was provided/inspected, so repeat determinism, flicker and intermittent leakage remain untested.

## Evidence insufficiencies

- Matching images do not establish an independent oracle: both render paths can share a visual error. No correctness claim about depth equations, blending, alpha conventions, buffer growth/shrink, draw counts or resource lifetime follows from this review.
- These are simple synthetic scenes, not battle screenshots. No real terrain, soldiers, labels, HUD, crowding or moving camera is shown; practical cue readability in a battle remains unknown.
- The central green cutout has no distinguishable occluder surface. A same-camera visible occluder/control would be needed to verify the exact intended hidden interval. Marker-occluded's equivalence to empty is similarly insufficient alone.
- Horizon stills show poor shape readability but cannot establish shimmer or motion stability. No animation was inspected.
- Crop magnification uses nearest-neighbor replication, not reconstructed detail. It exposes existing pixels and exaggerates stair steps; crop-only roughness is not automatically a full-frame defect.
- Capture metadata, camera equality, timestamps, DPR, generation provenance and independence of expected were not verified, because this was expressly a fresh image-only review.

## Artifacts and conventions

- `*-full.png`: full-size pair, actual left / expected right, no added image labels or separators.
- `{1,4}-*-tight3x.png`: actual left / expected right; crop bounds in `crop-bounds.json` are `[x,y,width,height]` in source pixels, origin top-left.
- `samples1-v-4-*-tight3x.png`: actual samples-1 left / actual samples-4 right.
- `{1,4}-composed-v-growth-tight3x.png`: actual composed left / actual growth right.
- `metrics.json`: decoded RGBA full-frame pair, cross-setting and cross-case metrics. MAE averages absolute errors across all four channels. Difference bounding boxes are inclusive; widespread one-level background changes can make them span almost the full frame.
- `roi-metrics.json`: crop-local pair metrics and full marker-occluded/empty comparison.
- `inspect.cjs`, `crops.cjs`, `roi.cjs`: reproducible pngjs scripts; run from the repository root. All outputs remain under this temporary directory.
