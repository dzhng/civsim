# tick/04 — Deterministic sleeping for settled idle units (BEHAVIOR track)

**Closed without integration, 2026-09-09:** David accepts 35 ms and limits
further work to simple changes. This experiment is outside the retained
scope. The design below is historical, not queued implementation.


## Contract unlocked

Fully settled, far-from-threat units stop paying per-tick steering and
cohesion cost. After the 2026-09-08 prunes the idle tick at 15.5k is 6.6 ms
natively with the steer sub-passes spread across many small owners and the
body-pair solver at ~19%; sleeping is the lever that removes that whole
class of cost for the quiet part of the field. This is a **designed
mechanics change**, not a perf tweak: sleeping units change tick-by-tick
state even when seed-deterministic, so hash identity does not apply.

## Approach

Per tweak-mechanics (first principles, one mechanism): deterministic
sleep and wake rules — a unit sleeps when settled (cohesion recovered, no
orders, no threat inside a wake radius) and wakes deterministically (an
order, a threat entering the radius, a neighbour waking). No unit may
visibly freeze: idle fidget and formation micro-settling are part of the
look — decide what sleep PRESERVES and record it. Sleeping units keep their
bodies in the separation grid (a wall of sleeping men is still a wall).

## Verification (behavior track)

- Deliberate re-pin with evidence: full mechanics, scenario and balance
  suites — every moved test gets a change-report ledger entry (test,
  previous, new, why).
- write-vibe gates: one idle-army vibe (units at ease, no visible freezing,
  fidget preserved) and one approach-to-contact vibe (a sleeping army wakes
  correctly as an enemy closes; no late-wake mushiness at the front).
- Ledger row: idle should drop toward the separation share.
- Determinism holds: same seed → same battle; sleep and wake are
  deterministic functions of state, and `profile_tick duels` re-pins to a
  new combined hash recorded in the ledger.

## Human feedback that would change this slice

Wake radius and fidget taste are David's; open the vibes with
preview-shots (non-blocking, about five minutes), decide on evidence,
record in `choices.md`.
