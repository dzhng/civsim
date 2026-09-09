# Combined native changes: visual identity

The contact metadata and scratch reuse changes (`d6846bb0`, including
`2318f2e7`) were rebuilt to wasm and captured through the same production
battle route as the [original reference](visual-baseline.md). No renderer,
fixture, camera, clock or tolerance was changed.
The production entry imports the newly generated `game_wasm.js`; the served
wasm's SHA-256 matches the rebuilt file recorded in the comparison data.

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

The later single-body friend-recording change (`ec32c09c`) was rebuilt and
captured through the same route. Its whole GIF and all 16 saved actual PNGs
again match the original bytes; all 18 reference pixel counts match, with
the same exit 16 and no re-bless. The served-build file fingerprint is
`f053961a7aa63fd09334d8e82debbf5ac016655ff0adeec9d24025d24e4dd91d`.
The original timeline therefore also represents this later capture.

The final retained weapon-repel change (`e303d8f8`) was also rebuilt to wasm
and captured with the same command. Its whole GIF, all 16 actual PNGs and
all existing-reference difference counts match the preceding capture exactly.
It resolves in the same 18 frames with the same exit 16. No baseline was
changed. This verifies the serial wasm path of the retained native feature.
