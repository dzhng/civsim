# Spec: Two attacking infantry lines must hold contact, not pass through

## Goal, in one sentence

When two identical infantry blocks attack each other head-on, the contact must
HOLD — the lines grind at the seam and neither centroid crosses the other — but
today they walk clean through each other (centroid gap goes from +33m to −75m,
monotonically, the moment they touch), and the whole downstream suite (the
melee/combat/pacing clashes, ~most of the 58 reds) rides on this one break.

This is the unfinished half of the parallel session's contact-foundation rebuild
(`d6cef10`, "Standoff force: two-way, mass-shared, nearest-foe"): that commit got
the BRACED standoff holding (`mechanics_weave` 12→4) but plain melee lines still
pass through. The charge half is now fixed and committed (`feb15c2`,
`press_brake` 10→4, `mechanics_charge` 0→5/5) — see "must not change".

## The contracts (the tests are the spec)

Must BECOME green (all in `crates/sim/tests/mechanics_melee.rs`, all pass-through/
swirl/blob right now):
- `two_attacking_lines_hold_and_never_cross` — the canonical one; both attack.
- `an_attacker_into_a_holding_line_keeps_formation` — attacker into a HOLD; gap −26.
- `a_held_line_is_not_split_by_a_narrow_column`, `a_column_bulges_a_held_line_it_does_not_part_it`
- `a_wide_line_wraps_a_narrow_block`, `phalanx_and_heavy_clash_without_swirling`
- `attack_latch_behaves_like_a_move_order` — the Move==Attack litmus (attack
  gap_min −75 vs move −18: BOTH cross, attack worse).

Must STAY green (the stability/charge boundary — do not regress):
- `mechanics_melee::symmetric_clash_is_even_handed` — identical lines take ~equal
  losses. This is the BUCKLE guard: an over-strong frontal standoff makes the side
  that slips a hair ahead win 58/162. It currently passes; keep it.
- `mechanics_charge::*` (5/5 green as of `feb15c2`) — the immortal charge-vs-block
  rig. `press_brake=4` is load-bearing for these; don't undo it to fix the clash.

## Context you don't have (read this; it is the whole reason)

The sim is a HYBRID (see the `tweak-mechanics` skill "Crutches are debts"):
- **Propulsion is kinematic** — a soldier's velocity is his capped intent
  (`steer_to * soldier_gain`, clamped to `max_sp`, sim.rs ~1602), re-asserted every
  tick. He does NOT decelerate when he pushes on a body.
- **Contact is a capped position correction** — both the body non-overlap AND
  `weapon_repel` are clamped to `tun.separation_max_push = 0.25` m/tick in the
  apply loop (collision.rs ~430 and ~446). There is also a HARD wall (collision.rs
  ~470) that snaps a man out of an enemy body he OVERLAPS — but only on actual
  overlap; it does nothing for a man threading the lateral GAP between two enemy
  bodies.
- **The "leash" is `counter_press`/ram-drag, implicitly.** There is no explicit
  leash in `update_unit_motion` — the anchor just marches at `frame_speed` (movement.rs
  ~242), and `frame_speed → pace_speed(tun,u)`, which subtracts the ram-drag brake
  (`press_brake * grip * counter_press * v²`, movement.rs ~69). So the only thing
  that halts the frame at contact is the measured enemy press. This crutch is
  OVERLOADED: it is both the charge brake and the formation leash.
- **The seek gate is `front_clear`** — computed in combat.rs ~186: a man is
  `front_clear=1` (allowed to magnet-seek his target, sim.rs ~1569) unless a
  comrade who is ALREADY FIGHTING stands within 1.2m and ±26° of his target
  bearing. On inspection this correctly blocks rank-2+ in a head-on clash.

## Measured evidence (BINDING — trust these numbers)

`two_attacking_lines_hold_and_never_cross`, HeavySword, seed 4242, `TRACE=1`:
- It is **pure pass-through DURING the fight, not a swirl**: `faceDev` stays **0°**
  the entire grind; the gap decreases monotonically from contact (t≈6s, +8m) to
  −75m. `faceDev` only climbs to 90° AFTER combat ends (t>52s) — that is the
  routed remnants wheeling, which is what trips the `max_facing_dev<20°` assert,
  but it is a SYMPTOM of the rout, not the cause.
- `frameSp` holds ~2 m/s through the whole "grind" — the frames never stop driving.
- `depth_ratio` of the driving block grows to **~11× nominal** — the two blocks
  interleave into one long smear along the facing axis (men of both teams in the
  same y-band; `interpenetration` 0.55).
- Even a pure **MOVE** onto each other's start crosses by 18m — so it is NOT a
  combat/magnet-only effect; the bodies themselves don't hold.

## Failed levers — DO NOT RE-TRY THESE (measured this session)

All via temporary env hooks (`mechanics_melee.rs` reads `SEPCAP`/`SLOTPULL`/
`PRESSBRAKE`; a `REPELCAP` cap-multiplier and a `FIGHTADV` hook were tried and
reverted):
- **Raise the `weapon_repel` cap** (`REPELCAP` 1→30× separation_max_push): makes it
  WORSE. `symmetric_clash` BUCKLES at ≥4× (58/162 — the exact positive-feedback the
  collision.rs:435-442 comment warns of), the clash gap goes −75→−85, and it
  SATURATES at 4× (no change 4→30). Conclusion: the repel *force magnitude*
  (`near_pen × weapon_repel × DT`) is small — it is not cap-bound, and more of it
  buckles before it seals.
- **Raise/lower `press_brake`** (4/10/20/40): gap −40 (at 10) to −84; never holds.
  The leash is not the lever, AND this **exonerates** the `press_brake=4` charge
  fix — the clash fails identically at the old 10.
- **Cap the engaged forward drive** (`FIGHTADV`, the sim.rs:1649 fighting-pace cap,
  1.7→0→−0.5): even at −0.5 (engaged men shoved AWAY from their foe) the gap is
  −64. So **the men who cross are NOT the engaged front rank being driven forward.**
  `interpenetration` drops (0.55→0.29) but the cross persists.

That last result is the key diagnostic: the crossing mass is something OTHER than
"engaged front men driving into the foe."

- **Rear-rank seeking is RULED OUT** (tested): dropping the `fighting` requirement
  in the front_clear gate (combat.rs:186, block on ANY frontal comrade within 1.2m
  ±26°, not only a fighting one) made the clash WORSE (−80.7 vs −75.3), and the
  pure MOVE case crosses by 18m with no seeking at all. So it is NOT the
  magnet/front_clear path.
- That leaves **the body-contact layer itself** (hypothesis 1 below) as the path:
  the capped (0.25/tick) non-overlap + overlap-only hard wall cannot hold a driven
  column — men thread the lateral gaps and the cap can't relieve the cumulative
  uncapped steering drive of the ranks behind. Confirmed direction; the remaining
  unknown is the exact channel (carried `mom_*` from the slam vs slot_pull vs the
  collision push spilling sideways-then-forward) — isolate it before the fix.

## The design (PROPOSED — the evidence above is binding, this is not)

**Step 1 is INSTRUMENTATION, not a knob.** Add a throwaway `tests/dbgN.rs` that
runs the clash and, at the tick the gap first goes negative, classifies each
crossed man by what moved him there: decompose his last-tick displacement into
(magnet, slot_pull, weave comp_push, carried mom, collision repel/scratch). The
ruled-out levers prove the cause is none of {repel strength, brake, engaged
forward cap}; find which of the remaining channels carries the crossing mass
BEFORE touching any force. Probes change float codegen — instrument from the test
side, never `eprintln!` in lib hot code.

Two leading hypotheses to test once instrumented:
1. **Capped contact < cumulative backed-column drive.** A deep block's rear ranks
   each add uncapped steering drive; the 0.25/tick contact cap can't relieve it, so
   the front is shoved through, and the hard wall (overlap-only) lets men thread the
   lateral gaps. Fix direction: make the hard wall seal the gaps — a man may not
   END the tick on the far side of the nearest enemy body's contact ring (a
   projection/constraint, NOT a bigger spring; projections don't buckle, so
   `symmetric_clash` stays safe where REPELCAP did not).
2. **front_clear false-negative.** `blocked` requires the blocking comrade to be
   `fighting`; a front comrade not yet flagged fighting (or a diagonal gap) lets a
   rear man seek through. Test by tightening the gate (block on any close frontal
   comrade, not only fighting ones) and watch the smear.

The honest end-state (bigger, optional): make propulsion force-integrated so it
decelerates on contact — then the leash, the pass-through, AND the `counter_press`
crutch all fall out together. Out of scope here unless Step 1 points straight at it.

## What must NOT change

- **`press_brake = 4`** (tunables.rs) and `mechanics_charge` 5/5 — the charge
  foundation, committed `feb15c2`. The clash fix must not regress it; the charge
  experiment proved ram-drag is the ONLY charge-stopper (trample_bleed is hard-
  capped at 0.85 and saturates because propulsion refills carried momentum each
  tick), so do not weaken the brake to fix the clash.
- **The weave intent model** (capped at `max_sp`) and **impale** (combat.rs ~259,
  the honest `kin_*` momentum-return for a charge onto points). Both are correct.
- **`symmetric_clash_is_even_handed`** — the buckle guard. Any new standoff force
  must be stable for identical lines (a projection, not positive-feedback spring).

## B5 / C6 status (the cross-line-force cleanup, for the record)

- **B5 (`weapon_repel`)**: already rebuilt by `d6cef10` into a two-way, mass-shared
  "a leveled weapon is a body" constraint — honest in shape, but capped (see above)
  and nearest-foe-only (does not seal lateral gaps). The clash fix likely subsumes
  this.
- **C6 (`hit_push`, combat.rs ~466)**: still a `tunable × mass-ratio` shove — the
  one remaining non-kinematic cross-line force. Impale handles charge-grade
  closings honestly; the residual melee shove should be gated against impale (no
  double-count) or reduced to a contact-relief. Lower priority than the clash.

## Process requirements (hard-won)

- Cargo first (`cargo test -p sim --no-fail-fast`); vibe shots last; rebuild wasm
  before any browser check.
- Probes change float codegen — instrument from a throwaway `tests/dbgN.rs`, never
  `eprintln!` in lib hot code.
- The golden hash (`golden.rs`) WILL move on any sim-value change — re-pin
  deliberately, once, in the same commit. It is ALSO already red on this branch.
- Concurrent sessions share the working tree: NEVER `git stash`/`git checkout`/
  reset over files; `git add` your own files by path; this session had a `git
  checkout collision.rs` correctly denied for that reason.
- Decouple as you go (the standing goal): physics invariants → `mechanics_*.rs`
  (cohesion/centroid/penetration, immortal or identical units, never wins);
  performance-vs-price → `balance_*.rs`. Migrate legacy `*_scenarios.rs` under the
  right prefix as you touch them.

## Acceptance

1. The 7 `mechanics_melee` tests above green together; `symmetric_clash` and
   `mechanics_charge` stay green; full workspace green; golden re-pinned once.
2. The fix is a FORCE/CONSTRAINT that holds the seam, not a relaxed threshold — the
   centroid-never-crosses and faceDev<20° asserts stay strict and pass on the
   physically-correct behavior (a held grind), verified on the vibe timeline too.
3. Postmortem note here: the per-man crossing-attribution result (which channel
   carried the mass) and the before/after gap_min, for the next person. Then delete
   this file.
