# Slice 06 — The run to contact: arrive formed, arrive fresh

## SPLIT (pass 7): 06-stamina SHIPPED, 06b-formed PARKED with evidence

**Shipped**: `run_drain` 1/90 -> 1/340 (derived: measured 170s trip at
550m, 0.5/170; foot arrives at 0.507, cav at 0.819 — gate
`run_to_contact_stamina` live and green; combat outdrains the road ~7:1).

**Parked (06b)**: the formed-arrival fix. The catch-up-surge exemption
from the personal ceiling WORKS for the tail — 94m -> 10.1m measured,
15s dress to cohesion 1.000 — but leaks: an uncapped surge cannot tell
"catching up on open ground" from "pressing into a crowd", so trailing
men slam into piles at surge speed. Measured collateral (with the
exemption scoped even to Run-pace only): `cavalry_mass_shoves_through_
infantry` INVERTED (walking spear column out-shoved horses 3.92 vs
2.45) and the braced walk-in annihilation floor tripped. The 06b design
needs a front-clear/open-ground condition on the exemption (the
`front_clear` per-soldier state exists) so digging deep is only legal
with room to run into. ALSO parked from the same pass: the at-ease
reform fit-acceptance gate (the 0.9-ratio noise gate applied to the
at-ease cadence) — principled against a latent at-ease relabel storm
(one margin-12 microstate showed it) but it moved braced-line mop-up
outcomes; it must land with its own containment run. Gate
`run_to_contact_arrives_formed` re-ignored with the full note.

**Re-derivation ledger (06-stamina)**: fatigue timings rewritten around
1/340 (claims unchanged); arrows-advance ceiling 14-20% -> 9.5-12%
(fresher runners cross the lane faster); light-horse trample band edge
0.08 -> 0.07 (fresher heavy shock raises the denominator); grind
silhouette 0.90 -> 0.82 and column contact fan deployed+8 -> +12
(FLAGGED: the fan widening is the least comfortable re-pin — re-examine
in 06b, whose front-clear surge work touches the same contact scenario);
golden re-pinned 0x43d5... -> 0x7e12....

**QUARANTINED (David checkpoint)**: `trample_attack_dives_in_and_breaks_
enemy_cohesion` — run_drain alone flips the dive from boring in (cy 1.4)
to stopping at the face (cy 0.1); wrong-direction for freshness, via an
un-mapped stamina coupling in the charge machinery; the pin's own doc
describes a cy~15 ride-through that HEAD already contradicted (1.4).
Needs a fresh dive-contract calibration WITH David — do not silently
re-pin either way. Codex's re-derivation batch papered this one with an
invented "fresher infantry" story (the defenders stand); its other seven
re-pins verified honest.

## Contract unlocked (David, 2026-07-06, verbatim intent)

Two armies that RUN at each other across a battle map must MEET as
armies, not as dust:

1. **Formed on arrival.** Today a map-scale run (~550m, deployment line
   to mid) dissolves units into a scatter hundreds of meters deep
   (screenshot in David's report). Root, already located: the catch-up
   surge exists but is clamped by each man's personal top-speed fraction
   (`max_sp = min(surge-or-keep-up, (0.62..1.06) x sprint)` in
   `steer_soldiers`) — the comment's own intent exempted the CHARGE from
   the clamp but not the catch-up; the slowest fifth's ceiling sits below
   run pace so they fall behind monotonically, and the weave is off while
   running so nothing re-dresses. Fix directions, in doctrine order:
   (a) a formation that runs TOGETHER paces itself — effective run pace
   keyed to a low percentile of the living men's personal ceilings (drill
   reality: the line runs as fast as its slowest men, arrive slightly
   slower but formed); (b) the catch-up surge escapes the personal
   ceiling (a straggler digs deep — the stated intent). Likely both;
   measure each alone first.
2. **Foot arrives at ~half stamina.** Deployment-to-mid run: foot lands
   at ~50% (today ~0% — `run_drain` empties in ~90s and the run takes
   longer than that). Calibrate `run_drain` (and the stamina_factor
   curve if needed) so the map-scale approach costs about half the tank.
3. **Cav arrives at ~75%.** The horse carries the kit: mounted running
   must drain markedly slower than foot (whatever the mechanism —
   `move_drain_mult` exists — the pin is the arrival number).
4. **Most drain happens IN the battle.** After the calibrated approach,
   sustained melee should dominate total drain (combat_drain per minute
   of fighting >> run drain per minute of approach at the new rates).

## Gates (new, in mechanics_settle.rs or mechanics_fatigue.rs)

- `run_to_contact_arrives_formed`: two 120-man foot blocks 550m apart,
  both Run + move order to the midpoint; at first contact (or the
  midpoint), each unit's cohesion above a formed bar and no straggler
  further than ~2 unit-depths behind its anchor. Red today.
- `run_to_contact_stamina`: same setup; foot stamina in [0.4, 0.6] at
  the midpoint; a cav unit on the same run in [0.65, 0.85]. Red today.
- Existing `mechanics_fatigue.rs` pins WILL move (run_drain retune) —
  re-derive each with cause; the qualitative fatigue contracts (winded
  units guard/hit softer, recovery at rest) must hold unchanged.

## Verification

- The gates above; the full suite with per-pin provenance (stamina
  touches combat outcomes — balance pins may drift; ledger every move).
- Vibe: heavy-move-clash (the Move==Attack invariant twin) re-read — the
  approach should now LOOK like two lines meeting.
- Browser feel-check on the gen map at army scale (the screenshot's
  scenario): run two armies at each other, confirm they meet as lines.

## Stays green

Everything from slices 01-04; the settle gates are untouchable context
(pacing changes must not reintroduce arrival churn).

## Human feedback that would change this slice

The exact arrival numbers (50%/75%) are David's design targets — pin the
bands generously (±10 points) and present the measured feel; the
formed-arrival bar (cohesion level, straggler distance) is a taste call
presented with the vibe frames.
