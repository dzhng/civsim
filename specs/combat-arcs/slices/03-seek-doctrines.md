# Slice 03 — Two seek doctrines (line holds / trample drives through)

## Contract
A LINE unit seeks the strike position, decelerates, holds at reach, and fights. A
TRAMPLE unit seeks the fastest-to-reach foe but **never deliberately stops** —
it drives through, re-picks the next fastest-to-reach (momentum biases forward),
and halts **only** when the bleed bogs it. The blob, the disruption, the carry-
through, and "doesn't reform" all emerge from "never stops" — replacing the
scattered carve-outs with this one distinction.

## Seam
- `sim.rs` seek/steer block (~`1985`–`2090`). Today's trample handling is spread
  across: `trampling`/`trample_dive` flags, `steer_to = ZERO`, `TRAMPLE_SLOT_GRIP`,
  the enemy-magnet `off = if trample_dive { dist }`, and the backward-removal
  projection. Collapse to:
  - **Line:** magnet fades to zero at reach (existing) → stop and hold.
  - **Trample:** magnet never zeroes at reach (drive through) + the seek's forward
    component is never braked; halt is purely the `trample_bleed` physics.
- **Delete on success:** `TRAMPLE_SLOT_GRIP`, the backward-removal block, the
  `trample_dive && !running` gate IF the kinematic target (slice 01) + drive-through
  make the charge-stays-tight behavior emerge instead of needing the `!running`
  special-case. Keep `effective_cohesion` only if measurement shows a blob still
  needs the combat-cohesion tolerance (one honest doctrine flag is fine).

## Depends on
Slice 01 (kinematic target gives "fastest to reach, re-pick forward") and slice 02
(strike field for the seek target). Without 01 the drive-through re-targeting is
nearest-body and may not bias forward.

## What the human can run
`mechanics_trample.rs` — the existing 5 tests (dive disrupts, move≠attack,
move-pulls-out, carry-thin/bog-deep) must still pass, now from the *unified* rule
rather than the carve-outs. Add a "net trample carve-out count went DOWN" check
(grep assertion in a comment, or just review the diff: lines removed > added).

## Verify
- All `mechanics_trample` pins green from the simpler code.
- `move_order_rides_through_a_thin_line` (line ride-through) still holds.
- Net deletion: the diff should REMOVE more trample-specific lines than it adds
  (the doctrine's "foundation absorbs special-cases" signal).

## Must stay green
The deep-braced-bogs / thin-carries-through law; the move-order ride-through.
move≠attack for tramplers stays (by design).

## Feedback that changes this slice
If "never stops" makes the trample too slippery (rides through and never commits
to a disrupting grind), the bleed tuning (`trample_bleed`, brace ramp) is the
honest lever — NOT a re-added stop rule.
