# Fresh water-port visual review

## Scope and method

Inspected all 16 requested actualRgba/expectedRgba pairs: TypeGPU and vgpu × lake and ocean × 1 and 4 samples × overview-t0 and horizon-t3.25. Each original is 768×512. Viewed full-resolution side-by-side panels and 40 tight nearest-neighbor 3× water, shore/edge, and horizon crop panels. Also inspected 3× crops around the two ocean-4 horizon maximum-difference locations. **Left is actual; right is expected**, except *-native-full.png where right is native actual.

Target: recognizable water with coherent ripple highlights, readable shallow/deep transitions, and a shore/horizon that does not look like an exposed cutout. Matching expected pixels is evidence of fidelity, not evidence that the reference looks natural.

No implementation source, capture report.json, summary.json, asset README, or prior judgments were read. Only general review/aesthetic skill guidance was consulted. No GPU/browser work or tracked edits. PNG decoding, comparisons, and nearest-neighbor crop creation used pngjs from /Users/david/dev/game-battle-performance-spec/web/node_modules. Metrics compare raw RGB bytes, without perceptual weighting; alpha differences were checked separately. These are fresh measurements, not inherited report values.

Native images were absent at this worktree's assets/02-raw/water location, so the native PNGs were read from /Users/david/dev/game-battle-performance-spec/specs/battle-performance/assets/02-raw/water (tracked paths confirmed). All 16 corresponding native actual images were compared numerically; lake/ocean 4-sample horizon native panels were also visually inspected. Image geometry and feature registration agree. Capture settings beyond filenames and visible framing were not independently verified.

## Verdict

**No material visible port-specific regression in these captures. High confidence (0.98).** Neither TypeGPU nor vgpu is visibly less wrong than its expected image at full size or in the inspected 3× crops. Water coverage, ripple placement, shallow/deep colors, reflection structure, shoreline silhouette, and sky registration agree. No new missing patch, seam, broad brightness shift, or displaced highlight is apparent. This is a still-image fidelity verdict, not shader/code correctness, temporal stability, or performance validation.

**Both actual and expected retain substantial source-shared visual limitations.** Lake shore quality is the clearest problem; ocean reads more convincingly as water, but its finite boundary and distant sparkle remain conspicuous. These are not new port findings.

## Concrete visual observations

1. **Lake: large stair-stepped gray perimeter and blocky color transitions — high confidence (0.99), source-shared.** In overview-t0, the round pool is surrounded by broad gray, wave-textured slabs with rectangular steps, not merely single-pixel jaggies. Interior cyan/deep-blue transitions also reveal a coarse grid. In horizon-t3.25, the near perimeter becomes angular wedges and straight slab edges. This makes the lake read as a cut-out tiled surface rather than water meeting a natural bank. Four samples soften individual edge pixels but do not remove the large steps. Both ports, both expected sets, and the native comparison retain it. See [lake shore 3×](typegpu-lake-4-overview-t0-shore-3x.png) and [low-angle lake shore](vgpu-lake-4-horizon-t3.25-shore-3x.png).

2. **Lake: a smooth blue/cyan halo lies outside the sharply bounded ripple layer — high confidence (0.98), source-shared.** The full overview shows a dark teal band separating the gray stepped surface from green ground. At low angle it becomes a pale cyan strip. The contrast between soft outer color and hard inner cutout makes the layers appear detached, weakening where the actual bank/water contact is supposed to be. The blue center still makes the object identifiable as a pool; the perimeter is the readability failure. This is a visual description, not a claim about depth/blend implementation. See the same shore crops and [native comparison](vgpu-lake-4-horizon-t3.25-native-full.png).

3. **Ocean: useful shallow-to-deep color readability, but an unnaturally straight exposed boundary — high confidence (0.98), source-shared.** Overview-t0 has a clear gold/gray shallow strip, cyan middle, and dark-blue deep water. Fine ripples remain visible across that transition in actual and expected. However, the left edge is ruler-straight against a featureless ochre region; the transition is a material test strip rather than a developed coastline. At horizon-t3.25, a hard near-edge silhouette exposes a narrow ochre wedge along the bottom, and the distant left corner reveals the finite sheet. Do not interpret the bottom edge as proven intended shoreline: it is visibly a water-sheet boundary, but the PNG alone cannot establish its world meaning. See [overview shore](vgpu-ocean-4-overview-t0-shore-3x.png), [near edge](typegpu-ocean-1-horizon-t3.25-shore-3x.png), and the full panels.

4. **Ocean horizon: dense gold/blue stippling and a pale, weakly separated distant edge — high confidence (0.96), source-shared.** The foreground has coherent rounded ripple highlights, but toward the horizon those highlights compress into fine speckle/crosshatch-like texture. The gold haze and pale water merge enough to weaken the horizon line, while the geometric corner still announces a finite plane. Four samples modestly soften the edge and distant speckle; they do not turn it into a naturally receding continuous sea. This is visible spatial noise; still PNGs cannot prove flicker, shimmer in motion, or temporal aliasing. See [1-sample horizon](vgpu-ocean-1-horizon-t3.25-horizon-3x.png), [4-sample horizon](vgpu-ocean-4-horizon-t3.25-horizon-3x.png), and [native comparison](vgpu-ocean-4-horizon-t3.25-native-full.png).

5. **Sample-count difference is small and local — high confidence (0.95).** The 4-sample versions reduce the hard one-pixel stair-step appearance along sloped/curved outlines, especially the ocean bottom edge. They do not visibly blur away the main water texture or fix lake-scale geometric blocks. No discernible TypeGPU-versus-vgpu readability advantage emerges in either sample mode. Compare the matching *-shore-3x.png panels at 1 and 4 samples.

6. **Scene/readability limits — high confidence (0.99).** These are isolated test surfaces against large plain gradient regions. Lake terrain ends in an explicit rectangular test tile, particularly obvious at the low angle. There are no units, labels, UI, developed banks, or other scale cues, so gameplay contrast, realistic shoreline integration, and readability under a full battle cannot be judged. The saturated cyan/navy plus gold highlights clearly communicate water, but do not by themselves establish finished environmental quality.

## Actual versus expected: small measured differences, not visible defects

Most changed pixels differ by only one RGB byte level. Across full frames, RGB MAE is 0.003104–0.006644 on a 0–255 scale. About 0.917–1.871% of pixels differ in at least one RGB channel; that percentage must not be mistaken for perceptually incorrect area. All lake cases and 1-sample ocean cases have maximum channel delta 1. Ocean-4 overview reaches 6 in both ports. Ocean-4 horizon reaches 12 in TypeGPU and 21 in vgpu. Only one pixel in the entire requested set has a channel delta over 16 (vgpu ocean-4 horizon). No alpha pixels differ in any pair.

The TypeGPU ocean-4 horizon has 26 pixels above delta 1; vgpu has 27. Maximum-difference crops are saved as [TypeGPU worst edge](typegpu-ocean-4-worst-edge-3x.png) and [vgpu worst edge](vgpu-ocean-4-worst-edge-3x.png). They sit in the distant edge/ripple area. Even with these coordinates located by metrics, there is no convincing coherent visible artifact in the unamplified 3× panels. Confidence that a measurable delta exists: 1.0; confidence it is a user-visible regression: low. Do not promote the single-pixel maximum into a broad rendering issue.

Native actual comparisons strengthen the source-shared attribution: all four TypeGPU ocean images exactly match native actual RGB; remaining native comparisons have MAE at most 0.000201. The large shoreline/cutout and horizon limitations cannot reasonably be attributed to a port-only change in these images.

| Case | RGB MAE /255 | Any RGB change | Max channel delta | MAE vs native actual |
|---|---:|---:|---:|---:|
| typegpu-lake-1-overview-t0 | 0.005629 | 1.645% | 1 | 0.000008 |
| typegpu-lake-1-horizon-t3.25 | 0.003104 | 0.917% | 1 | 0.000003 |
| typegpu-lake-4-overview-t0 | 0.005624 | 1.643% | 1 | 0.000008 |
| typegpu-lake-4-horizon-t3.25 | 0.003111 | 0.919% | 1 | 0.000003 |
| typegpu-ocean-1-overview-t0 | 0.005258 | 1.537% | 1 | 0.000000 |
| typegpu-ocean-1-horizon-t3.25 | 0.006299 | 1.852% | 1 | 0.000000 |
| typegpu-ocean-4-overview-t0 | 0.005285 | 1.541% | 6 | 0.000000 |
| typegpu-ocean-4-horizon-t3.25 | 0.006565 | 1.870% | 12 | 0.000000 |
| vgpu-lake-1-overview-t0 | 0.005626 | 1.644% | 1 | 0.000009 |
| vgpu-lake-1-horizon-t3.25 | 0.003115 | 0.920% | 1 | 0.000014 |
| vgpu-lake-4-overview-t0 | 0.005621 | 1.643% | 1 | 0.000009 |
| vgpu-lake-4-horizon-t3.25 | 0.003122 | 0.922% | 1 | 0.000014 |
| vgpu-ocean-1-overview-t0 | 0.005270 | 1.540% | 1 | 0.000012 |
| vgpu-ocean-1-horizon-t3.25 | 0.006304 | 1.854% | 1 | 0.000014 |
| vgpu-ocean-4-overview-t0 | 0.005297 | 1.545% | 6 | 0.000013 |
| vgpu-ocean-4-horizon-t3.25 | 0.006644 | 1.871% | 21 | 0.000200 |

## Artifacts and limits

- [metrics.json](metrics.json): full-frame, native comparison, and crop metrics; exact crop bounds as [x,y,width,height], origin top-left.
- [outliers.json](outliers.json): ocean-4 horizon pixels whose maximum RGB delta exceeds 1, and maximum-difference crop bounds.
- *-full.png: 16 actual/expected full-resolution panels; *-native-full.png: corresponding native panels.
- *-3x.png: nearest-neighbor zooms without blur or difference amplification. Some low-angle lake water crops include the near rim/background because the projected water surface is shallow; the full panels and separate interior overview crops supply context.
- [inspect.cjs](inspect.cjs), [outliers.cjs](outliers.cjs): reproducible offline PNG processing. No browser/GPU execution is involved.

No causal shader diagnosis, animation verdict, device portability claim, or change to committed baselines is warranted from this inspection. For port fidelity these sampled stills are visually equivalent; for finished water quality both sides need the shared lake boundary and finite-plane presentation addressed.
