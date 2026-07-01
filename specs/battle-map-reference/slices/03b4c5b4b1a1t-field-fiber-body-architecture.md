# Slice 03B4C5B4B1A1T - field-fiber body architecture

## Result - rejected on 2026-07-01

This slice landed the non-card `field-fiber-body` and `field-fiber-bundle`
primitive families plus the `foreground-close-lab-field-fiber-body-*` evidence
snapshots, but the visual result is rejected.

Evidence lives under
`assets/03b4-evidence/03b4c5-close-foreground-lab/field-fiber-body-architecture/`.
The candidate sheet, crops, raw captures, stats, target comparisons, rejected-card
comparisons, and decision note show the same failure:

- `field-fiber-body`, `field-fiber-dense`, and `field-fiber-bundle` remove the
  worst `texture-volume` card/chunk artifacts;
- they do so by becoming almost empty: sparse upright pins over smooth green
  ground, with repeated spacing that reads like debug markers rather than grass;
- against the target close crop, the fiber candidates retain only
  `0.13320x`-`0.15347x` of target edge energy;
- against the rejected `texture-volume` crop, they retain only
  `0.09140x`-`0.10662x` of the card crop's edge energy;
- the selected `field-fiber-dense` path submits `193392` triangles from `1343`
  source records with zero texture bytes, so this is not a simple
  "add a few more per-record fibers" problem.

The immediate next slice was
`03b4c5b4b1a1u-field-fiber-source-topology.md`, which changed the close-body
source topology inside the fixed B4B1A0 lab. That slice and the following
B4B1A1V strand-mat representation pass are now also rejected. Current work
continues at `03b4c5b4b1a1w-field-owned-strand-material-domain.md`.

## Contract

Find a close grass body architecture that is **not** the rejected
`texture-volume` card carrier. B4B1A1 picked `texture-volume` only as
least-wrong; B4B1A1R proved shallow shape repair fails; B4B1A1S proved alpha,
cutout, and dither render semantics still leave card islands or erase body.

This slice owns the next body primitive family only: many small field-owned
strand/fiber elements arranged from the existing B4B1A0 field records. It does
not own broad density, perf budget, final coverage tuning, atlas colour/content,
palette, camera-relative generation, LOD collapse, cliffs, water, sky, fog,
terrain silhouette, or final reference compose.

## Approach

- Start from the fixed B4B1A0 lab and B4B1A1/B4B1A1R/B4B1A1S evidence.
- Freeze camera, crop windows, target crop, meadow/root material, terrain,
  lighting, palette, field records, and review guides.
- Do **not** reuse the `texture-volume` atlas-card mesh. Add a separate
  experimental family such as `field-fiber-body` that emits small deterministic
  strand/ribbon elements from field records/cells.
- Compare a tiny architecture matrix inside the close lab:
  - rejected `texture-volume` current as context only;
  - one or two untextured/tapered strand body variants with many small upright
    fibers per selected field cell;
  - optional bundled-fiber variant if it preserves body without card sheets.
- Keep the judged variable to body architecture: field-owned small fibers versus
  texture-card sheets. If a candidate only works by changing density, camera,
  palette, fog, atlas content, or full-scene composition, stop and reslice.

## Accept / Reject

Accept if one non-card body family keeps visible close foreground grass body,
removes the hanging curtain / hay-mat / card-wall read, and does not collapse
back to smooth painted ground or isolated oversized clumps.

Reject if the small-fiber family is invisible, becomes noisy pixel grit, still
clusters into card-like sheets, needs unbounded record counts before it is
visible, or requires changing unrelated visual variables.

## Verification

- Archive variant contact sheet, full lab shots, close/tight crops, stats JSON,
  and decision note under
  `assets/03b4-evidence/03b4c5-close-foreground-lab/field-fiber-body-architecture/`.
- Include the target close-hero crop and B4B1A1S `texture-volume` rejection
  crops as context.
- Use `compare-screenshots` against the target close crop and rejected
  `texture-volume` crops. Judge only card-artifact removal and preserved close
  body; do not accept/reject for final density, strand scale, or palette.
- Run unprimed `screenshot-critique` scoped to: "Does any non-card field-fiber
  body architecture remove texture-card artifacts while preserving close grass
  body?"
- Open the variant sheet with `preview-shots` as a non-blocking checkpoint.
- Keep focused lab route checks and `tsc --noEmit` green.

## Next Slice

Rejected. `03b4c5b4b1a1u-field-fiber-source-topology.md` and
`03b4c5b4b1a1v-continuous-strand-body-representation.md` have since also been
attempted and rejected. Continue with
`03b4c5b4b1a1w-field-owned-strand-material-domain.md` before perf, coverage,
palette, LOD, or camera-relative work.
