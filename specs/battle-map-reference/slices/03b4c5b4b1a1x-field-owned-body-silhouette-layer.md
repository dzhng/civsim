# Slice 03B4C5B4B1A1X - field-owned body silhouette layer

## Contract

Test whether a continuous field-owned domain can produce close grass body when it
owns real near-body silhouette/height cues, not just material colour on the
ground plane.

B4B1A1W proved that field ownership is the right direction but material-only
detail collapses into flat painted terrain with marker posts exposed. This slice
owns the next hidden variable: **field-owned silhouette**.

## Approach

- Start from the fixed B4B1A0 lab plus the rejected B4B1A1W material-domain
  evidence.
- Freeze camera, crop windows, target crop, terrain patch, meadow/root material,
  lighting, palette, fog, source topology context, atlas content, review guides,
  and comparison crops.
- Keep the body domain field-owned. The owner can be a grid/tile/heightfield
  domain, a continuous shell over the meadow texture, or a domain-generated
  strand-height layer. It must not attach visible coverage to accepted source
  records or field-subcell emitters.
- Add one or two domain-owned silhouette candidates. Good candidates include:
  low continuous shell strips generated from the meadow/body texture, a
  field-grid strand-height layer with no per-source posts, or a domain mesh whose
  cells overlap enough that the close crop reads as one body before tuning
  coverage.
- Publish silhouette telemetry separately from source and material telemetry:
  domain id, grid/texture size, cell/tile count, overlap factor, submitted
  triangles, geometry/material bytes, coverage min/median/avg, exposed-ground
  estimate, and whether any visible element is source-attached.
- If the candidate needs palette, fog, camera-relative generation, LOD, final
  coverage tuning, or per-source emitters to look plausible, stop and reslice
  again before touching those variables.

## Fixed Inputs

- Do not change camera, target images, crop windows, terrain, meadow/root
  material, lighting, palette, fog, water, cliffs, sky, atlas content, or final
  reference-route constants.
- Do not tune final coverage, strand scale, clump rhythm, palette, wind, LOD, or
  camera-relative generation.
- Do not accept source-local fan mats, marker posts, texture-volume cards,
  carrier sheets, or material-only flat carpet as this slice's solution.

## Accept / Reject

Accept if the close crop has a continuous grass body with visible height or
strand silhouette, the center is no longer blank/flat, and the visible structure
is domain-continuous rather than source-local posts, clumps, fan patches, cards,
curtains, stamps, or paint.

Reject if the silhouette layer becomes wire/straw sheets, combed flat carpet,
debug-marker rows, source-local patches, noisy pixels, or an unbounded triangle
count before body appears.

## Verification

- Archive full lab shots, target/rejected/candidate crop sheet, tight crops,
  stats JSON, silhouette telemetry, comparison reports, and decision note under
  `assets/03b4-evidence/03b4c5-close-foreground-lab/field-owned-body-silhouette-layer/`.
- Use `compare-screenshots` against the target close crop, the rejected B4B1A1V
  strand-mat crop, and the rejected B4B1A1W material-domain crops. Judge only
  body silhouette, center fill, fine strand/body presence, and absence of
  source-local marker/fan/card artifacts.
- Run unprimed `screenshot-critique` scoped to: "Does this field-owned
  silhouette layer create continuous close grass body without flat paint,
  source-local fans, marker posts, or card/stamp artifacts?"
- Open the variant sheet with `preview-shots` as a non-blocking checkpoint.
- Keep focused lab route checks and `bun run --cwd web typecheck` green.

## Next Slice

If accepted, continue to
`03b4c5b4b1a2-close-body-perf-envelope.md`. If rejected, reslice close-body
ownership again before perf, coverage, palette, LOD, camera-relative generation,
or final compose.
