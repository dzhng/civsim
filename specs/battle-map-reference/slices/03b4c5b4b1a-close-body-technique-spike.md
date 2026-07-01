# Slice 03B4C5B4B1A - close body technique spike parent

## Contract

This slice is now a parent memo, not a renderer implementation slice. The old
contract was still too broad: it asked one pass to build the close test
environment, compare body architectures, and record a perf envelope. That made it
too easy to keep tuning camera/crop/body/perf together.

Reslice the work into:

- `03b4c5b4b1a0-close-grass-test-environment.md` - build the fair fixed close
  grass lab and target/absence crop board.
- `03b4c5b4b1a1-close-body-architecture-matrix.md` - compare body primitive
  families inside that lab and choose the least-wrong representation.
- `03b4c5b4b1a2-close-body-perf-envelope.md` - record the selected
  representation's density/perf envelope before coverage tuning.

Together these children own **close body test surface, close body technique
choice, and local perf envelope only**.

Out of scope: final body tuning, strand direction, clump rhythm, atlas colour,
camera-relative generation, CPU-vs-GPU backend policy, LOD collapse, cliffs,
water, sky, fog, terrain silhouette, and full `battle-map-reference` compose.

## Approach

The ordering is intentional:

1. Build a close grass test environment before trying another body technique.
2. Select a body architecture in that environment without coverage tuning.
3. Record the selected architecture's performance envelope.
4. Only then continue to B4B2 coverage, B4B3 strand scale, B4B4 clump rhythm,
   and B4B5 close palette/atlas lock.

The current renderer is not procedurally generating grass from camera position
like false-earth. That comes later in B4C0/B4C1 after the close grass look is
worth carrying forward. Do not use camera-relative generation as a rescue for a
weak close body candidate.

## Accept / Reject

Accept this parent when its child slices exist and the README handoff points at
`03b4c5b4b1a0-close-grass-test-environment.md` as the next implementation step.

Reject any implementation pass that tries to finish all three child contracts at
once or compares against the final wide `battle-map-reference` shot before the
close lab, body architecture, coverage, strand scale, clump rhythm, and LOD
collapse slices have their own evidence.

## Verification

- README slice map/TODO names B4B1A as a parent and B4B1A0-B4B1A2 as the live
  implementation ladder.
- Each child slice carries its own `compare-screenshots`, unprimed
  `screenshot-critique`, and non-blocking `preview-shots` gate.
- If any child starts changing unrelated visual variables, stop and use
  `feature-slicing` to split it again before touching more renderer code.

## Next Slice

Continue with `03b4c5b4b1a0-close-grass-test-environment.md`.
