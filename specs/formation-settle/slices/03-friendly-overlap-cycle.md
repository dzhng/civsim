# Slice 03 — Family B: the friendly-overlap limit cycle

## Contract unlocked

A unit whose destination frame overlaps a standing friendly reaches a REAL
equilibrium: bodies rest in contact, nobody vibrates. The permanent buzz
(0.06/0.11/0.21 m/s at 2/5/10m overlap, never decaying) dies. This is the
first-principles-backlog Tier-2 item ("Limit cycles damped, not killed")
fixed at its root instead of damped.

## The measured root

Each tick: the steer pass pulls men toward slots that sit under the
neighbour's bodies (SlotPull/WeaveNet), then `apply_separation` shoves the
overlap back out. The reversal-gated `idle_settle_damp` cannot kill it —
it damps the STEER velocity against last tick's steer, but this cycle
closes through the separation solver, which runs after `kin_v` is captured.
Re-verify this attribution with force-trace before designing (channel
budget on an overlap-5 case: expect SlotPull/WeaveNet vs
BodySeparation* alternating).

Prerequisite: re-run the gate AFTER slice 02 lands — if 02's fix (e.g.
bonds/slots respecting blockage) also treats friendly bodies, this slice
may shrink to verification + un-ignore.

## The design question

What zeroes the slot pull when the slot is under another body? Doctrine
candidates:

1. **The slot pull must saturate at body contact** — a man pressed against
   the body occupying his slot has ARRIVED for force purposes: the pull
   reads the obstruction (same physical fact the weave already models for
   enemies: stopped by real bodies) and goes to zero instead of grinding
   against the solver. Newton-honest: no shove into the neighbour, no
   recoil cycle.
2. **Frames should not rest overlapped at all** — the order layer
   (`update_yield` / corridor machinery) already coordinates same-team
   flow; an arrival whose frame overlaps a standing friendly could resolve
   the frame to clearance the way `clamp_to_passable` resolves terrain.
   This is an ORDER-level fix; it must not forbid marching THROUGH friends
   (opposing flows push through by design) — only where a halted frame
   RESTS.

Option 1 is the force-level fix and covers cases option 2 can't (the
neighbour arrives later); option 2 may still be right for order UX. The
ledger and the gates decide; don't ship both unless each is independently
convicted.

## Verification

- Un-ignore `settle_overlapping_friendly` → green; extend to the 2/5/10m
  sweep in one test body.
- `settle_adjacent_group_move` stays green byte-similar (2m clearance must
  not start yielding/relocating).
- Move==Attack litmus (tweak-mechanics): the fix must key off physical
  contact, never `OrderMode` — grep the diff for `OrderMode::` gates.
- Enemy-facing behavior untouched: run the melee/weave/pressure mechanics
  families and confirm no movement (`--no-fail-fast`, provenance for any
  red).
- Golden holds, or the leak is found.

## Stays green

All combat mechanics; the corridor/yield behavior for MOVING units;
slice-01 green gates; slice-02's gates.

## Human feedback that would change this slice

Whether overlapped resting frames should be legal at all (option 2 changes
player-visible order semantics — units nudging to clearance on arrival).
Non-blocking: recommend option 1 (force saturation, no visible semantics
change), note option 2 as follow-up UX, proceed on 1 unless David answers
within the window.
