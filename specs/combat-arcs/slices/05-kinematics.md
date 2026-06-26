# Slice 05 — Real turn-radius + accel (make the metric a force)

## Contract
A unit can't pivot in place at speed and can't change speed instantly: heading
change is rate-limited by speed (a gallop arcs wide), and speed is accel-limited.
This makes slice 01's "time-to-engage" a measured force rather than a lookup, makes
slice 03's "trample keeps going" just "it physically can't stop or turn sharp at
speed," and — the prize — hands us the **overshoot-and-loop-back for free**: a horse
rides through, can't brake or spin, arcs wide, comes back around. No oscillation
rule; no turn-throttle hack (the one tried earlier polluted `mass_advance` and was
reverted).

## Already landed
The **accel** half: per-class `accel_mult` (`class.rs`, `movement.rs:125`,
`unit.rs`) — foot 1.0, ShockCavalry 2.0, HorseArchers 2.2, scaling `base_accel`.
This slice adds the **turn-radius** half and wires the ramp into the slice-01 cost.

## Seam
- `movement.rs` `update_unit_motion` (~`120`): today `turn_throttle` is a flat
  `lerp(min_turn_frac, 1, cohesion)`. Add a **speed-dependent turn-rate cap**: max
  heading change per tick falls as speed rises (radius = speed / max_yaw_rate).
  A standing unit pivots freely; a galloping one arcs.
- Feed the real accel ramp + turn radius into slice 01's `travel_time` /
  `turn_time` so the target cost reflects actual reachability.
- ⚠️ Watch `mass_advance`: the earlier failed turn experiment freed the wheel and a
  fast wheel surged soldiers to new slots, lurching the centroid → `mass_advance`
  spiked → false charge detection. If wheeling pollutes `mass_advance` again,
  measure it from the **formation center** (rotation-invariant), not the
  slot-chasing soldier centroid — that's the honest fix.

## Depends on
Land AFTER 01–03 are green-or-re-derived. This is a movement-model change touching
every unit — do not stack it on an unsettled spine.

## What the human can run
Immortal trample vs a thin line over 45s: assert the centroid **crosses the line
more than once** (the emergent back-and-forth) — the thing the turn-throttle hack
failed to produce. And a wide-vs-deep turn test: a fast unit's turn radius is
visibly wider than a slow one's.

## Verify
- Emergent oscillation: multiple line-crossings for an immortal trample vs thin.
- `mass_advance` stays honest under a hard wheel (no spurious charge/impact) — the
  walk-in `a_charge_outdamages_a_walk_in` peak-speed pin must hold.
- Cav charges still bog/carry per the brace law (turn radius shouldn't change the
  bog).

## Must stay green
The brace/bleed bog law; `mass_advance`-driven charge detection; symmetric non-bias.

## Feedback that changes this slice
Max yaw rate vs speed is the core knob (how wide is a gallop's arc?). Too wide and
cav can't engage; too tight and there's no overshoot. Tune against the vibe shots,
not a single test.
