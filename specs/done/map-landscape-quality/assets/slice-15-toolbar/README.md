# Stable battle toolbar artwork

The toolbar refreshed its state at up to5Hz with a new innerHTML wrapper object
each time. The pinned React implementation assigns innerHTML when that prop
changes, replacing unchanged SVG subtrees. A regression test on the original
component proves the replacement. A static markup object per fixed command
keeps the same SVG nodes while button classes, disabled state and handlers stay
live. No icon paths, colors, layout or renderer parameters change.

The isolated and merged production battle vista/rock-face captures each repeat
with zero differing full-frame pixels on observed Apple/Metal. The capture
freezes at bootstrap, verifies tick60, waits for the0.2s HUD refresh and portrait
decode, and checks actual camera pitch/eye clearance. Without the markup fix,
the close frame still differed in approximately1,250 toolbar pixels on hardware
and software under the corrected setup. No image threshold was changed.

Focused regression and typecheck pass; independent scoped review found no
actionable defects. In the merged full suite,564 of565 tests passed. The
unchanged full-source terrain allocation test timed out at60 seconds; its
isolated rerun also timed out while the machine was busy. Its code and default
timeout are unchanged by this toolbar patch. This does not claim a green full
suite under that load. On 2026-09-21, the unchanged isolated allocation suite
passed all four checks in18.43s, followed by all565 frontend tests passing in
21.28s. Neither the60s timeout nor128MiB allocation ceiling changed.

Change ledger: the new `Toolbar.test.tsx` checks SVG node identity across a
state refresh and confirms the pause button updates its on state. The original
component fails the identity check; the corrected component passes. This is a
carried-in redundant DOM replacement, not a new icon design.
