# Slice 03B4C5B4D2 - near-to-transition collapse

## Contract

Make visible close foreground strand/body detail collapse into clumped soft body
through the transition band. This slice owns **near-to-transition detail falloff
only**.

Out of scope: mid/far meadow mass, colour, atlas content, terrain material, fog,
camera, water, cliffs, sky, body representation redesign, and GPU compute.

## Approach

- Freeze the B4D1 bands and B4B/B4C accepted grass.
- Tune only near and transition band fade, per-band representation choice,
  per-band coverage budget, and cross-band blending.
- Keep close-hero crop acceptance as a regression guard; transition crop is the
  primary acceptance surface.

## Accept / Reject

Accept if the transition crop loses readable individual strands without becoming
flat paint, rows, screen-door grit, repeated stamps, or an abrupt hard band.

Reject if transition improvement comes from changing fog, colour, terrain,
camera, atlas art, or close body representation.

## Verification

- Archive close-hero regression crop, transition primary crop, transition tight
  crop, and stats JSON.
- Use `compare-screenshots` against the target transition crop and B4D1
  regression crops. Judge edge/structure falloff, mask coverage, and primitive
  readability only; do not use colour/luminance changes to pass this slice.
- Run unprimed `screenshot-critique` scoped to near-to-transition collapse,
  primitive artifacts, rows, and hard density seams.

## Next Slice

Continue with `03b4c5b4d3-mid-mass-continuity.md`.
