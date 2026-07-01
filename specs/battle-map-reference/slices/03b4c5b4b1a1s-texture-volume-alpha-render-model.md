# Slice 03B4C5B4B1A1S - texture-volume alpha render model

## Contract

Find out whether the least-wrong `texture-volume` family can escape the
B4B1A1/B4B1A1R trap by changing only the **render/alpha model** for the existing
texture-backed body. The current primitive path is rejected because low-coverage
texture cards still paint opaque card/mat color in the world-depth pass; shallow
shape repairs either keep curtain islands or become giant starburst sheets.

This slice owns alpha/cutout/depth semantics for `texture-volume` only. It does
not own density, perf budget, broad coverage, camera-relative generation, atlas
colour/content, strand scale, clump rhythm, LOD collapse, cliffs, water, sky,
fog, terrain silhouette, or final reference compose.

## Approach

- Start from the fixed B4B1A0 lab and B4B1A1/B4B1A1R evidence.
- Freeze the current `texture-volume` field records, camera, crop windows,
  meadow/root material, terrain, lighting, palette, target crop, and rejected
  current crop.
- Compare render-model variants, not size/density variants:
  - current opaque card color path;
  - stricter alpha cutout that discards low-coverage texels instead of painting
    card-base color;
  - deterministic screen/world dither cutout for soft root/body coverage without
    translucent blending;
  - optional two-phase split if needed: depth-writing cutout body first, then a
    read-depth non-writing soft fringe, while preserving renderer depth-contract
    rules.
- Keep primitive records and mesh shape fixed except for the minimum data needed
  to select the render model. If a promising result requires changing footprint,
  copies, atlas hue, camera, or record count, stop and reslice again.

## Accept / Reject

Accept if one render-model variant keeps visible close grass body, removes the
opaque curtain / hay-mat / card-wall read, and does not collapse back to smooth
painted ground. It may still have imperfect density and strand scale; those are
later slices.

Reject if every render-model variant still shows card islands/sheets, if the only
improvement is making the grass disappear, if the pass violates the renderer
depth/blend contract, or if the fix needs unrelated visual variables.

## Result

Rejected on 2026-07-01. Evidence is archived under
`assets/03b4-evidence/03b4c5-close-foreground-lab/body-alpha-render-model/`.
The tested models were `opaque-card`, `alpha-cutout`, `hard-cutout`,
`dither-cutout`, and `sparse-dither`. `opaque-card` preserves the most body but
keeps obvious card islands; alpha/cutout/dither reduce opaque fill but leave hard
sheets, chunks, noisy stipple, or exposed empty lanes. The best target metric still
does not produce the reference's continuous close grass body, and the neutral
critique rejected every candidate.

## Verification

- Archive variant contact sheet, full lab shots, close/tight crops, stats JSON,
  and decision note under
  `assets/03b4-evidence/03b4c5-close-foreground-lab/body-alpha-render-model/`.
- Include the target close-hero crop, B4B1A1 current `texture-volume` crop, and
  B4B1A1R repair-profile crops as rejection context.
- Use `compare-screenshots` against the target close crop and the rejected
  B4B1A1/B4B1A1R crops. Judge only alpha/card artifact and preserved close body.
- Run unprimed `screenshot-critique` scoped to: "Does any texture-volume render
  model remove opaque card/curtain artifacts while preserving close grass body?"
- Open the variant sheet with `preview-shots` as a non-blocking checkpoint.
- Keep focused lab route checks and `tsc --noEmit` green.

## Next Slice

Continue with `03b4c5b4b1a1t-field-fiber-body-architecture.md`. Do not tune
texture-volume alpha, density, or atlas content again until a non-card body
representation has been tested.
