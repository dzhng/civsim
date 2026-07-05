# Slice 06 — The run to contact: arrive formed, arrive fresh

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
