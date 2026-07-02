# Slice 05 — Deterministic sleeping for settled idle units (BEHAVIOR track)

## Contract unlocked

Fully settled, far-from-threat units stop paying per-tick steering/cohesion
cost (investigation rec #4: `tick.steer_soldiers` ≈ 6.3 ms at 30k idle,
18.4 ms at 60k idle). This is a **designed mechanics change**, not a perf
tweak: sleeping units change tick-by-tick state even when seed-deterministic.

## Approach

Per tweak-mechanics (first principles, one mechanism): deterministic
sleep/wake rules — a unit sleeps when settled (cohesion recovered, no orders,
no threat inside a wake radius) and wakes deterministically (order, threat
entering radius, neighbor waking). No unit may visibly freeze: idle fidget and
formation micro-settling are part of the look — decide what sleep PRESERVES
and record it.

## Verification (behavior track — hash-identity does NOT apply)

- Deliberate re-pin with evidence: full balance/mechanics/scenario suites —
  any moved test gets a `change-report` ledger entry (test, previous, new,
  why).
- **write-vibe gates**: one idle-army vibe (units at ease — no visible
  freezing, fidget preserved) and one approach-to-contact vibe (sleeping army
  wakes correctly as an enemy closes; no late-wake mushiness at the front).
- Bench ledger row (idle should drop toward the steering share).
- Determinism: same seed → same battle, still — sleep/wake rules are
  deterministic functions of state.

## Human feedback that would change this slice

Wake-radius/fidget taste calls are David's; open the vibes via preview-shots
(non-blocking, ~5 min), decide on evidence, record.
