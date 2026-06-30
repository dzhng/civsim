# Column Closing

Column closing keeps a fighting formation from repairing casualty holes by
sliding the whole rank sideways. While a unit is fighting or advancing, living
soldiers close deaths forward in their existing files. A wiped single file
stays visible as battle damage until the clear beat after contact, and larger
adjacent dead-file lanes are seeded only by a bounded number of rear/deep edge
donors.

The purpose is to remove the back-line crab caused by lateral slot relabeling
while preserving the battle behaviors that depend on pressure, bulge, wrap, and
back-fill. Full lateral re-evening still exists, but it belongs to deliberate
formation moments: pivot, width changes, Reform/rally/at-ease recovery, and the
one-shot clear-beat recovery after disengage.

## Why This Shape

The old engaged repair path used `reassign_slots`, which sorts survivors by
world position and gives them new lateral files. That can make a dense fight
look tidy in one frame, but it also tells rear ranks to cross sideways through
their own formation. The weave then faithfully pulls bodies toward those new
slots, so the apparent crab is not a renderer problem or a push effect; it is a
slot-identity problem.

The shipped rule treats file identity as part of battle identity. A man may be
shoved by physics, but casualty repair does not decide that he now belongs to a
different file unless the unit has left live contact or the gap is large enough
for the explicit local bridge rule. This keeps ordinary casualties forward-only,
keeps notches legible, and gives deep adjacent gaps a controlled rear reserve
without re-forming the whole unit.

The visual target is the original deployed column footprint at enemy contact,
not pixel closeness to the old screenshot baseline. In the accepted penetration
case the 8-file column's deployed slot width is about `6.3m`; the pinned contact
test allows small physical spread but rejects both a pinched column and a broad
fan-out. The old baseline is itself flawed for this scenario: its middle pinches
or harrows inward unnaturally, so the accepted current shots are judged as less
wrong against the deployed-footprint target, not as a perfect final look.

## Invariants

- Fighting or advancing casualty repair must not change ordinary survivors'
  files.
- A wiped single file remains a notch while contact is live.
- Adjacent two-or-more-file lanes may receive bounded rear/deep donors from the
  nearest live edges; donor count is capped by the gap, not by unit size.
- Non-donor rear ranks must stay near the push-only lateral floor; a full file
  relabel is the regression this feature exists to prevent.
- Lateral re-evening is reserved for deliberate reform moments and the
  disengage clear beat.
- Mechanics that need pressure must keep working: column bulge, attack/move
  latch behavior, mortal wrap back-fill, survivability rails, and weave contact
  cohesion are not optional visual trade-offs.
- Future shot review should compare baseline and current with the repo's
  `compare-screenshots` helpers for sheets and tight crops, but the verdict is
  "less wrong against the physical target," not "closer to baseline pixels."

## Code Pointers

- `crates/sim/src/unit.rs`
  - `compact_columns` closes living soldiers forward inside each file.
  - `bridge_large_column_gaps` seeds adjacent dead-file lanes with bounded
    rear/deep edge donors.
  - `reassign_slots` remains the lateral re-even primitive for reform moments.
- `crates/sim/src/sim.rs`
  - `Sim::tick` separates fighting/advancing casualty closing from pivot,
    at-ease, and disengage re-evening.
- `crates/sim/tests/mechanics_formation.rs`
  - `advancing_casualties_close_forward_within_the_same_file`
  - `wiped_file_stays_notched_until_the_clear_beat_reform`
  - `rear_ranks_do_not_crab_sideways_while_engaged_casualties_close`
  - `adjacent_wiped_files_get_bounded_rear_donors`
  - `live_frontage_reshape_gathers_before_running_off`
- `crates/sim/tests/mechanics_melee.rs`
  - `column_contact_width_stays_near_its_deployed_footprint`
  - `a_column_bulges_a_held_line_it_does_not_part_it`
  - `a_mortal_wrapping_line_backfills_casualty_tears`
  - `attack_latch_behaves_like_a_move_order`
- `crates/sim/tests/golden.rs`
  - `golden_state_hash_stable` pins the accepted deterministic sim hash.

## Visual Provenance

- `visualizations/no-crab-timeline.html` is the durable slot-map proof for the
  file-fixed close: rear ranks stay in their columns, a wiped file remains a
  live-contact notch, and the clear beat later re-evens it.
- `visualizations/bridge-gap-proof.html` is the durable proof for the local
  bridge rule: a two-file lane gets two rear/deep edge donors, a four-file lane
  gets four bounded donors, and a single-file notch gets none while contact is
  live.
- `web/shots/vibe/penetration/` and `web/shots/vibe/offense/` hold the accepted
  battle-vibe baselines. They were regenerated after the deployed-footprint
  target replaced raw baseline matching; current was accepted as less wrong
  than the flawed inward-pinched baseline. Loose trails and dark offense-body
  ambiguity remain known visual debt.
- `web/shots/weave/` holds the Rust-owned weave snapshots refreshed with the
  shipped mechanics.

Temporary comparison sheets and crops under `/private/tmp` were review evidence,
not durable requirements. The in-tree baselines and the two HTML visualizations
are the lasting visual standard.

## Rejected Paths

- Chasing the old baseline directly was rejected because that baseline can look
  narrower by pinching the column inward.
- Restoring engaged `reassign_slots` narrowed some probes, but did it by the
  forbidden lateral relabel and disturbed defender cohesion.
- File-local reranking, same-file collision queues, stronger slot rails,
  target-lane costs, broad magnet/awareness clamps, rear no-cruise gates,
  friendly-slide damping, pivot lateral damping, and rest-weave stiffness all
  moved one diagnostic in the right direction but failed either scalar
  mechanics, survivability, or browser visual review.
- Purely suppressing lateral pressure is the wrong lever: it can make a column
  look narrower while starving bulge, wrap, latch, or long-grind survivability.
- The local bridge is deliberately conservative. It seeds large lanes from the
  rear and leaves single-file notches alone because instant clean rectangles
  would erase battle damage and reintroduce whole-rank sideways motion.
