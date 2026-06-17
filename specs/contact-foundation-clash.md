# Spec: Two attacking infantry lines must hold contact, not pass through

## STATUS: pass-through + swirl SOLVED (commit 8709636); blob + regressions remain

The centroid pass-through and the 90° swirl are FIXED by three coupled changes
(frame-holds-when-locked, movement.rs; tight engaged leash, sim.rs ~1849; infantry
sheds carried momentum so only tramplers ride through, sim.rs ~1262). The clash now
holds: gap +0.8m, never crosses, faceDev 0°; `mechanics_charge` stays 5/5.

REMAINING (two_attacking_lines still RED on cohesion, not crossing):
1. **The blob** — coh 0.23 (want >0.7), depth 0.40 (want >0.6). With the frame held,
   the rear ranks pile FORWARD into the contact and collapse the block's depth/grid.
   The othismos equilibrium: the rear press must propagate back (whole block stops),
   not crush the front. This is the last clash blocker.
2. **The downstream regression sweep** — the foundation shift traded reds: FIXED
   symmetric_clash, attack_latch, pikes_bite, halted_defender; REGRESSED weapon_swaps,
   deep_pike_wall, a_held_braced_line, pikes_unhorse, unit_attacked_from_two_sides.
   Net suite ~flat (+1 from the golden re-pin). Each regression needs the judge:
   legit-downstream (old behavior was the bug) vs real break (the broad infantry
   mom-zero is the prime suspect — it kills knockback/stagger; narrowing it to
   enemy-contact-only without losing the clash hold is the open tuning).

Everything below is the ORIGINAL diagnosis that led here — kept for the mom/charge
coupling notes, still relevant to narrowing the mom-zero.

---


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
- **Attrition is RULED OUT** (tested `IMMORTAL=1`, all health 1e9): immortal lines
  cross identically (−78). So it is not "front dies, rear advances into the gap" —
  solid blocks of soldiers physically pass through each other.
- **Raising the body-contact cap is RULED OUT** (`SEPCAP` 0.25→8): no help (−76,
  saturates at 1.0). The non-overlap is NOT cap-bound.
- **The leash slack is a PARTIAL cause** (the real lever found so far): the engaged
  frame leash is `0.3*depth + 1.5` ≈ **4.4m** for these blocks (sim.rs:1849),
  despite the comment at sim.rs:1830 claiming "the frame sits AT the men when
  engaged — no forward slack." That slack lets the slots sit ~4m AHEAD of the
  fighting line and tow it forward. Tightening it when `fighting_frac>0.1` to a flat
  ~0 helps a lot but does NOT close it: gap −75→−42, crossed 17s→38s, faceDev 0°,
  losses 85/145→29/169. So the leash is one factor; a residual forward drive
  remains even at zero slack.

So it is **multi-factor in the frame/slot drive**, not a single force or cap. The
frame keeps advancing toward the past-foe attack target (`frameSp` ~2 m/s even when
fully engaged), the slots advance with it, and the men chase their slots through
the enemy; the leash slack amplifies it but isn't the whole drive.

**Tried (a)+(b) together — exposes the REAL blocker, a compression explosion.**
Setting the locked frame `target_speed=0` (frame holds at the men, movement.rs:233)
PLUS tightening the engaged leash to ~1m (sim.rs:1849): `frameSp` correctly drops to
0 and faceDev stays 0° — but at full engagement (t≈12→14s) the gap jumps +0.3→−29.7m
in 2s and `depth_ratio` EXPLODES to 16-22× nominal (men flung ~100m along the axis).
With the frame held, the rear ranks' pressure (slot_pull + the EXPONENTIAL weave
`comp_push`, sim.rs ~1439) builds at the contact line with nothing stable to resist
it, until the capped collision can't hold and the front squirts violently through.
So there is **no stable contact equilibrium**: the system either walks through
(frame drives) or explodes through (frame holds, compression builds). Both reverted.

**The real fix must give the contact a STABLE equilibrium under compression**, so the
rear-rank press reaches "rear pushing = front held" instead of building to a squirt.
Candidates: (i) a hard enemy non-overlap CONSTRAINT (projection, uncapped) rather
than a capped spring, so a pile-up can't tunnel/launch; (ii) soften/cap the
exponential `comp_push` under deep compression; (iii) swept/iterated collision so men
can't pass through each other between single-pass solves.

## BREAKTHROUGH: carried momentum (`mom_*`) is the SWIRL cause (measured)

`NOMOM=1` (zero every man's `mom_x/mom_y` each tick at the integration site,
sim.rs:1263) → **gap 0.8m, NEVER crosses, faceDev 0°.** The clash HOLDS. So the
pass-through is the **carried-momentum fling**: a charging infantry man's momentum,
re-armed every tick by the strike ledger (combat.rs:449, any struck man moving
>2 m/s) AND the collision-impact ledger (collision.rs:283, any closing >charge_min),
persists through the grind and tows the whole block ballistically through the enemy.
`comp_push` cap and `hit_push=0` do NOT reproduce this — only zeroing `mom` does.

But the fix is COUPLED and not yet clean — two findings the next pass needs:
1. **Arresting `mom` for fighting non-tramplers** (`if fighting[i]==1 && !u.tramples()
   { mom=0 }` at sim.rs:1263) KILLS THE SWIRL (faceDev 90°→1°) and is physically
   right (infantry crash and grind; cavalry ride through). BUT it only gets the gap
   to −59 (a residual centroid DRIFT remains, now with no swirl), AND it **regresses
   `mechanics_charge` 5→4** — because a charge legitimately needs its momentum and
   `fighting`/`engaged` fire during the charge crash too. Gating is the hard part:
   infantry must keep `mom` for the approach stride + the crash, but shed it in the
   settled grind, without zeroing the cavalry trample or the charge-vs-block tests.
   `u.engaged>0` is WORSE than per-man `fighting[i]` (−78 vs −59) — granularity matters.
2. **The residual −59 drift (swirl gone) is the DIRECT position pushes**, not `mom`
   (a fighting man's `mom` is already zeroed, so the fling is `hit_push` combat.rs:469
   + collision). It is NON-MONOTONIC in `hit_push`: with mom-arrest, `hit_push≈0.4`
   gives the best gap (−32, faceDev 0°) and LOWERING it is worse (−76) — so `hit_push`
   is *separating* the lines, not flinging them. Do not naively zero it.

So the contact has TWO coupled pass-through channels — ballistic `mom` (the swirl) and
the direct grind pushes (the drift) — and the momentum one is entangled with the
charge. The clean fix likely: shed infantry `mom` only once a charge is SPENT (not
merely engaged), so the crash keeps its stride but the grind sheds it; plus a stable
enemy contact for the residual drift. The frame-hold + tight-leash changes are correct
in spirit but expose the compression explosion until the contact is stable.

## Triage: the 58 are foundation-GATED, not stale (do not repin)

Checked the non-clash failures (terrain, nav, missile, pacing, posture, scenarios,
balance_matrix): nearly all are SYMPTOMS of this same broken foundation, not
independently-stale thresholds — cohesion-won't-recover-after-a-defile, pivots
smear, the pike matchup won't stop the horse, artillery impact stuns nobody,
skirmishers can't kite. Repinning them to current behavior would certify the bug
(the skill forbids it). So there is no large pool of "stale tests" to harvest: the
road to 100% green runs THROUGH this contact-stability fix. The golden hash must be
re-pinned LAST, once the foundation settles (it will move again with the fix).

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
