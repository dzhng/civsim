---
name: compare-screenshots
description: Quantify visual differences between two screenshots. Use when comparing WebGPU vs archived current-renderer captures, debugging missing content/camera/brightness regressions, or needing grayscale/edge/pixel telemetry to explain visual movement without treating similarity as the acceptance target.
---

# Compare Screenshots

Use this when screenshot telemetry helps judge a visual change. The goal is not
to make WebGPU more similar to an archived renderer at all costs; it is to
measure camera, content, structure, luminance, edge energy, and readable
landmarks so humans can tell whether a change removed content, drifted, or
intentionally improved the old image.

## Workflow

1. Confirm the pair is comparable: same viewport, DPR, route, frozen time/tick,
   camera intent, and UI state. If they are not comparable, fix capture setup
   before scoring pixels.
2. Generate comparison artifacts:
   - original side-by-side
   - grayscale versions
   - absolute grayscale heatmap
   - pixelmatch diff
   - Sobel/edge maps for each image
   - edge-difference heatmap
   - JSON metrics
3. For disputed or high-stakes visual calls, ask a fresh subagent for an
   unbiased review using `references/subagent-visual-review.md`. Give it only the
   two images and neutral labels like Image A/Image B.
4. Read the artifacts yourself. Use the metrics to guide investigation, but
   identify what is missing in plain terms: wrong camera, missing terrain,
   absent trees, bad marker shape, label mismatch, UI overlap, etc.
5. Iterate only on changes that improve the named visual requirement. Do not
   optimize a score by hiding content, blurring, cropping away differences, or
   making the capture less truthful. If WebGPU is visibly more complete,
   dimensional, legible, or beautiful than the archived renderer, the distance
   score may rise; record why and keep going toward the better image.

## Required Metrics

For each pair, report:

- `mae`: mean absolute grayscale difference, 0..255, lower is closer.
- `rmse`: grayscale root mean square error, lower is closer.
- `diffRatio16`, `diffRatio32`, `diffRatio64`: fraction of pixels over each
  grayscale delta threshold.
- `pixelmatchRatio`: mismatch ratio from pixelmatch over grayscale images.
- `edgeEnergyCurrent` and `edgeEnergyCandidate`: average Sobel edge strength.
- `edgeEnergyRatio`: candidate/current. Values far below 1 usually mean missing
  geometry, props, labels, or terrain detail; values far above 1 usually mean
  noisy/incorrect detail.
- `edgeDiffRatio32`: fraction of pixels whose Sobel edge differs materially.
- `avgLuminanceCurrent`, `avgLuminanceCandidate`, and `avgLuminanceDelta`:
  average grayscale brightness and candidate-current delta. Use this when a
  render is visibly too dark/light even if a broader parity score improves.
- Content proxies relevant to the scene, such as black/void ratio, terrain-like
  ratio, water-like ratio, team-color ratio, or label/text mask ratio.

## Difference Score

Track one primary score for each fixed pair:

`parityDistance = 0.35 * diffRatio32 + 0.25 * pixelmatchRatio + 0.25 * edgeDiffRatio32 + 0.15 * min(1, abs(log2(edgeEnergyRatio)))`

Lower is more similar to the reference. It is **not** always better. This score
intentionally weights structural edge mismatch as heavily as grayscale mismatch,
because missing content often shows up as edge loss, but richer WebGPU terrain,
clearer models, stronger labels, real depth, or better lighting can legitimately
increase the score.

Report the full-frame score and, when UI dominates the shot, a labeled world-crop
score. Use the world-crop score to locate renderer movement, and keep the
full-frame score so UI/camera mistakes remain visible.

## Score Discipline

- Establish the starting score before editing. Every iteration should quote the
  previous and new score for the same pair, then explain whether movement is a
  regression, an intentional improvement over the old renderer, or diagnostic
  noise.
- Prefer edge metrics for missing-content bugs. A flat top-down map can have a
  deceptively moderate grayscale diff while edge energy proves the 3D trees,
  roads, city forms, and army silhouettes are absent.
- Segment out stable UI when it dominates the image and the visual question is
  the world render. Keep a full-frame score too; label cropped/segmented scores
  clearly.
- If the camera is wrong, pixel scores are diagnostic only. Fix camera intent
  first, then judge the renderer.
- A lower score is not acceptance, and a higher score is not rejection.
  Acceptance requires looking at the artifacts and confirming the named visual
  requirements are visible.

## Repo Tool

Prefer this skill's bundled helper at
`.agents/skills/compare-screenshots/scripts/visual-parity-diff.mjs` when it
covers the needed pair. It auto-discovers matching PNG names under
`specs/webgpu-skinned-crowd/visualizations/current-renderer/` and
`visual-report/`, writes side-by-side, grayscale, pixelmatch, absolute diff, and
edge artifacts under `visual-diff/`, and sorts the JSON by worst
`parityDistance`. For known game-view rows where HUD/chrome dominates the full
frame, it also writes `*-world-crop-*` artifacts and a `worldCrop` score in the
JSON; use that crop to inspect renderer movement while keeping the full-frame
score visible for UI/camera mistakes. If a needed pair is not covered, extend
the skill helper rather than adding app/product scripts or hand-calculating ad
hoc metrics.

## References

- `references/subagent-visual-review.md`: neutral subagent prompt/config for an
  independent screenshot parity judgment.
