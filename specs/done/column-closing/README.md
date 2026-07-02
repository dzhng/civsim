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
formation moments: pivot, width changes, Reform/rally/at-ease recovery, the
one-shot clear-beat recovery after disengage, and a limited broad-contact beat
where most files are already fighting and stale labels would make a deep,
physically wide front read as pinched.

## Why This Shape

The old engaged repair path used `reassign_slots`, which sorts survivors by
world position and gives them new lateral files. That can make a dense fight
look tidy in one frame, but it also tells rear ranks to cross sideways through
their own formation. The weave then faithfully pulls bodies toward those new
slots, so the apparent crab is not a renderer problem or a push effect; it is a
slot-identity problem.

The shipped rule treats file identity as part of battle identity. A man may be
shoved by physics, but casualty repair does not decide that he now belongs to a
different file unless the unit has left live contact, the gap is large enough
for the explicit local bridge rule, or a broad/deep contact already has most of
the front fighting and needs a slow re-dress to keep measured width honest. This
keeps ordinary casualties forward-only, keeps notches legible, and gives deep
adjacent gaps a controlled rear reserve without using whole-rank sideways motion
as the normal repair path.

The visual target is the original deployed column footprint at enemy contact,
not pixel closeness to the old screenshot baseline. In the accepted penetration
case the 8-file column's deployed slot width is about `6.3m`; the pinned contact
test rejects a pinched column (no band narrower than `deployed - 1.5m`) and a
broad fan-out (no band wider than `deployed + 8m` — a deliberately loose rail
that catches whole-formation splash, not small spread). The old baseline is
itself flawed for this scenario: its middle pinches or harrows inward
unnaturally, so the accepted current shots are judged as less wrong against the
deployed-footprint target, not as a perfect final look.

The final contact-width pass also keeps the pivot spring's angular lever capped
for mounted contact and for a narrow foot column driving into a much wider foot
front. That cap is a geometry guard, not a winner-preservation rule: an axially
stretched queue should not turn a bond-angle correction into lateral fan-out.
Ordinary foot-on-foot wraps still use the live bond length so they can drape
around exposed flanks.

The pivot cap is also the build's headline divergence. The plan's premise was
that the crab was purely a slot-identity bug — "physics is untouched, we change
only which slot a man is assigned, never the forces." That held for the crab
itself, but the contact-width fan-out turned out to be a steering problem, not
a relabel problem: ablation pinned it to the lateral component of the pivot
spring inside `steer_soldiers` (disabling the forward block changed nothing;
disabling compression worsened the rear; disabling the pivot spring alone kept
the column narrow). Shipping therefore required a physics change — the length
cap — and a golden-hash re-pin the plan had promised would not happen.

## Invariants

- Fighting or advancing casualty repair must not change ordinary survivors'
  files.
- `compact_columns` keys its ordering on rank and soldier index, never on world
  position. Sorting survivors by where physics shoved them is exactly the
  relabel crab; a tidiness refactor that swaps the key silently reintroduces it.
- A wiped single file remains a notch while contact is live.
- Adjacent two-or-more-file lanes may receive bounded rear/deep donors from the
  nearest live edges; donor count is `min(gap files, 6)` — capped by the gap
  and an absolute ceiling, never by unit size.
- Non-donor rear ranks' lateral excursion stays under absolute no-crab rails
  (p95 under `0.45m`, peak under `0.55m`) — set below the roughly `1.0m`
  signature of a file relabel and above harmless spring settle. A full file
  relabel is the regression this feature exists to prevent.
- Lateral re-evening is reserved for deliberate reform moments, the disengage
  clear beat, and the broad/deep contact re-dress; it must not be the ordinary
  answer to live casualty holes.
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
    at-ease, disengage, and broad/deep contact re-evening.
  - The weave pivot spring caps axial stretch only where the live-length lever
    would create physically false fan-out: mounted contact and narrow columns
    entering much wider foot fronts.
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

- `visualizations/no-crab-timeline.html` is the durable slot-map record for the
  file-fixed close: rear ranks stay in their columns, a wiped file remains a
  live-contact notch, and the clear beat later re-evens it.
- `visualizations/bridge-gap-proof.html` is the durable record for the local
  bridge rule: a two-file lane gets two rear/deep edge donors, a four-file lane
  gets four bounded donors, and a single-file notch gets none while contact is
  live. Only the two-file case is pinned by a cargo test
  (`adjacent_wiped_files_get_bounded_rear_donors`); the four-file case is
  illustrated here and enforced by the `min(gap, 6)` cap in the code, not by a
  test.
- Both HTML pages embed hand-authored fixture captures written to mirror the
  formation tests; they are illustrative records of the accepted behavior, not
  machine-generated sim dumps.
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
  target-lane costs, broad magnet/awareness clamps, and rest-weave stiffness
  all moved one diagnostic in the right direction but failed either scalar
  mechanics, survivability, or browser visual review.
- The long-grind survivability ceiling (`HP4/HP1` must stay near `6.0x`) was
  the recurring executioner: rear no-cruise gates, removing friendly
  separation-slide, and same-file slide damping each narrowed the width probe
  and then died there at `6.2–6.6x`. Anything that stops rear ranks from
  flowing around friends stretches the long grind.
- Rear-scoped pivot *lateral damping* was promoted and then rejected for a
  stringy, porous tail and a front wedge in visual review; the narrower
  *length* cap survived. Damp the lever's length, not its lateral component.
- A looser `0.15m` pivot slack broke
  `a_mortal_wrapping_line_backfills_casualty_tears` and pushed survivability
  outside the rails; the shipped `0.10m` is the widest slack that held, not an
  arbitrary constant.
- Purely suppressing lateral pressure is the wrong lever: it can make a column
  look narrower while starving bulge, wrap, latch, or long-grind survivability.
- The local bridge is deliberately conservative. It seeds large lanes from the
  rear and leaves single-file notches alone because instant clean rectangles
  would erase battle damage and reintroduce whole-rank sideways motion.
