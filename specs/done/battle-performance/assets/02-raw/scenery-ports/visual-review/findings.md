# Fresh scenery-port visual review

## Scope / method
Inspected all 36 full committed PNGs: raw/typegpu/vgpu × samples 1/4 × tactical-plain/tactical-repeat-plain/horizon-plain × actualRgba/expectedRgba. Working tree was clean. No implementation, report.json, or prior reviews read; no browser/GPU work or tracked edits. Decoded PNGs and made 3× nearest-neighbor crops with web/node_modules/pngjs. `expectedRgba` is called “source” here solely by the supplied filename convention.

Target: identical scene/camera should preserve content, occlusion, grounded contact and coherent lighting across backends and repeats. Source images are evidence, not automatically ground truth.

## Finding — P2: Source tactical shadows change on repeat (confidence 0.99)
All three backends' source images, at both sample counts, change the ground-shadow layout between tactical-plain and tactical-repeat-plain without a visible change in camera, soldiers, props or surface lighting. At the foreground tree foot (~190,345), the first source shadow extends left as well as right; the repeat removes the leftward segment. Soldiers acquire prominent rightward row shadows; the rear-right tree's short first-frame shadow becomes a much larger branched silhouette. Backend actual images already show the repeat layout on the first capture and remain visually stable. This makes the first source PNG an inconsistent visual reference; do not “fix” backend shadows to match it. Confirm and stabilize source capture state before replacing that reference. Images establish the inconsistency, not its implementation cause.

Evidence (first LEFT / repeat RIGHT):
- [Tree-foot shadow](repeat-s1-expected-treeShadow-3x.png), source rectangle x145 y319 w188 h45.
- [Soldier shadows](repeat-s4-expected-soldiers-3x.png), x326 y207 w158 h73.
- [Rear-right tree shadow](repeat-s4-expected-backShadows-3x.png), x482 y161 w202 h62.
- [Backend repeat control](repeat-s4-actual-soldiers-3x.png).

Source first→repeat changes 15,557 pixels at samples=1 and 16,957 at samples=4 (3.96% / 4.31% of the frame); corresponding actual repeats change only 90–91 / 1 pixels. These counts corroborate the visible localized shadow changes, not a quality score.

## Other checks / no additional actionable visible defect
- **Backend agreement — confidence 0.99:** no visible backend-specific differences. Relative to raw, typegpu differs at only 2–9 pixels and vgpu at 2–17 pixels per image. All corresponding source images are decoded-byte identical across backends.
- **Depth / silhouettes / missing content — confidence 0.94:** all 12 soldiers in the tactical 4×3 formation, four trees, central shrub and rock cluster are retained. Horizon soldiers overlap in depth as expected for the lower viewpoint; no clear scenery-through-soldier, missing-face, detached-rock-face or changed silhouette defect. Rock face tones and tree overlaps match the sources.
- **Grounding / lighting — confidence 0.93:** feet, trunks and rock bases meet the ground; no clear floating or sinking regression. Outside the first-source shadow mismatch, ground shade and model lighting agree. Repeat and horizon pairs have no material visible divergence.
- **Artifacts / sample counts — confidence 0.92:** foliage is stippled and thin edges stair-step, particularly at samples=1, but this is shared with the source; samples=4 softens edges without losing obvious content. No independently supported port regression. The hard terrain-platform boundary in horizon is shared by every pair, not a new missing-terrain finding.
- **Actual repeats — confidence 0.98:** no visible repeat defect in the backend captures. Static PNGs cannot establish animation stability, temporal flicker, or behavior outside these views.

## Verdict
Backend images are visually consistent with each other and the repeat/horizon sources. First tactical source references need correction/confirmation; do not reject the ports on that first-frame mismatch alone. No implementation correctness conclusion is supported by this image-only audit.

## Artifacts
- 84 pair-crop PNGs: `<backend>-s<samples>-<scene>-<region>-3x.png`; actual LEFT, expected RIGHT, white separator.
- 12 repeat-crop PNGs: `repeat-s<samples>-<actual|expected>-<region>-3x.png`; first LEFT, repeat RIGHT. Raw represents all three visually indistinguishable backends; all backend pair crops are retained.
- `measurements.json`: all source paths, dimensions, decoded RGBA hashes and pair/repeat/backend pixel comparisons.
- `crop.cjs`, `repeat.cjs`: reproducible pngjs crop/measurement scripts.
