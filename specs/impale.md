# Spec: Impale — a planted point returns the closing victim's own momentum

## Goal, in one sentence

Make weapon strikes against a CLOSING body deliver a stopping push scaled
by the victim's own momentum — so that a braced pike hedge stops cavalry
the way Waterloo squares did, while sword walls keep only their toll, and
the per-weapon difference falls out of reach, not class gates.

## The contract this unlocks (it already exists, ignored)

`crates/sim/tests/class_scenarios.rs::a_braced_pike_front_keeps_its_feet_under_the_charge`
— `#[ignore]`d with this diagnosis in its note. 160 shock cavalry charge a
400-man phalanx frontally; today the cavalry centroid ends at y≈80 *past*
a wall whose front is at y=40. Un-ignoring that test green is the
acceptance criterion of this spec.

And the contract this must NOT break (locked, green, same file):
`eight_ranks_of_swords_toll_the_ride_but_cannot_hold_it` — dense SWORD
infantry exacts a melee toll (majority of riders planted for a few
seconds, mass below trample speed) but cannot hold the ride. Swords toll;
points stop. If the impale term turns sword walls into pike walls, it is
miscalibrated.

## Context you don't have (read this; it is the whole reason)

Weapon pushes are `hit_push × (m_attacker / m_victim).clamp(0.3, 3.5)`
(combat.rs `strike()`) — pure mass-ratio SHOVING. A braced pikeman
(m_eff ≈ 2.4) "shoves" a 4.5-mass horse ~0.17m per thrust. Measured
consequence: in the 8-rank ride-through, the cavalry unit's
`counter_press` peaks at **0.36**, under the ram-drag gate
(`press_brake_floor` 0.45) — the hedge never registers as a wall, so the
drag never bites, so the wall cannot stop what crosses it in under the
grip's ~2s onset (contact development + press EMA).

Mass-ratio shoving is correct physics for shoving. It is the wrong
physics for a *planted point receiving a charge*: there, the energy is
the HORSE's. A braced pike returns the closing mass's own momentum — the
horse impales itself. That stopping impulse is what the current model
cannot express at any tuning of `hit_push`, because the victim's closing
speed appears nowhere in the strike push.

Everything needed to express it already exists:
- `kin_vx/kin_vy` — per-soldier honest kinematic velocity (steering +
  carried momentum, recorded pre-solver). The victim's closing speed
  into the strike is `-(kin(victim)) · dir(bearing)` (bearing points
  attacker→victim; closing is motion against it).
- `recv_x/y/mag` — the received-push ledger. The stop push posts there
  like every other involuntary displacement, which is what feeds
  `counter_press`, which is what the ram drag reads. The chain from
  "pike thrust meets galloping horse" to "the unit's drive is braked at
  the hedge, before the bodies meet the wall" is already built past the
  first link.

## The design

In `strike()`, alongside the existing mass-ratio push:

```
closing = max(0, -(kin_v(victim) · dir(bearing_attacker→victim)))
if closing > tun.charge_min_speed:           // a charge-grade arrival only
    stop = closing × DT × share              // the victim's own momentum, his share of it
    where share = w_attacker / (w_attacker + m_victim_eff)
    displacement: victim pushed BACK along his own approach by `stop`
    ledger: post `stop` to recv_* (this is the link that brakes the unit)
```

- `w_attacker` = attacker mass × **brace** (× press chain if you want
  depth to matter — a backed pikeman returns more than a lone one; this
  is the same `w_i` the knockdown threshold uses).
- Gate on `charge_min_speed` so ordinary melee footwork (closings under
  ~2.5) pays nothing — the term is self-gating to charge-grade arrivals,
  the same boundary the collision impact branch uses.

### Where the sword/pike difference comes from — decide this first

The honest differentiator is REACH, for a physical reason: a pole-arm
braced against a charge is planted — the shaft transmits to the grip,
the rear hand, the ground; a sword meeting a horse chest absorbs and
deflects. Three candidate forms, in order of preference:

1. **Reach-scaled return**: `stop ×= (reach / pike_reach).clamp(…)` or a
   smooth function of reach. No new weapon data (the five numbers stay
   five), pikes (3.0+) return fully, swords (1.1) return a sliver —
   which the sword-toll contract will verify is small enough.
2. **Brace-only scaling** (no reach term): rejected unless measurement
   says otherwise — braced sword heavies would stop horses, breaking the
   locked toll contract.
3. **A sixth weapon number** (`planted:`): violates "a weapon is five
   numbers". Only if reach-scaling provably can't separate the regimes.

### Expect to need: contact-weighted drag (maybe)

The ram drag reads UNIT-MEAN counter_press; a hedge brakes only the
front. In the 8-rank measurements, front-loaded resistance diluted ~5×
by the unit mean. The impale posts may clear the gate anyway (closing
8-11 m/s × share is an order of magnitude above today's 0.17m shoves);
if not, weight the drag's counter_press by contact fraction — but try
the pure term first and measure.

## Contracts (the tests are the spec)

| Must become green | |
|---|---|
| Phalanx wall holds a frontal charge (cav never crosses) | `class_scenarios::a_braced_pike_front_keeps_its_feet_under_the_charge` — **remove the `#[ignore]`** |

| Must stay green (the calibration boundary) | |
|---|---|
| Sword walls toll but cannot hold | `class_scenarios::eight_ranks_of_swords_toll_the_ride_but_cannot_hold_it` |
| Thin-line bloodbath band (impact still lands at speed) | `class_scenarios::a_frontal_charge_through_a_thin_line_is_a_bloodbath` |
| Light horse half-butchery ratio | `class_scenarios::light_horse_tramples_at_half_the_butchery` |
| 20-rank bog; thin-line ride-through; move-order trample pair | `class_scenarios::move_order_*` |
| Pikes already unhorse by reach; rider reachability pure geometry | `class_scenarios::pikes_unhorse_*`, `combat_scenarios::rider_reachability_*` |
| Deep pike wall punishes infantry assault (the term must not double-tax slow pressers — it gates on charge-grade closing) | `combat_scenarios::deep_pike_wall_*` |
| Grind breaks no bones; mirror pacing bands | `class_scenarios::a_grinding_press_breaks_no_bones`, `pacing_scenarios::*` |

Likely follow-on once the wall holds: cavalry that cannot enter may stall
at the hedge taking pike cadence — check the horses die at a rate the
pacing philosophy accepts (they are paying the wall's toll; that is the
design — "deep pike blocks hold charges by push rate").

Golden hash will move; re-pin deliberately, once, in the same commit.

## Process requirements (hard-won; see `.claude/skills/write-tests/SKILL.md`)

- Cargo first; browser verify last; rebuild wasm before browser checks.
- Probes change the physics: instrument from the test side in throwaway
  `tests/dbgN.rs`; never `eprintln!` in lib hot code.
- Expect 2–4 chaos-marginal tests to wobble on ANY combat.rs edit;
  re-judge on the final shape only; anchor to design contracts, never
  re-pin to current behavior.
- Concurrent sessions are real: check `git status` when something
  impossible happens; never `git checkout` over files that may hold
  someone else's uncommitted work.
- Formulas read men, mass, measured motion (README hard rule) — the
  closing speed MUST come from `kin_*`, never position deltas, or the
  phantom-velocity disease returns through this new door.

## Acceptance

1. The Waterloo contract un-ignored and green; the toll contract green
   untouched; full workspace green; golden re-pinned once.
2. The stop term reads `kin_*` closing and posts to the ledger — no new
   state, no class gates, the five weapon numbers stay five (unless
   option 3 was proven necessary, with the measurement that proved it).
3. A short postmortem note here: measured counter_press at the phalanx
   hedge and at the sword wall, before/after, so the next person has the
   operating points. Then delete this file.
