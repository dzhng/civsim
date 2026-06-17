# Spec: the road from 119/36 to 100% — two keystone reworks + the failure map

## State (this branch, after the foundation-repair session)

`cargo test -p sim --no-fail-fast` → **119 passing / 36 failing**. The contact
foundation now HOLDS (the clash no longer passes through or swirls — the unlock the
whole suite sat on). What remains collapses onto **two keystone reworks** plus a
tail of real-but-isolated regressions. Every cluster below was tested to a verdict
this session — the "tried" notes are measured, do not re-discover them.

## Keystone 1 — frame-hold winning-advance: BUILT, but NOT the lever (disproved)

The fix that holds the clash is `target_speed = 0` when `locked` (movement.rs, the
march branch). It pins a winning attacker too. I built the relative winning signal
and tested it — and it does NOT fix the tests I thought, so do not chase it:

**Tried (reverted, both):**
1. `target_speed = mass_advance.max(0).min(pace)` — lets winners advance BUT
   reintroduces the clash pass-through (119→116): `mass_advance` is positive in a
   symmetric grind too.
2. The RIGHT relative signal — added `Unit::enemy_losing_push` (copy the foe's
   `losing_push` each tick; advance the frame only when `enemy_losing_push > 1.0 &&
   own losing_push < 0.5`). Result: **clash still holds (correctly reads the
   stalemate), but it fixed ZERO tests** (119/36 unchanged). Because:
   - `the_counter_web_holds` (Phalanx attacking HeavySword loses 29%/68%) is a
     COMBAT-DEPTH loss — the phalanx loses the kill-exchange once swords close
     inside the sarissas, not the shove. A combat/balance problem, not frame motion.
   - `a_wide_line_wraps`, `a_column_bulges` — the wide line's FLANKS (the part that
     should curl in to envelop) have no enemy ahead, so they are NOT `locked`; the
     frame-hold never gated them. They pour straight because the WRAP mechanic
     (flanks turning inward toward the foe's exposed sides) is missing, not because
     the frame is pinned.

So keystone 1 as "let winners advance" is a dead end for these tests. The real
roots are (a) pike-vs-sword combat depth (the sword closes inside the pike and wins
the exchange) and (b) a missing envelopment/wrap behavior (free flanks should seek
the foe's flanks, not march straight). Both are their own work.

**Envelopment is NOT a lock-threshold issue either (tried, reverted).** A wide line
vs a narrow block engages only its centre (~12-24 of 210), under both lock gates, so
its frame drives the overhanging flanks straight through. Adding an absolute
`engaged >= 10` lock floor REGRESSED 5 tests (over-locks units that merely brush an
enemy) AND did not fix `a_wide_line` (the flanks pour even when the frame is held —
the magnet does not curl them inward). The wrap needs an ACTIVE behavior: an
overhanging flank man, with no foe directly ahead but an enemy off his inner side,
must steer toward that exposed flank (turn the line's wings in), not just hold. New
force, not a gate tweak.

## Keystone 2 — impale momentum-return (`specs/impale.md`)

The trample bog: a cavalry plow plowing a THIN line bogs (ram-drag `v²` spikes on
contact, feedback-loops it stuck). Tests: `move_order_rides_through`,
`cavalry_charge_keeps_burst`, `dense_infantry`, `a_frontal_charge_bloodbath`,
`eight_ranks_toll`, `light_horse_tramples`, `cavalry_usually_rides`.

**Tried (regressed, reverted):**
- Skip ram-drag for tramplers → charge-stop COLLAPSES (`mechanics_charge` 5→2,
  `a_pike_hedge` fails). Ram-drag is the ONLY propulsion brake.
- Gate ram-drag on `mass_advance > charge_min` for tramplers → same collapse.
- Uncap `trample_bleed` → no effect (it drains ballistic momentum, not propulsion).

So ram-drag can't be removed or depth-gated without a REPLACEMENT charge-stop. That
replacement is impale: a planted point returns the charger's own measured momentum
(`kin_*`), braking it at reach. With impale carrying the pike/deep-block stop,
ram-drag can soften so a thin screen is ridden through — AND the softer ram-drag
helps the blob (below). Impale already exists (combat.rs ~259) but is reach-only and
doesn't yet brake a body-block charge; the rework is to make the strike push a
momentum-return (replacing the `hit_push` mass-ratio shove, C6) per impale.md.

## The tail — real regressions, NOT stale metrics (do not repin to pass)

Verified each tests the RIGHT thing and genuinely fails:
- **Blob (`two_attacking_lines`, `an_attacker_into_a_holding_line`):** holds position
  (no cross/swirl — passes) but the grid stretches to ~2.5× depth and frays to
  cohesion 0.23 over the 300s grind. Real formation loss; relaxing depth/cohesion
  would make the test vacuous. Softer ram-drag (keystone 2) + the advance equilibrium
  (keystone 1) should reduce the impact compression.
- **Standoff (`mechanics_weave`: `two_braced_walls`, `the_fronts_stay_welded`,
  `a_sheared_block`, `the_lattice_settles`):** the braced `weapon_repel` standoff
  still under-holds — see `specs/contact-foundation-clash.md`.
- **`phalanx_and_heavy_clash_without_swirling`:** asymmetric reach (pike locks before
  the heavy) drives a wheel. Facing-feedback, not yet killed for asymmetric pairs.
- **Break-off / withdraw (task #57): `withdraw_disengages_under_fire`,
  `engage_move_backs_off`, `engage_move_extracts`, `cavalry_breaks_off`,
  `pursue_auto`:** a disengaging unit can't pull its frame out of contact.
- **Cohesion-recovery (task #56): `halted_frame_slides_off_rocks`,
  `long_marches_fray`, `mud`:** a settled disordered unit never re-forms. **Tried:** a
  disorder-triggered re-form fixed `corridor` (now green via nothing? no — it was
  fixed and reverted) but perturbed float state and chaos-flipped `deep_pike_wall`,
  net-zero. A re-form trigger that doesn't perturb engaged units is the path.
- **`pikes_unhorse`, `rider_reachability`:** rider-vs-horse strike GEOMETRY (reach to
  the perch) shifted with the new contact distances.
- **`weapon_swaps`:** pikes barely thrust in the 35s window (cadence/closing), even
  with the braced-parry fix.
- **`mirror_duels`:** heavy mirror routs at 154s, light at 328s — a duration
  INVERSION (heavies should outlast lights). Real balance bug.
- **`othismos_presses`:** the Othismos and Fence stances now produce the same gap
  (1.18) — the press-to-bodies stance distinction collapsed.
- **`large_turns_pivot`:** a 180° pivot smears the ranks (err 4.39 vs <3).
- **`artillery_stones` (max stunned 0):** stones one-shot-kill, so no survivor is left
  stunned — needs splash-stun or lower per-hit lethality.
- **`one_heavy_solos_two_lights`, `a_held_braced_line`:** brace-vs-fresh / armor-vs-
  numbers outcomes that moved with the combat changes.

## What WAS fixed this session (committed, the pattern to continue)

The out-of-date tests really were out of date — these are the clean wins:
- 3 charge tests ordered Run pace (the decoupled-walk change made unspecified-pace
  attacks crawl, so the burst never fired). `597f947`.
- `horse_archers` repinned kill→wound (lethality lives in the volley tests). `b9821f4`.
- `unit_attacked` cohesion repin (the foundation raised the baseline). `68a3576`.
- front-rank frame-lock (`bb7cb63`), braced-pike parry (`69dd6c5`).
Plus 4 decoupling migrations into `balance_combat.rs` / `balance_charge.rs`.

## Process

Cargo first; vibe shots are the ground truth for the blob/standoff judgment calls
(this session could not run them — several "is this a real blob or a repinnable
transient" calls are deferred to a vibe pass). Golden re-pins on any sim-value
change. Concurrent sessions share the tree — scope commits by path. Delete this file
once the two keystones land and the tail is cleared.
