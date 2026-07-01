# Slice 03B4C5B4B1A1U - field-fiber source topology

## Status

Rejected on 2026-07-01. Evidence lives under
`assets/03b4-evidence/03b4c5-close-foreground-lab/field-fiber-source-topology/`.
The source topology implementation is useful renderer-lab plumbing: it adds a
`field-subcell` source mode and publishes source-cell/micro-source telemetry.
Visually, it is not accepted. Dense subcell variants improve edge energy over
the B4B1A1T per-record context, but they still read as isolated clumps and
marker/ruler posts on smooth ground, not a continuous close grass body.

## Contract

Prove whether a non-card close grass body can come from a denser **source
topology** before changing coverage, strand scale, palette, atlas content, LOD,
camera-relative generation, fog, terrain, cliffs, water, or the final reference
route.

B4B1A1T proved that one small fiber mesh per existing close-lab field record is
the wrong seam: the variants remove `texture-volume` cards but render as sparse
regular pins on flat ground. This slice owns only the next seam: generate a dense,
deterministic close-body source inside the fixed B4B1A0 lab, anchored to field
cells/subcells rather than to one visible primitive per accepted record.

## Approach

- Start from the fixed B4B1A0 lab and B4B1A1T evidence.
- Freeze camera, crop windows, target crop, meadow/root material, terrain,
  lighting, palette, field seed, fog, and review guides.
- Keep the B4B1A1T `field-fiber-body`/bundle primitive families available as the
  visual glyphs, but do not judge this slice as a primitive-shape pass.
- Add an experimental close-body source mode such as `field-fiber-subcell` or
  `field-body-source-grid` that expands each eligible close field cell into many
  small deterministic micro-sources with jittered positions, heights, normals, and
  orientations.
- Compare a tiny source-topology matrix:
  - B4B1A1T selected `field-fiber-dense` as the rejected per-record context;
  - dense field-cell/subcell source using the same non-card fiber primitive;
  - one alternate spacing/jitter profile that intentionally breaks the visible
    marker-post rhythm.
- Publish source telemetry separately from primitive telemetry: source mode,
  source cells, micro-sources per cell, visible records, submitted triangles,
  close-crop density/edge stats, and whether the source is fixed-lab only.

## Fixed Inputs

- Do not change camera, crop windows, target images, meadow/root material,
  terrain, lighting, palette, atlas content, fog, water, cliffs, sky, or final
  reference-route constants.
- Do not use `texture-volume` cards, alpha sheets, or atlas-card meshes as the
  accepted body path. They may appear only as archived context.
- Do not make the source camera-relative yet. B4C0-B4C3 own the production
  camera-relative domain after the close-body look exists.
- Do not tune final body coverage, strand scale, clump softness, palette, or LOD
  collapse in this slice. If the source starts producing useful body but needs
  coverage/scale/colour work, accept the source seam conditionally and hand those
  variables to B4B2-B4B5.

## Accept / Reject

Accept if one dense field-cell/subcell source removes the B4B1A1T marker-post
rhythm, preserves visible close grass body, and still avoids the rejected
`texture-volume` curtain/hay-mat/card-wall read.

Reject if the new source remains empty, becomes pixel grit, creates visible grid
or comb artifacts, needs unbounded records/triangles before close body appears,
or only looks better by changing camera, palette, fog, atlas content, terrain, or
full-scene composition.

## Verification

- Archive variant contact sheet, full lab shots, close/tight crops, stats JSON,
  comparison reports, and decision note under
  `assets/03b4-evidence/03b4c5-close-foreground-lab/field-fiber-source-topology/`.
- Include B4B1A1T selected `field-fiber-dense` crops and the target close-hero
  crop as context.
- Use `compare-screenshots` against the target close crop and the rejected
  B4B1A1T `field-fiber-dense` crop. Judge only source-topology/body preservation:
  dense continuous close body, absence of regular marker spacing, and no return to
  card sheets.
- Run unprimed `screenshot-critique` scoped to: "Does any dense field-cell source
  preserve close grass body without card artifacts or marker-post spacing?"
- Open the variant sheet with `preview-shots` as a non-blocking checkpoint; if the
  user stays silent, record the decision and continue on the evidence.
- Keep focused lab route checks and `bun run --cwd web typecheck` green.

## Next Slice

Rejected. Continue at
`03b4c5b4b1a1v-continuous-strand-body-representation.md`. Do not return to
`03b4c5b4b1a2-close-body-perf-envelope.md` until a body representation is
accepted.
