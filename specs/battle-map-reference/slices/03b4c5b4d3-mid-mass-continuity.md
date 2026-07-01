# Slice 03B4C5B4D3 - mid-mass continuity

## Contract

Make the midground read as continuous vegetated meadow mass with no readable
individual grass primitives. This slice owns **mid-mass continuity only**.

Out of scope: close foreground body, near-to-transition strand fade, atlas
colour/content, fog, terrain relief, water, cliffs, sky, camera, and full-frame
parity.

## Approach

- Freeze B4D2 near/transition behavior.
- Tune only mid/far band coverage budget, representation choice, fade, and meadow
  mass handoff inside the accepted camera-relative architecture.
- Use the B4A mid-mass crop only after it is cleaned of cliff/fog/water/sky
  contamination. If no clean full-reference mid-mass target exists, use the close
  lab's mid-mass fixture crop and record that limitation.

## Accept / Reject

Accept if the mid-mass crop reads as soft meadow vegetation, not exposed flat
ground, stipple, pixel grit, rows, stamps, card walls, or individual strands.

Reject if the slice reopens close body, atlas colour, fog, terrain material,
camera, cliffs, water, or sky.

## Verification

- Archive mid-mass primary crop, close/transition regression crops, stats JSON,
  and crop comparability notes.
- Use `compare-screenshots` on the mid-mass crop only after B4A's clean crop is
  accepted.
- Run unprimed `screenshot-critique` scoped to midground continuity, lack of
  readable primitives, exposed ground, and stipple/row artifacts.

## Next Slice

Continue with `03b4c5b4d4-depth-falloff-sequence.md`.
