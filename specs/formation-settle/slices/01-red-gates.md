# Slice 01 — Red gates: the settle contract, pinned

## Contract unlocked

"Settled" becomes a measured, single-owner quantity, and every churn family
from the README is a named cargo test: green for the cleared suspects, red
(by design) for families A/A′/B/C. After this slice, progress on 02–04 is
visible as gates flipping green — no re-diagnosis, no probe re-reading.

## API seam

`crates/sim/tests/common/settle.rs` (new module under the existing
`tests/common`), promoted from `mechanics_settle_probe.rs`:

- `WindowStats` + `window_motion(sim, unit, seconds) -> WindowStats` — the
  one owner of settle telemetry (mean speed, mean |lateral|, max excursion,
  big movers, slot changes, anchor lateral drift, facing delta).
- `march_until_arrived(sim, unit) -> f32` — order resolution wait, ALSO
  waiting out `pending_target` (order delay) and `final_facing` (arrival
  pivot); the probe version missed pending orders and reported "arrived
  t=0.0s" for the cliff margin-10/12 cases — fix that here.
- `assert_settles(sim, unit, within_s, watch_s)` — the gate predicate:
  after `within_s`, every 10s window over `watch_s` has mean speed
  < `SETTLE_SPEED` and zero slot changes.
- `SETTLE_SPEED: f32 = 0.06` — ~3× the measured 0.018 m/s fidget baseline.
  Loose sanity rail, not a golden value (write-tests rule 4).

The probe file keeps its `audit_slots` ASCII map + force-trace probes as
diagnostic tools for 02–04; only the shared telemetry moves.

## Tests (new: `crates/sim/tests/mechanics_settle.rs`)

Green from day one (the cleared suspects, pinning containment):

- `settle_after_straight_move`
- `settle_after_angled_move` (40°, plain + commanded-facing, default tunables)
- `settle_after_frayed_angled_move` (uneven casualties + 35°)
- `settle_on_rough_patch` / `settle_after_crossing_rough_strip`
- `settle_adjacent_group_move` (2m clearance battle line)

Red by design (the spec's work, `#[ignore = "formation-settle slice NN"]` so
`--no-fail-fast` stays green repo-wide; run them explicitly per pass and
un-ignore in the slice that fixes each):

- `settle_near_impassable_pocket` — seed-1 cliff, margin 14 (family A)
- `settle_inside_marginal_corridor` — gap 9.7 (family A′)
- `settle_overlapping_friendly` — 5m overlap (family B)
- `grind_lateral_slosh_bounded` — family C; threshold TBD by slice 04's
  attribution, pin the CURRENT measured value as the not-worse ceiling for
  now (mean lateral ≤ 0.7 m/s sustained) and tighten in 04.

## What the human can run

`cargo test -p sim --test mechanics_settle -- --nocapture` — one file, every
family, telemetry printed on failure.

## Stays green

Everything: the ignored-red pattern keeps CI truthful. Golden untouched
(this slice adds tests only).

## Human feedback that would change this slice

The `SETTLE_SPEED`/`within_s` bounds (recommend 0.06 m/s within 20s of
arrival). Non-blocking: state them in the pass summary, wait ~5 min,
proceed on the recommendation and record the choice here.
