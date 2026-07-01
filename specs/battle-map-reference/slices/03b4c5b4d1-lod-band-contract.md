# Slice 03B4C5B4D1 - LOD band contract

## Contract

Define near, transition, mid, and far grass ownership bands before tuning visual
falloff. This slice owns **LOD band boundaries and telemetry only**.

This is the first slice that may formalize the target relationship David called
out: close foreground can show body/strand direction, while mid/background should
collapse into meadow mass with no readable individual grass strands.

Out of scope: changing body/strand/clump art, atlas content, colour, fog, terrain
material, camera composition, water, cliffs, sky, and full-frame parity.

## Approach

- Freeze B4B and B4C outputs.
- Define named band bounds and per-band representation ownership:
  near visible body/strands, transition clumped body, mid/far meadow mass.
- Publish per-band selected records, emitted records, representation type,
  triangles, instance bytes, and fade ranges.
- Capture band overlays before any beauty tuning.

## Accept / Reject

Accept if the band overlays and telemetry make it clear which records belong to
near, transition, mid, and far, and the crop windows can judge each band
separately.

Reject if the slice starts tuning grass appearance before ownership/bounds are
inspectable, or if it uses fog/camera changes to hide bad boundaries.

## Verification

- Capture close-hero, transition, and mid-mass crops with a band overlay/contact
  sheet plus stats JSON.
- Use `compare-screenshots` only to confirm captures are comparable to B4A/B4B
  crop windows. Judge band geometry, mask coverage, and edge/structure
  separation only; colour and luminance belong to B4B5/03B4C5C.
- Run unprimed `screenshot-critique` scoped to band legibility and whether the
  crops isolate near, transition, and mid/far ownership.

## Next Slice

Continue with `03b4c5b4d2-near-to-transition-collapse.md`.
