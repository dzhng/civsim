# Slice 03B4C5D - midground continuity and depth falloff

## Contract

Make the accepted camera-relative grass remain continuous into the midground
without turning into stipple, rows, or a billboard wall. This slice owns
**midground depth falloff and LOD composition** after close foreground body,
camera-relative generation, near/mid/far mass collapse, reference grass-compose,
and atlas content are credible.

Freeze:

- accepted close foreground lab scale, body technique, body coverage, strand
  scale, clump softness, and close palette/atlas lock from 03B4C5B4B1R, B4B1A,
  and B4B2-B4B5;
- accepted backend policy, camera-relative generation, and terrain response from
  03B4C5B4C0-B4C3;
- accepted LOD bands and depth falloff from 03B4C5B4D1-B4D4;
- accepted grass-only reference crop compose from 03B4C5B4E;
- accepted atlas content;
- meadow/root material, camera, terrain, fog, water, sky, and crop windows.

## Current Motivation

03B4C5A raised foreground edge energy but barely moved the midground:
`edgeEnergyRatio=0.48966` against the target and only `1.02795x` versus
field-fiber-shell. The midground still reads as smooth ground with occasional
marks, not soft vegetated mass.

## Approach

- Adjust only midground depth selection, LOD transition, per-depth coverage, and
  fade behaviour inside the accepted camera-relative architecture.
- Keep near-foreground acceptance intact; do not retune atlas, close body shape,
  camera-relative domain, or card scale to hide a midground failure.
- Compare foreground and midground separately so a near improvement does not mask
  midground emptiness.

## Accept / Reject

Accept if the midground crop gains continuous soft grass mass while the foreground
keeps accepted scale and does not become noisy or overdrawn.

Reject if midground density appears only by changing fog, camera, meadow/root
material, terrain colour, or broad atlas palette.

## Verification

- Capture `battle-map-reference-primitive-family` and `battle-map-reference`.
- Use `compare-screenshots` with the midground crop as the primary metric and the
  foreground crop as a regression guard.
- Run unprimed `screenshot-critique` scoped to depth falloff, midground
  continuity, stipple, rows, and scan readability.

## Next Slice

After foreground and midground texture-volume are accepted, continue with
`03b5-readability-and-perf-gate.md` before making the architecture default.
