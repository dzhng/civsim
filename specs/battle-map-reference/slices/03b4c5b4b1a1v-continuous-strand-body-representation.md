# Slice 03B4C5B4B1A1V - continuous strand body representation

## Contract

Find a close grass body representation that creates continuous dense foreground
mass in the fixed B4B1A0 lab without falling back to the rejected atlas-card,
hay-mat, curtain, source-marker, or sparse-post reads.

B4B1A1T proved that one non-card fiber primitive per accepted field record is
empty. B4B1A1U proved that dense field-cell/subcell micro-sources using that
same primitive only create isolated clumps and marker spacing. This slice owns
the next variable: the body representation itself.

## Approach

- Start from the fixed B4B1A0 lab and B4B1A1U evidence.
- Freeze camera, crop windows, target crop, terrain, meadow/root material,
  lighting, palette, fog, field seed, source topology telemetry, and review
  guides.
- Do not increase source counts as the solution. Keep the B4B1A1U source modes
  available as context, but judge only whether a new body representation fills
  close grass mass more honestly.
- Try one or two continuous, ground-seated non-card body representations, such as
  a field-space strand-stroke layer, a very low-profile interwoven fiber mat
  whose silhouettes break into strand direction at close crop scale, or another
  geometry/shader path that occupies area continuously without rectangular atlas
  sheets.
- Each candidate must publish representation telemetry separately from source
  telemetry: representation id, source topology, source cells/records, emitted
  primitives/triangles, texture bytes, close-crop edge/body stats, and any
  fixed-lab-only assumptions.
- If the candidate needs camera-relative generation, LOD, palette, or fog to look
  plausible, stop and reslice again. This slice should answer whether the body
  representation can work in the frozen lab.

## Fixed Inputs

- Do not change camera, crop windows, target images, meadow/root material,
  terrain, lighting, palette, atlas content, fog, water, cliffs, sky, or final
  reference-route constants.
- Do not use `texture-volume`, carrier sheets, or atlas-card meshes as the
  accepted path. They may appear only as rejected context.
- Do not tune final coverage, strand scale, clump rhythm, palette, LOD collapse,
  or camera-relative generation. If a representation starts to work but needs
  those variables, record that and hand them to B4B2-B4B5/B4D.

## Accept / Reject

Accept if one representation creates a continuous close grass body in the target
crop, has visible strand/body direction instead of smooth paint, avoids obvious
cards/curtains/hay mats, and no longer reads as isolated source markers or
regular posts.

Reject if candidates remain empty, become pixel grit, create visible grid/comb
artifacts, return to card sheets, require unbounded triangles before body
appears, or only look better by changing frozen variables.

## Verification

- Archive variant contact sheet, full lab shots, close/tight crops, stats JSON,
  comparison reports, and decision note under
  `assets/03b4-evidence/03b4c5-close-foreground-lab/continuous-strand-body-representation/`.
- Include B4B1A1T per-record and B4B1A1U subcell crops as rejected context.
- Use `compare-screenshots` against the target close crop and the B4B1A1U
  selected subcell crop. Judge only close body continuity, strand/body presence,
  and absence of marker/card artifacts.
- Run unprimed `screenshot-critique` scoped to: "Does any continuous body
  representation preserve close grass body without card artifacts, marker-post
  spacing, or isolated source clumps?"
- Open the variant sheet with `preview-shots` as a non-blocking checkpoint; if
  the user stays silent, record the decision and continue on the evidence.
- Keep focused lab route checks and `bun run --cwd web typecheck` green.

## Next Slice

If accepted, return to `03b4c5b4b1a2-close-body-perf-envelope.md` using the
accepted representation. If rejected, reslice the close body again before perf,
coverage, palette, LOD, camera-relative work, or final compose.

## Result - rejected on 2026-07-01

Evidence is archived under
`assets/03b4-evidence/03b4c5-close-foreground-lab/continuous-strand-body-representation/`.

This pass added two useful renderer/workbench candidates:

- `field-strand-mat`: `7200` field-subcell records, `900` source cells,
  `691200` submitted triangles, `0` texture bytes, and representation telemetry
  reported as `continuous-strand-mat`.
- `field-woven-mat`: `6720` field-subcell records, `840` source cells,
  `645120` submitted triangles, `0` texture bytes, and representation telemetry
  reported as `interwoven-strand-mat`.

Both are visually rejected. Against the target close crop, `field-strand-mat`
recorded `edgeEnergyRatio=0.58440`; `field-woven-mat` recorded
`edgeEnergyRatio=0.40593`. Against the rejected B4B1A1U subcell crop, they raise
edge energy (`2.93872x` and `2.04124x` respectively), proving the pass adds
structure. Direct inspection and neutral critique agree that it is the wrong
structure: empty center, source-localized perimeter clumps, oversized flat
fan/card patches, wrong scale, and repeated comb/grouping artifacts.

Learning: changing the mesh representation per source is still source-attached
geometry. The close crop needs a continuous field-owned body layer whose domain
covers the review surface before it is expressed as strands, fibers, or material
detail. B4B1A1W has since tested and rejected material-only field ownership as
flat paint. Do not proceed to B4B1A2 perf, B4B2 coverage, B4B5 palette, B4C
camera-relative generation, B4D LOD, or final compose from this result. Continue
with `03b4c5b4b1a1x-field-owned-body-silhouette-layer.md`.
