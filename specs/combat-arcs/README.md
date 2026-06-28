# Combat Arcs — arc-guided seeking, facing, and striking

## Goal

Make a soldier's **whole behavior** — who it targets, where it moves, which way
it faces, what it strikes — flow from one question: *where can my currently-
wielded weapon actually land a blow?* Today four systems each answer "where's the
enemy?" **independently and arc-blind**, and only the last one knows about arcs:

| system | file:fn | today | the gap |
|---|---|---|---|
| target selection | `combat.rs` ~`314` | nearest body | ignores whether you can hit it |
| per-soldier facing | `sim.rs` ~`2286` (`desired_face`) | turn toward that body | a mounted sabre then faces its foe into its **blind front** |
| seek magnet | `sim.rs` ~`2044` | move toward that body | doesn't account for reach geometry |
| the strike | `combat.rs` ~`664` (`in_field`) | **arc-aware** (mounted = flank lobes, pike = front, foot = front cone) | the only one that knows |

The concrete bug this fixes (measured): a mounted sabre can only land in its
**flank lobes** (40°–137° off facing), but the facing logic turns the rider to
*face* the foe it's hunting → that foe sits dead-ahead in the blind front → the
rider **cannot cut the foe it's chasing**. It only catches incidental neighbours
(measured: 2 sabre kills riding past, 10 bogged-in-a-crowd, ~2 vs heavies).

## Architecture: one shared spine, two honest doctrines

The win is **not** "one model for everything." Mounted vs line is a real doctrinal
split (different mass, training, and the fact that one is on a horse), so trample
special-cases are legitimate. The win is replacing today's *scattered* trample
carve-outs (`effective_cohesion`, `TRAMPLE_SLOT_GRIP`, `trample_dive`, the
backward-removal hack, the reverted turn-throttle) with **one clean distinction**
on top of a shared, arc-aware spine.

```
                 ┌─────────────── SHARED SPINE ───────────────┐
   target  ◄──── │ kinematic "time-to-engage" (turn+accel+gap) │  ◄── feeds off
   facing  ◄──── │ strike-field model: weapon = {lobe, reach}+ │  ◄── the same
   seek    ◄──── │ (everything reads the wielded weapon's field)│      arc data
   strike  ◄──── └─────────────────────────────────────────────┘
                          │                        │
              LINE doctrine                  TRAMPLE doctrine
         seek → decelerate →             seek → drive THROUGH →
         hold at reach → fight           never stop → halt only on bog (bleed)
```

- **Target = "fastest to bring my blade to bear," not nearest.** Cost = turn time
  (facing → nearest *edge of my strike field*) + travel time (gap, with an
  accel/decel ramp). Arc-aware for free: a foe you'd have to wheel onto is
  expensive; a foe already in a sabre's flank lobe is ~free.
- **Strike-field model** collapses the `mounted_swing` / `braced` / foot branches
  into data: each weapon is a set of `(angle-lobe, min/max reach)`. *All four*
  systems read it.
- **Two seek doctrines.** Line: stop at reach, hold, fight. Trample: drive through,
  never deliberately stop, halt only when the bleed bogs it. The blob, the
  disruption, the carry-through, and "doesn't reform" all emerge from "never
  stops."
- **Facing follows field + motion.** A holding line faces its frontage; a driving
  trample faces its travel direction so foes it rides *past* fall in its flank
  lobe.
- **Kinematic foundation** (turn radius + accel) makes the cost a real force and
  hands us the overshoot-and-loop-back for free.

## Slice graph

```
00 survivability-compression ── INDEPENDENT of the arc chain; start here.
        (best unit ≤ ~2x worst; HP clamped to [1,2] — step 1 done)

01 kinematic-target ──┐
                      ├─ 01+02 = the SPINE (re-derive moved pins ONCE, with David)
02 strike-field ──────┘
        │
03 seek-doctrines ── line holds / trample drives-through; delete scattered carve-outs
        │
04 arc-facing ── face to bring the wielded field to bear ("cut who you pass")
        │
05 kinematics ── real turn-radius + accel; overshoot/loop emerges (accel_mult already landed)
```

Slice 00 is a *balance* compression and rides on its own track — it doesn't depend
on the arc spine and the arc spine doesn't depend on it. The user chose to start
with it.

**Precursor (not a slice — do before slice 01):** the test suite was too slow to
iterate on physics, so `scripts/test-mechanics` / `test-scenarios` / `test-balance`
/ `test-infra` now run focused buckets (the full run is
`scripts/danger-run-all-tests-super-slow`). Loop on `test-mechanics` (~tens of sec)
through this whole feature. Done.

**Staging rule:** land `01+02` together (the spine is a foundation change — expect
the scoreboard to invert; re-derive the moved pins once, with David). Then `03`.
Hold `04` until `02` exists. Hold `05` until `01–03` are green-or-re-derived — do
not stack foundation rebuilds.

## Already landed (from `dce2615`, merged in)

Per-class **`accel_mult`** (`class.rs`, `movement.rs:125`, `unit.rs`): foot 1.0,
ShockCavalry 2.0, HorseArchers 2.2 — scales `base_accel`. This is the *accel* half
of slice 05; slice 05 only adds the turn-radius half and wires the ramp into the
target cost.

## Sacred contracts (must survive, or be deliberately re-derived with David)

- **move == attack for LINE units** (the litmus). For **tramplers it is allowed to
  differ** — David sanctioned this; the trample doctrine is move≠attack by design.
- **Deep/braced infantry bog a charge; thin/unbraced is ridden through** (the
  brace/bleed law — `mechanics_charge.rs`, `mechanics_trample.rs`).
- **Pikes bite only to the front** (`combat_scenarios::pikes_bite_only_to_the_front`).
- **Symmetric clash has no mechanical bias** (`mechanics_symmetry`).
- **The moving-target lateral evade** (general, victim's crossing speed) — keep;
  it is orthogonal to arcs and is the one cleanly first-principled piece already in.
- **Golden hash** moves on any sim-value change — re-pin deliberately, once.

## Firewalls (out of scope)

- Campaign / rendering / wasm boundary — untouched.
- Balance *numbers* — this is a physics/architecture change; re-derive balance
  pins **after** the spine lands, with David, not preemptively.
- The trample's *combat* cohesion-tolerance (`effective_cohesion`) may survive as
  one honest doctrine flag — that's fine; the goal is to delete the *scattered*
  carve-outs, not every trample distinction.

## Known unknowns (the first slices should resolve)

- The exact **time-to-engage cost formula** (how to weight turn vs travel; how to
  measure "turn to the nearest field edge" cheaply, no path solve).
- **Orbiting risk**: seeking the strike *position* beside a foe can pinwheel
  (the doctrine's swirl red-flag). Needs damping or a different formulation.
- How many trample carve-outs actually **dissolve** under "drive-through + shared
  spine" vs must stay as honest doctrine flags.
- Whether facing-by-motion makes ride-past the kill mode (today kills happen
  *bogged*, 10 vs 2) — a measurable bet for slice 04.

## Current red pins (carried in, do NOT pre-fix)

`golden_state_hash`, `phalanx_points_stop_horses_only_to_the_front`,
`a_charge_outdamages_a_walk_in_on_impact` — from the in-flight trample/moving-evade
work. The spine rebuild will move these (and more) anyway; re-derive once, after.
