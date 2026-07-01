# Slice 03B4C5B4B1A1R - texture-volume continuity repair

## Contract

Repair the least-wrong B4B1A1 `texture-volume` body so it can become a credible
close foreground grass architecture. This slice owns **continuity and primitive
shape only**: remove the hanging-curtain / hay-mat island artifact while keeping
the fixed B4B1A0 lab and B4B1A1 comparison crop.

Out of scope: density/perf budget, broad coverage tuning, strand scale, clump
rhythm, atlas colour/content, camera-relative generation, backend policy, LOD
collapse, cliffs, water, sky, fog, terrain silhouette, and final reference
compose.

## Approach

- Start from `texture-volume`, not from the rejected mesh-only families.
- Freeze the accepted B4B1A0 lab camera, terrain, lighting, palette, meadow/root
  base, crop windows, target close crop, and absence/rejection baselines.
- Try a shallow set of shape/continuity variants that keep the same body family:
  smaller overlapping volumes, terrain-seated bases, softened alpha roots,
  staggered vertical layers, broken top silhouettes, and reduced diagonal sheet
  readability.
- Record primitive records, primitives, triangles, bytes, texture bytes, draw
  calls, and artifact class for every variant.
- Do not hide the island artifact by changing fog, camera scale, meadow colour,
  atlas hue, broad density, or full-frame composition.

## Accept / Reject

Accept if one repaired `texture-volume` variant keeps the visible close grass body
while no longer reading as separated curtain clumps, straw mats, card walls, or
flat painted ground. It does not need final coverage or final strand scale; it
must only prove the body primitive can be continuous enough to justify a perf
envelope.

Reject if every variant still depends on visible islands/curtains, if the repair
collapses back to smooth ground, if the improvement comes from unrelated visual
variables, or if the variant has no credible path to camera-relative LOD.

## Verification

- Archive variant contact sheet, selected/rejected full lab shots, close/tight
  crops, stats JSON, and decision note under
  `assets/03b4-evidence/03b4c5-close-foreground-lab/body-continuity-repair/`.
- Include the B4B1A1 `texture-volume` crop as the "current least-wrong but
  rejected" baseline, plus the target close-hero crop.
- Use `compare-screenshots` against the target close-hero crop and the rejected
  B4B1A1 `texture-volume` crop. Judge body continuity and curtain/island artifact
  only.
- Run unprimed `screenshot-critique` scoped to: "Does any texture-volume variant
  remove the hanging-curtain / hay-mat island artifact while preserving a close
  grass body?"
- Open the variant sheet with `preview-shots` as a non-blocking checkpoint.
- Keep focused lab route checks and `tsc --noEmit` green.

## Next Slice

Result: rejected. Evidence lives under
`assets/03b4-evidence/03b4c5-close-foreground-lab/body-continuity-repair/`.
The tested profiles (`current`, `seated-soft`, `overlap-stagger`,
`broken-lattice`) did not produce an acceptable body. Direct inspection,
`compare-screenshots`, and unprimed `screenshot-critique` all agree: the path is
trapped between separated curtain/hay-mat islands, giant starburst/card sheets,
and smooth exposed ground.

Continue with
`03b4c5b4b1a1s-texture-volume-alpha-render-model.md` before any perf envelope or
coverage tuning. If that render-model slice is accepted, then continue with
`03b4c5b4b1a2-close-body-perf-envelope.md` using the repaired `texture-volume`
architecture and render model. If rejected, reslice the architecture search away
from texture-volume cards before perf or coverage tuning.
