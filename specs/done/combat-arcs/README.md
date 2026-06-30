# Combat arcs — the strike field a weapon owns, read by target / face / strike

A weapon declares **where it can land a blow** as data — one or two angular
lobes over a reach band — and target selection, per-soldier facing, and the
strike resolve all read that same shape. This killed the old split where four
systems each answered "where's the enemy?" arc-blind and only the strike knew
about arcs, so a mounted sabreur turned to *face* the foe it was hunting and
parked it in the horse's-head blind front where the blade couldn't reach.

Shipped in `crates/sim` (`strike.rs` is new; `combat.rs`, `sim.rs`, `class.rs`
changed). The roster's `arc` field, the `mounted_swing = arc > 0.5` heuristic,
and the global `SABRE_BLIND_*` / `MOUNTED_SWING_*` constants are gone — the
geometry now lives on each `Weapon`.

## What it is

- **A weapon owns its strike zones as data.** `strike::Zones` is one or two
  `Lobe { center, half }` declared inline on every `Weapon` (`class.rs`):
  `strike::front(half)` for a sword / spear / pike / lance (one front lobe),
  `strike::flanks(center, half)` for a mounted sabre (two lobes at `±center`,
  blind over the horse's head and croup). `Zones` is `Copy` and
  const-constructible so it sits in the static class table.
- **`StrikeField` is the per-use build.** `strike::field(zones, min_r, max_r,
  front_narrow, tolerance)` wraps the zones in a reach band and applies two
  effects that touch **only a front lobe**: a crowd `front_narrow` (a choked
  sweep shrinks its cone) and an aim `tolerance`. A flank sabre's lobes are a
  hard geometric fact — no slack, no crowd-narrow. `StrikeField::contains(off,
  dist)` is the one membership test the strike resolve runs;
  `StrikeField::turn_to_edge(off)` is the wheel cost targeting reads.
- **Target = fastest blade-on-bearing, but only a horse pays the wheel.**
  `combat.rs` target selection scores `cost` per foe and picks the argmin (with
  sticky-target hysteresis on the *chosen* foe, not the single nearest body, to
  stop facing jitter). Mounted: `cost = d_surf + turn_to_edge(off)/turn_rate *
  approach_speed` — a foe already in a flank lobe is cheap, one dead-ahead in
  the blind front is dear. Foot: `cost = d_surf` exactly — its turn term is
  gated off, so a man on foot still targets the nearest body byte-for-byte. The
  targeting field is the **grind** weapon (the widest-`swing_arc` non-charge
  blade), so a charging lance unit disperses its riders across the front (the
  wide knockdown swath) instead of bunching on one foe; the lance strikes off
  its own front lobe independently.
- **Facing brings the wielded blade to bear, on a discrete bog switch.**
  `sim.rs` `desired_face`: a mounted soldier whose `mass_advance` has dropped to
  `charge_spent_speed` (bogged into a grind) calls
  `strike::face_foe_into_flank` — it turns broadside so the standing foe sits in
  the sabre's flank lobe. A *riding* mount (still above that speed) keeps the
  forward foe-facing drive. Foot is unchanged (a front lobe bears where the man
  already faces).
- **A trampler pulled out of a dive re-forms before it rides off.** A relocate
  order on a blobbed diving trampler `reseat`s it onto a clean grid and runs a
  `reform_timer`; while `gathering` (timer live, cohesion below `REFORM_COH`,
  not under an `Attack` order) it holds a walk pace with its weave kept **on**,
  so the lattice tightens it back into a column — then, formed, it softens and
  rides off. You can't re-form at a gallop; the gather *is* the re-form. A dive
  (`Attack`) never gathers — the blob is the point.
- **Survivability is a bounded, designed ladder** (an independent balance track,
  not part of the arc spine). Class HP is rescaled into `[1.0, 2.0]` and the
  shield cap belongs to the heavy sword (block 0.5); `HeavyPhalanx` sits just
  under it at 0.45 (lowered from the old `Phalanx`'s 0.55 so the heavy sword
  holds the highest block). The ladder: a frail levy → a heavy is ~4× (a peasant barely scratches a
  heavy — wanted); a light/medium → a heavy is ≤ ~2× (the fighting classes stay
  close); an equal 1v1 grind resolves in ~3–4 min.

## Why it works this way

- **The win was never "one model for everything."** Mounted vs line is a real
  doctrinal split (mass, training, being on a horse), so trample special-cases
  are legitimate. The goal was a shared, arc-aware *spine* under two honest
  doctrines — not the deletion of every trample distinction. (The plan's hope of
  *collapsing* the scattered carve-outs went further than what shipped — see
  Dead ends.)
- **The engage cost is metres, not seconds, and foot pays nothing.** The plan
  wrote `turn_time + travel_time` in seconds with an accel ramp. What shipped
  converts the wheel into the distance it would cover (`turn / turn_rate *
  approach_speed`) and adds it to the raw surface gap — same argmin, no
  accel-ramp dependency (that rode with the deferred slice 05). Foot's turn term
  is **literally zero**, not "a front cone that approximates to distance": a man
  on foot pivots freely, so making him pay any wheel cost would only add
  float-tie churn to a choice that should stay nearest-body. That zero is what
  keeps foot targeting byte-for-byte identical (the golden hash holds).
- **Front lobes flex; flank lobes don't.** Only a forward blade gets aim slack
  and chokes in a press — a man aiming where he faces has slack to either side
  and crowds his neighbours. A sabre's blind front and croup are fixed by the
  horse, so `field()` passes flank lobes through untouched. This is why
  `front_narrow` / `tolerance` are applied per-lobe inside `field()`, not to the
  whole field.
- **The lance gates on its OWN lobe, not the seek target.** Because targeting
  deliberately *disperses* riders for the charge swath, a couched lance's seek
  bearing points wherever the unit scattered it. If the lance gated its swing on
  that target it would whiff every time the unit hunted a flank foe — so the
  charge strike re-derives its own front-lobe field and fires on the closest foe
  dead-ahead, regardless of where the seek points.
- **Facing is a discrete bog/ride switch, because broadside-during-the-charge
  measured as a pure loss.** The plan wanted a continuous speed blend (velocity
  vs frontage). What shipped is one threshold on `mass_advance`: turning a
  *riding* charge broadside trades the forward bore — the thing that shatters the
  line — for nothing (the ride-past sabre kill never materialised; kills still
  happen bogged, now with the blade correctly bearing). So the arc-facing is the
  *standing* cavalry's, and a clean discrete branch beat a blend nobody could
  show paying off.
- **Survivability was reframed mid-build.** The original contract was a flat
  "best unit ≤ 2× worst." Once the measuring rig existed it became a *designed
  ladder*: a 0.5 shield on a 2× HP body *should* make a heavy ~4× a levy — that
  gap is wanted; the thing to bound is the spread *between the fighting classes*
  and the absolute grind pace. The lever for pace is attack, not shrinking the
  shield.

## Invariants (must stay true)

- **Foot targeting is nearest-body, byte-for-byte.** Foot's engage cost is
  `d_surf` with no turn term. If a wheel cost ever leaks onto foot, the golden
  hash moves and foot melee/symmetry pins drift. (`combat.rs` target selection;
  `golden_state_hash_stable` == `0xbc677968a4cf6b04`.)
- **`front_narrow` and `tolerance` touch only front lobes.** A flank sabre's
  lobes are fixed geometry. (`strike::field`.)
- **A couched lance strikes off its own front lobe**, not the dispersed seek
  target (`combat.rs`, the `weapon.is_charge()` aim gate). Pinned by
  `phalanx_points_stop_horses_only_to_the_front` and the trample sabre tests.
- **Pikes bite only to the front** (`scenario_combat::pikes_bite_only_to_the_front`
  / `mechanics_charge`).
- **Deep/braced infantry bog a charge; thin/unbraced is ridden through** — the
  brace/bleed law is untouched by the arc work
  (`mechanics_charge`, `mechanics_trample`).
- **Symmetric clash has no mechanical bias** (`mechanics_symmetry`).
- **A move order pulls a diving trampler back out and re-forms it before it
  sprints** (`mechanics_trample::a_move_order_pulls_a_diving_trampler_back_out`).
- **move == attack for LINE units; for tramplers move ≠ attack by design.**
- **Survivability stays a bounded ladder** (heavy ≤ ~2× the fighting classes,
  ~4× a levy, ~3–4 min grind). Every assertion is on **fake reference units**,
  never real classes, so the roster can be retuned freely
  (`mechanics_survivability`).

## Pointers into the code

- **The weapon model:** `crates/sim/src/strike.rs` — `Zones`, `Lobe`,
  `front` / `flanks`, `StrikeField`, `field`, `contains`, `turn_to_edge`,
  `swing_arc`, `is_flank`, `primary_half`, `face_foe_into_flank`. Declared on
  `Weapon.zones` (`class.rs`).
- **Targeting (engage cost):** `combat.rs` target-selection block — the grind-
  weapon pick, `tgt_field`, the mounted-only `turn_to_edge` cost, sticky
  hysteresis.
- **Strike resolve:** `combat.rs` — the lance own-lobe gate, the front-lobe aim
  gate, the obstruction `front_narrow`, the `field.contains` resolve (cleave =
  all in field, else closest).
- **Facing:** `sim.rs` `desired_face` — the `mass_advance <= charge_spent_speed`
  branch calling `face_foe_into_flank`.
- **Trample gather / pull-out:** `sim.rs` `reseat`, `reform_timer`, the
  `gathering` gate in the seek/weave block; `REFORM_COH`.
- **Survivability:** `class.rs` HP / block table; `tests/mechanics_survivability.rs`
  rig; fake reference units + weapons in `tests/common/mod.rs` (`ref_melee`,
  `ref_pike`, `ref_archer`, `ref_horse_archer`, `ref_shock_cav`, `REF_SWORD`,
  `REF_PIKE`, `REF_BOW`, `REF_HORSE_BOW`).
- **Per-unit missile override** (so fake archers are balance-independent):
  `Sim::set_missile_spec`, `Unit::missile_override`, read in `missiles.rs`.
- **Tests that pin it:** `mechanics_targeting` (foot nearest / sabre flank),
  `mechanics_trample` (dive / ride-through / pull-out / bog), `mechanics_charge`,
  `mechanics_survivability`, `mechanics_symmetry`, `golden`. Scenario tests run
  on fake reference units, files named `scenario_*.rs`.
- **Iteration harness (precursor):** `scripts/test-mechanics` /
  `test-scenarios` / `test-balance` / `test-infra` run focused buckets; the full
  run is `scripts/danger-run-all-tests-super-slow`.

## Dead ends and divergences from the plan

- **The trample carve-out deletion (slice 03's headline) did not happen.** The
  plan was to collapse `TRAMPLE_SLOT_GRIP`, the backward-removal hack, the
  `trample_dive && !running` gate, and `effective_cohesion` into one "trample
  never stops" rule, betting the unified drive-through would make the behaviour
  *emerge*. It didn't — those flags are all still live (`TRAMPLE_SLOT_GRIP`,
  `trampling` / `trample_dive`, `effective_cohesion`, `trample_bleed`). What
  shipped in their place is the **gather / re-form pull-out** above: an *added*
  mechanism, not a deletion. The trample doctrine stayed a set of honest flags;
  the net carve-out count did not go down. Anyone reaching for "just delete the
  trample special-cases and let it emerge" should know it was tried as the plan
  and abandoned.
- **The continuous facing speed-blend (slice 04's plan) was replaced by a
  discrete switch.** Velocity-weighting a fast mover so ride-past presents the
  flank measured as a pure loss; the kill mode is the bogged grind, so facing
  flips broadside only once bogged. No blend.
- **Engage cost is metres, not the planned seconds-with-accel-ramp.** See Why.
- **Slice 05 (turn-radius kinematics) was deferred — not implemented.** No
  failing test needs it. The *accel* half (`accel_mult`: foot 1.0, ShockCavalry
  2.0, HorseArchers 2.2) had already landed before this spec, via
  `class.rs` / `movement.rs` / `unit.rs`. The frame wheel already has
  speed-dependence (`spare = sqrt(top² − v²)` in `movement.rs`). The unbuilt
  turn-radius half would have made the engage cost a measured force and handed
  overshoot-and-loop-back for free; its `mass_advance` rotation-invariance would
  fix the walk-in speed proxy (the pre-contact peak spikes on a wheel). For now
  the walk-in test asserts on **impact** (zero impact = slow), not the noisy
  `mass_advance` peak. Pick this up only if doing the turn-radius half — and
  watch `mass_advance`: an earlier free-wheel experiment surged soldiers to new
  slots and spiked it into false charge detection, which is why it was reverted.
- **The earlier turn-throttle hack** (a flat wheel freed in `mass_advance`)
  polluted charge detection and was reverted before this spec — do not re-add it;
  the honest fix is measuring `mass_advance` from the rotation-invariant
  formation center.
