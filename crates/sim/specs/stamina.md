# Stamina — what it is, everything it drives, and the exact magnitudes

`Unit.stamina` is a single per-unit scalar, **1.0 = fresh, 0.0 = spent**. (It was
called `fatigue` until 2026-06; renamed because `1.0` meaning *not* fatigued was a
foot-gun. High = good.) It drains with exertion and recovers at rest, and it feeds
**seven** systems. Almost all of them read it through one curve:

```
stamina_factor(s) = clamp(s / 0.7, 0, 1) ^ 1.5      // movement::stamina_factor
```

A flat top with a convex falloff: a unit at ≥70% stamina performs at 100%, then
output drops away, steeply near empty.

| stamina s | 1.0 | 0.7 | 0.6 | 0.5 | 0.4 | 0.3 | 0.2 | 0.1 | 0.0 |
|-----------|-----|-----|-----|-----|-----|-----|-----|-----|-----|
| factor    |1.00 |1.00 |0.79 |0.60 |0.43 |0.28 |0.15 |0.05 |0.00 |

## The seven effects (exact magnitudes)

Let `f = stamina_factor(s)`. Unless noted, the effect reads `f` (the curve), not `s`.

1. **Movement top speed** — `movement.rs` (run / surge / charge).
   `speed = base_speed + (top - base_speed)·f·pace_mult`.
   - f=1: full `run/surge/charge_speed`.  f=0: **`base_speed` only** (a spent unit can
     only walk; it cannot run or charge above a march).
   - Walk (= `base_speed`) is stamina-independent.

2. **Charge ignition** — `sim.rs`. Two raw-`s` gates plus the speed scaling above:
   a charge will not ignite unless **`s > 0.3`** (and the recovery clock is ≥ half
   drained). Below 30% stamina there is no charge at all.

3. **Swing POWER (damage per hit)** — `combat.rs`. `dmg ×= stamina_damage_floor +
   (1 − floor)·f`, with `stamina_damage_floor = 0.75`. Swing CADENCE is **stamina-
   independent** — a tired man swings as often, but each blow lands softer.
   - f=1: ×1.00 (full power).  f=0.5: ×0.90.  f=0: **×0.75** (a spent man hits at 75%).
   - Why power, not cadence: coupling cadence to stamina made even fights never
     resolve (a spent line swung slow AND kept its guard up, so nothing landed). The
     offence lever is power-per-blow; the collapsing guard (4) does the rest.

4. **Guard (block + evade)** — `combat.rs`. `guard = stamina_guard_floor + (1 − floor)·f`,
   with `stamina_guard_floor = 0.15`. Multiplies BOTH the block chance and the evade
   chance.
   - f=1: ×1.00.  f=0.5: ×0.66.  f=0: **×0.15** (a spent man keeps only 15% of his
     guard). This is the PRIMARY thing that resolves a long grind: fresh lines block
     nearly everything, a drawn-out grind COLLAPSES both guards until blows land freely
     and one side breaks fast.

5. **Morale drain amplifier** — `morale.rs`. The ONLY reader that uses **raw `s`**
   (linear), inside the drain amplifier: `amp ×= (1 + 0.5·(1 − s))`.
   - s=1: ×1.00.  s=0.5: ×1.25.  s=0: **×1.50** (a spent unit's will breaks up to 1.5×
     faster). *Note:* this is a deliberate exception to the `stamina_factor` curve — a
     linear read. If unifying onto the curve, expect morale timing to shift.

6. **Missile scatter** — `missiles.rs`. `scatter += 12.0·(1 − f)` (metres at the
   landing point).
   - f=1: +0.  f=0: **+12 m** of extra dispersion (a blown archer line can't group).

7. **Drain & recovery** — `sim.rs` integrates `stamina` each tick. Per-second rates
   (`tunables.rs`), additive while their condition holds:
   - run `run_drain = 1/90` (~90 s run to empty), combat `combat_drain = 1/50`
     (~50 s of melee), charge `charge_drain = 1/25` (~25 s of charging),
     `terrain_drain` scaled by resistive ground.
   - rest `rest_recover = 1/240` (~240 s, 4 min, to refill from empty).

## Cleanup notes (for future sessions)

- **One state, one curve.** Six of seven effects route through `stamina_factor`; the
  morale amplifier (5) is the lone **raw/linear** reader. That's a "one quantity, two
  measurements" smell — left as-is because the linear morale read may be intentional;
  unify only with a deliberate re-derivation.
- The charge gate (2) also reads raw `s` for its threshold, which is fine (a threshold,
  not a performance scaling).
