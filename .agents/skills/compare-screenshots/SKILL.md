---
name: compare-screenshots
description: Compare screenshots for any visual change. Use when a UI, game, document, render, chart, or generated asset needs objective visual telemetry, side-by-side inspection, crop/zoom review, or a fresh second opinion before accepting or rejecting the change.
---

# Compare Screenshots

Use this when screenshot telemetry helps judge a visual change. The job is not
to worship a score; it is to make visual review less hand-wavy by combining
side-by-side inspection, crops, structural metrics, and a plain-language
judgment against the actual visual requirement.

## Workflow

1. Name the visual question first: what should be preserved, improved, removed,
   or made more readable? The question can be parity, but it can also be
   "does this look better", "did the label move down", "is the shadow under the
   object", "did the chart stay legible", or "did the layout stop overlapping".
2. Confirm the pair is comparable enough for that question: same viewport, DPR,
   route/page, frozen time/tick, camera intent, UI state, data, and font/assets
   where those matter. If they are not comparable, fix capture setup or compare
   only a crop/feature where the mismatch does not matter.
3. Generate artifacts appropriate to the question:
   - original side-by-side
   - key-feature crops or zooms
   - grayscale versions
   - absolute grayscale heatmap
   - pixelmatch diff
   - Sobel/edge maps for each image
   - edge-difference heatmap
   - JSON metrics
4. For disputed or high-stakes visual calls, ask a fresh subagent for an
   unbiased review using `references/subagent-visual-review.md`. Give it only the
   two images and neutral labels like Image A/Image B.
5. Read the artifacts yourself. Use the metrics to guide investigation, but
   identify the visible issue in plain terms: wrong camera, missing content,
   bad hierarchy, weak contrast, incorrect depth, text overlap, layout shift,
   clipped edge, unexpected blur, or a style mismatch.
6. Decide against the named visual requirement, not against the score alone. Do
   not hide content, blur details, crop away differences, or make the capture
   less truthful to improve a number. If the candidate is visibly more complete,
   dimensional, legible, or beautiful, a distance score may rise; record why and
   keep going toward the better image.

## Useful Metrics

Pick metrics that answer the question. For full visual regressions, report:

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

For UI/document/layout reviews, also use crop bounds, text/foreground mask
coverage, contrast checks, edge clipping, element positions, and before/after
dimensions when those are more meaningful than global pixel distance.

## Difference Score

When a single fixed-pair score is useful, this default score works well for
structural screenshot changes:

`parityDistance = 0.35 * diffRatio32 + 0.25 * pixelmatchRatio + 0.25 * edgeDiffRatio32 + 0.15 * min(1, abs(log2(edgeEnergyRatio)))`

Lower is more similar to the reference. It is **not** always better. This score
intentionally weights structural edge mismatch as heavily as grayscale mismatch,
because missing content often shows up as edge loss, but richer terrain,
clearer models, stronger labels, real depth, or better lighting can legitimately
increase the score. Rename the field for the task if "parity" is misleading;
the important part is reporting what the score measures and what it does not.

Report the full-frame score and, when UI dominates the shot, a labeled world-crop
score. Use the world-crop score to locate renderer movement, and keep the
full-frame score so UI/camera mistakes remain visible.

## Score Discipline

- Establish the starting score before editing. Every iteration should quote the
  previous and new score for the same pair, then explain whether movement is a
  regression, an intentional improvement over the reference, or diagnostic
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

## Tooling

Use this skill's bundled scripts as reusable reference tools. Keep comparison
scripts inside the skill or a temporary workspace, not in product code, unless
the product genuinely needs screenshot comparison at runtime.

- `.agents/skills/compare-screenshots/scripts/visual-parity-diff.mjs` is a
  reusable local helper. Run it with `REFERENCE_DIR=<png-folder>`,
  `CANDIDATE_DIR=<png-folder>`, and optional `OUT_DIR=<artifact-folder>`.
  Optional `REPORT_ORDER=a,b,c` pins report ordering, and
  `CROPS_JSON=<file>` adds labeled crops. Crop JSON is keyed by image id and
  each crop can use pixel values or `{ "unit": "ratio" }` normalized bounds.
- For other tasks, adapt the same artifact set: side-by-side, crops, grayscale,
  heatmaps, pixelmatch, edges, JSON metrics, and a short written verdict.
- If a needed pair is not covered, extend the skill helper or create a
  task-local comparison script under the skill workflow instead of adding
  one-off scripts to the application.

## References

- `references/subagent-visual-review.md`: neutral subagent prompt/config for an
  independent screenshot parity judgment.
