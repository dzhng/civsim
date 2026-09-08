# Combined native changes: visual identity

The contact metadata and scratch reuse changes (`d6846bb0`, including
`2318f2e7`) were rebuilt to wasm and captured through the same production
battle route as the [original reference](visual-baseline.md). No renderer,
fixture, camera, clock or tolerance was changed.

Run: `VERIFY_GPU=1 VERIFY_URL=http://localhost:5181 NAME=heavy-both ATK=0 DEF=0 POSTURE=both node web/vibe/duel-posture.mjs`.

The battle again resolved in 18 frames at 340 simulation seconds. The whole
generated GIF was byte-identical to [the original](heavy-both-original.gif).
Every decoded GIF frame matched, and all 16 full-resolution actual PNGs
saved for the existing reference failures were byte- and pixel-identical to
the pre-change captures. [The comparison record](visual-comparison.json)
contains every frame result and every existing-reference pixel count.

All 18 frames were inspected in chronological order. Approach, contact,
the curved front, thinning ranks, withdrawal and reformation match the
original observations. This establishes visual preservation for this fixture;
it makes no claim that the original rendering or mechanics were improved.

The process exits 16 because the same 16 July-reference comparisons fail.
All 18 pixel counts match the original run, including the two passing frames.
No screenshot timed out. No baseline was re-blessed; the generated tracked
GIF was restored after preserving the comparison evidence. Since the new GIF
is identical, the existing original asset also represents this capture.

The release wasm build and combined `force-trace` feature check passed.
These correctness captures ran alongside the workspace suite and supply no
performance measurements.
