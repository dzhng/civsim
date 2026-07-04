# Slice 15 - midground grass LOD collapse

## Contract

Make grass lose individual blade detail with distance while preserving a soft
green meadow mass through the midground.

This is the active pickup. Start from the retained Slice 14 field-owned grass
foundation; do not replace the foreground grass while working on this slice.

## Slice Variable

Midground LOD transition.

- **Judge:** blade-to-meadow falloff, color continuity, softness, and lack of
  visible LOD rings.
- **Do not judge:** close foreground density, cliff height, fog, or final mood.

## Architecture

- Use distance/camera-relative LOD: close geometry from Slice 14, midground
  collapsed meadow mass, far terrain material.
- Freeze the foreground look except for the minimum wiring needed to feed the
  LOD bands. If foreground grass quality becomes distracting, record it as a
  14b polish note and keep this slice focused on midground falloff.
- Keep all LOD bands driven by the same terrain eligibility and grass palette.
- Use the current screenshot's midground band as the review zone: the user should
  see grass presence, but not foreground-level strands.
- Keep the transition deterministic and instrumented.

## Review Surface

- Midground crop from the Slice 12b camera.
- Diagnostic band view showing close, mid, and far grass ownership.

## Verification

- Publish LOD band distances, record counts, draw calls, cull counts, and
  slope-rejected records by band.
- Run
  [compare-screenshots](../../.agents/skills/compare-screenshots/SKILL.md)
  against the perspective reference midground and the current band shot for
  falloff/softness only.
- Run
  [screenshot-critique](../../.agents/skills/screenshot-critique/SKILL.md)
  scoped to LOD continuity and midground meadow softness.

## Accept / Reject

Accept if foreground blades transition into soft midground meadow without
obvious rings, bare terrain, or high-detail blades far away.

Reject if the midground disappears, becomes a noisy texture sheet, or ignores
slope/rock eligibility.

## Slice 15 Checkpoint

Implemented in `battle-map-reference-midground-grass-lod-collapse`.

- The grass sampler now caps field records with a deterministic stratified
  near/mid/far budget instead of arbitrary grid iteration order, so camera-
  relative generation keeps close density without starving collapsed mid/far
  meadow records.
- The route publishes LOD telemetry through `stats.grass`: field LOD counts,
  rendered accent LOD counts, culled field records, budget-dropped records, and
  LOD radius thresholds.
- Current evidence lives in
  `assets/slice-15-midground-grass-lod-collapse/`:
  `fieldLodCounts=[7680,5920,2400]`,
  `accentLodCounts=[3194,1768,238]`,
  `accentCulledFieldRecords=9803`, `accentBudgetDroppedRecords=997`,
  `drawCalls=1`, and `invalidTintTufts=0`.
- The midground band is green meadow mass rather than foreground strands:
  under the Slice 16 crop contract, `midground.base.green=1`,
  `midground.verticalRun.tallColumnRatio=0`, and
  `midground.verticalRun.p90Height=0.05`. The remaining visible structure in
  the midground crop is terrain/rolling-band structure, not grass geometry;
  cliff/fog style remains out of scope for this slice.
- Fresh screenshot critique agrees the midground avoids foreground strands, but
  flags style debt: the meadow is too smeared/airbrushed, the ground plane reads
  too flat, grass scale cues are weak across distance, cliff bases are abrupt,
  and distant cliffs have striping/chunky cut-out silhouettes. Carry those into
  Slice 16/17 instead of reopening foreground grass architecture here.
- Compare-screenshots telemetry against the current band-composition reference
  image shows the Slice 15 candidate is materially softer/brighter
  (`edgeEnergyRatio=0.468`, `avgLuminanceDelta=19.332`). Treat that as evidence
  the LOD collapse happened, not as final style acceptance; the critique above
  is the reason Slice 16/17 must add depth/fog and composition cues.
- Shared-surface note: `sampleGrassField` still preserves the old grid-scan
  first-N cap by default. Slice 15 opts into deterministic distance-sorted LOD
  quotas with `grassLodStratified=1` (near 48%, mid 37%, far remainder), so
  Slice 14 grass baselines do not inherit the new budget split.

## Next

Run `16-band-camera-composition-lock.md`.
