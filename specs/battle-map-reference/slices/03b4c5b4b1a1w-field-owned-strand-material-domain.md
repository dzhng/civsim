# Slice 03B4C5B4B1A1W - field-owned strand material domain

## Contract

Test whether the close grass body can be owned by a continuous field/material
domain rather than by per-source geometry. B4B1A1V proved that even lower-profile
strand mats still inherit source-localized coverage: they add edge structure, but
as perimeter fan/card patches over an empty center. This slice owns the next
hidden variable: **domain ownership**.

The accepted output is not final grass. It is a proof that the fixed B4B1A0
close crop can contain one connected soft foreground body with fine strand
direction when the body is driven by a continuous field domain.

## Approach

- Start from the fixed B4B1A0 lab and the rejected B4B1A1V evidence.
- Freeze camera, crop windows, target crop, terrain patch, meadow/root material,
  lighting, palette, fog, source topology context, atlas content, review guides,
  and comparison crops.
- Add one continuous field-owned body layer. Good candidates include a generated
  close-body density/coverage texture, a procedural material domain evaluated in
  field space, or a screen-stable field-space strand/body shader. The domain must
  cover the whole close crop before any local strand detail is applied.
- It may consume existing field records, meadow coverage, root mass, or a new
  fixed-lab density grid, but per-source primitives must not be the owner of
  visible body coverage.
- Publish domain telemetry separately from source and representation telemetry:
  domain id, grid/texture size, world-cell size, coverage bounds, average/median
  coverage, exposed-ground estimate, texture/storage bytes, submitted geometry
  triangles if any, and whether the body is geometry-backed or material-only.
- Keep the B4B1A1U and B4B1A1V crops as rejected context. Compare against them
  to prove the new domain is not merely moving marker/fan artifacts around.
- If this domain only looks plausible after changing camera, source count,
  palette, fog, atlas art, coverage tuning, LOD, or camera-relative generation,
  stop and reslice again before touching those variables.

## Fixed Inputs

- Do not change camera, target images, crop windows, terrain, meadow/root
  material, lighting, palette, fog, water, cliffs, sky, atlas content, or final
  reference-route constants.
- Do not tune final coverage, strand scale, clump rhythm, palette, wind, LOD, or
  camera-relative generation.
- Do not accept per-source fan mats, source marker posts, texture-volume atlas
  cards, carrier sheets, or hay/curtain islands as this slice's solution.
- Do not use distance fog or colour correction to hide exposed ground.

## Accept / Reject

Accept if the close crop has a continuous lower-foreground grass body, the center
is no longer blank, strand/body direction appears as fine integrated variation,
and the visible structure is domain-continuous rather than source-localized
posts, clumps, fan patches, cards, curtains, or stamps.

Reject if the result is only a painted/combed flat carpet, pixel noise, a screen
space texture that swims or aliases, repeated tiling, source-localized patches,
or a look that depends on changing any frozen variable.

## Verification

- Archive full lab shots, target/rejected/candidate crop sheet, tight crops,
  stats JSON, domain telemetry, comparison reports, and decision note under
  `assets/03b4-evidence/03b4c5-close-foreground-lab/field-owned-strand-material-domain/`.
- Use `compare-screenshots` against the target close crop, the rejected B4B1A1U
  subcell crop, and the rejected B4B1A1V strand-mat crops. Judge only body
  continuity, center fill, fine strand/body presence, and absence of source-local
  marker/fan/card artifacts.
- Run unprimed `screenshot-critique` scoped to: "Does this field-owned domain
  create continuous close grass body without flat paint, source-localized fans,
  marker posts, or card/stamp artifacts?"
- Open the variant sheet with `preview-shots` as a non-blocking checkpoint; if
  the user stays silent, record the decision and continue on the evidence.
- Keep focused lab route checks and `bun run --cwd web typecheck` green.

## Next Slice

If accepted, continue to
`03b4c5b4b1a2-close-body-perf-envelope.md` and measure the accepted domain's
budget. If rejected, reslice close-body ownership again before perf, coverage,
palette, LOD, camera-relative generation, or final compose.
