# Slice 01 — Kinematic "time-to-engage" target

## Contract
A soldier targets the foe it can **bring its weapon to bear on soonest**, not the
nearest body. Arc-awareness and momentum-awareness fall out for free: a foe behind
you (needs a wheel) or outside your strike field costs more than a closer-but-
already-in-arc foe.

## Seam
- `combat.rs`, target selection (~`314`–`332`, the `nearest`/`prev_target`
  hysteresis block). Replace the distance comparison with a **cost**:

  ```
  engage_cost(i, foe) = turn_time + travel_time
    turn_time   = angle_from(facings[i], nearest EDGE of my wielded weapon's
                  strike field, toward foe) / effective_turn_rate(i)
    travel_time = max(0, gap - reach) / approach_speed(i)   // accel ramp in slice 05
  ```
- Inputs: `facings[i]`, the wielded weapon's strike field (slice 02 — until then,
  approximate: foot front cone, mounted flank lobe), foe bearing+gap, unit turn
  rate. Output: pick `argmin cost`, with hysteresis on cost (not distance) to stop
  thrash.
- Ownership: target selection only. Facing/seek/strike unchanged this slice.

## Depends on
Reads the strike-field edge (slice 02). Can ship a stopgap with a hardcoded
per-weapon `strike_bearing` (0 for front, ±90° for sabre) before 02, then
generalize.

## What the human can run
A probe test: place one cav between a foe dead-ahead and a foe at 90°; assert it
targets the 90° one (it can hit it now). Print the cost of each.

## Verify
- `mechanics_trample.rs`: dive still disrupts; cav now *targets* foes it can hit
  (add an assertion that the chosen target lands in the strike field more often).
- A new `mechanics_*` test: "targets fastest-to-engage, not nearest" with a
  hand-placed pair.
- No regression in foot behavior (foot's strike-bearing is 0 → cost ≈ distance →
  ~unchanged target choice; confirm `mechanics_melee` symmetric pins hold).

## Must stay green
Foot melee/symmetry invariants (foot target choice should barely move). move==attack
for line units.

## Feedback that changes this slice
The turn-vs-travel weighting and the hysteresis width are the tuning knobs; if cav
target-thrashes in a melee, widen hysteresis or add a small "stick to current foe"
bonus.
