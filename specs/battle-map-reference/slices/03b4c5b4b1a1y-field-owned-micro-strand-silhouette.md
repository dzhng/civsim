# Slice 03B4C5B4B1A1Y - field-owned micro-strand silhouette

## Contract

Test whether the already-proven field-owned domain can produce close grass body
when the visible primitive is pixel-scale micro-strand silhouette instead of
large shell/card strips.

B4B1A1X proved that field ownership plus real geometry is not sufficient: the
domain shell layer stayed flat in the center and introduced a few oversized
straw/card strokes. This slice owns the next hidden variable: **visible element
scale and strand multiplicity inside the field-owned domain**.

## Approach

- Start from the fixed B4B1A0 lab and the rejected B4B1A1X evidence.
- Reuse the field-owned domain seam and telemetry added by X. The visible
  element owner remains a grid/tile/field domain, not accepted source records or
  field-subcell emitters.
- Replace the large shell primitive with one or two micro-strand candidates:
  many thin tapered strokes per domain cell, bounded to close-foreground
  pixel-scale width/height, with jitter/orientation derived from domain cell id
  and terrain normals rather than source-local records.
- Add telemetry that proves the strand scale and ownership: domain id, grid size,
  domain cells, strands per cell, total micro-strands, per-strand world width and
  height ranges, overlap factor, submitted triangles, geometry/material bytes,
  coverage min/median/avg, exposed-ground estimate, and whether any visible
  element is source-attached.
- If the candidate needs coverage/palette/fog/camera/LOD tuning to look
  plausible, stop and reslice again. This slice is about representation scale,
  not density polishing.

## Fixed Inputs

- Do not change camera, target images, crop windows, terrain, meadow/root
  material, lighting, palette, fog, water, cliffs, sky, atlas content, or final
  reference-route constants.
- Do not tune final coverage, palette, wind, LOD, camera-relative generation, or
  final compose.
- Do not accept large cards, shell swipes, marker posts, texture-volume curtains,
  material-only flat carpet, source-local fans, or a few oversized strands as a
  solution.

## Accept / Reject

Accept if the close crop shows continuous grass body with fine visible strand
silhouette at the target scale, the center is no longer flat/empty, and the
structure remains field-domain-continuous rather than source-local stamps,
markers, cards, sheets, or isolated debris.

Reject if micro-strands become pixel noise, combed flat paint, oversized
stamps/cards, sparse debug marks, or an unbounded triangle count before the body
appears.

## Verification

- Archive full lab shots, target/rejected/candidate crop sheet, tight crops,
  stats JSON, micro-strand telemetry, comparison reports, and decision note under
  `assets/03b4-evidence/03b4c5-close-foreground-lab/field-owned-micro-strand-silhouette/`.
- Use `compare-screenshots` against the target close crop, rejected B4B1A1W
  material-domain crop, and rejected B4B1A1X shell-domain crops. Judge only
  center body fill, fine strand/body edge presence, visible element scale, and
  absence of card/stamp/shell artifacts.
- Run unprimed `screenshot-critique` scoped to: "Does this field-owned
  micro-strand layer create continuous close grass body at the target scale
  without flat paint, source-local marks, oversized shell/card strokes, or pixel
  noise?"
- Open the variant sheet with `preview-shots` as a non-blocking checkpoint.
- Keep focused lab route checks and `bun run --cwd web typecheck` green.

## Next Slice

Rejected on 2026-07-01. Evidence lives under
`assets/03b4-evidence/03b4c5-close-foreground-lab/field-owned-micro-strand-silhouette/`.

The field-owned micro-strand seam worked mechanically: the selected candidate
published `1450` domain cells, `36` strands per cell, `52200` micro-strands,
`417600` submitted triangles, strand width `0.005`-`0.013`, strand height
`0.083`-`0.212`, zero material bytes, and `sourceAttached=false`. The visual
failed anyway. The close crop still reads as flat paint plus isolated yellow
fleck clusters, not continuous close grass body. `compare-screenshots` recorded
only `0.19531x` target edge energy for the selected candidate and
`0.19231x` for the tall variant; against rejected B4B1A1X shell, the candidates
sit very close (`parityDistance=0.04874` / `0.04467`), meaning this changed the
shape of the artifacts more than the failed field read. The unprimed critique
called out sparse coverage, poor body continuity, source-local-looking vertical
patches, flat/debuggy ground, chunky scale mismatch, saturated yellow flecks,
and missing close-grass texture outside the clumps.

Do not continue to perf. Continue to
`03b4c5b4b1a1z-field-owned-continuous-strand-texture.md`, which keeps field
ownership but tests a continuous domain-spanning strand/nap texture rather than
per-domain-cell clustered geometry. Perf, coverage, palette, LOD,
camera-relative generation, and final compose remain blocked until a close-body
representation is accepted.
