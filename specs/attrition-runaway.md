# Spec: the symmetric grind runs away (positive-feedback attrition)

## The finding (measured 2026-06-18, `tests/dbg_symmetry.rs`, throwaway)

Two IDENTICAL HeavySword units (240 each), clashing head-on, do NOT grind evenly.
On ~40% of seeds one side snowballs into a massacre. Loss-evenness ratio
(`min/max`) over 10 seeds, final count:

```
seed 4242 0.62   seed 1 0.53   seed 2 0.52   seed 3 0.65   seed 101 0.57   seed 500 0.59
seed    7 0.34   seed 11 0.32  seed 99 0.28  seed 100 0.31   <-- LOPSIDED
```

`symmetric_clash_is_even_handed` (asserts ratio > 0.5) PASSES only because it
hard-codes seed 4242. It is a seed-fragile sentinel: any combat/collision change
that perturbs the dynamics can tip 4242 over the edge — this is exactly how a
symmetric enemy-collision pad "broke" it (the pad introduced no bias; it nudged
4242 across a pre-existing instability).

## It is a GRIND runaway, not a rout/chase effect

Timeline, worst seed (99), losses bot/top every 10 s:

```
t20 3/3    t30 5/20   t40 12/39   t50 16/63   t60 19/72 ... t120 45/156
rout[--] the ENTIRE time — neither unit ever routs
```

- **Even at first contact (t20, 3/3).** The asymmetry is not in the setup.
- **Monotone runaway after.** A tiny RNG edge (evade/block rolls ~t20-30)
  amplifies: the diff grows +15, +27, +47, +53, ... with no saturation.
- **No rout, no chase.** This refutes "the loser routs and gets chased down" as
  the cause — the divergence is pure grind attrition while both stand and fight.

So the model "deaths stay ~even until one routs" is FALSE here: deaths diverge
during the grind, before any morale break.

## Amplifier CONFIRMED geometric + a morale failure (width probe, seed 99)

Tracking each side's living-men x-width over the same run:

```
t20 bot 20.8 top 25.3 (even losses)   t50 bot 17.0 top 14.7   t120 bot 15.7 top 9.3
```

The LOSER (top) collapses in width 25 → 9.3 m as it loses men, while the winner
holds ~16 m. A shrinking line is wrapped on its exposed flanks and ganged > 1:1 —
the geometric positive feedback. So the amplifier is FRONT INTEGRITY: the losing
line clumps instead of re-forming its frontage, and the wider winner envelops it.

**Second, separate failure: morale never routs the loser.** `rout[--]` the entire
120 s even at 45-vs-156 (3.4:1). A unit losing that badly must break (David's model:
"a unit routs as it senses it's losing; most deaths come from being chased down").
Here it stands and is massacred in place. So the lopsided count is doubly wrong:
the loser shouldn't get ganged that hard AND should have routed before it did. (This
likely also drives the failing morale_scenarios — task #58.)

## Likely amplifier (was hypothesis — now confirmed geometric above)

A clean line is 1:1 — each man faces one opponent. Local outnumbering (2 men
striking 1) can only arise if the contact line CLUMPS. The suspicion: the melee
front does not hold a clean 1:1 line; it blobs, and a blob concentrates strikes —
the side a hair ahead puts two men on one foe, kills faster, gains more local
edge, runs away. If true this is the SAME root as the standoff front-zipper
(`standoff-double-push.md`): the contact front doesn't maintain integrity.
**One root — front-line integrity — would explain the standoff pass-through, the
symmetric-clash runaway, mirror_duels_heavy, and the phalanx swirl.**

Next probe to settle it: measure, on a bad seed, whether the loser's front
CLUMPS / the winner concentrates >1 attacker per victim (count strikes-per-victim
per tick by side), vs the deaths being spread 1:1. If clumping → fix front
integrity. If 1:1 → the amplifier is in the kill math (evade/block/pressure
coupling), not geometry.

## Candidate dampers (design, for whoever takes this)

- **Fatigue per swing (David's idea #2).** The winning side swings more (more live
  men in contact) → tires → slows → the loser recovers. A NEGATIVE feedback that
  could cancel the runaway. Pair with: fatigue saps swing speed (already wired,
  combat.rs:365-367) + evade/block + run/charge speed.
- **Equal commitment (idea #1 / the hold-front lean).** If the pressed side always
  meets with as many engaged men as the presser, no local outnumbering forms.
- **Cap gang-up.** Limit strikes-per-victim-per-tick so a local 2:1 can't deal 2x
  — bluntest, most direct if the amplifier is confirmed geometric.

Decide the damper from the amplifier probe, not taste. Do NOT repin
`symmetric_clash` to a passing seed to hide this — it is a real bias the test is
right to flag; fix the mechanic.
