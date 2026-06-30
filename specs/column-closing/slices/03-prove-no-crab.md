# Slice 3 — prove the crab is gone (and didn't break the feel)

## Contract this unlocks

A pinned metric so the back-line crab can never silently creep back, plus a
human-viewable artifact David can open to confirm by eye that (a) back lines do
not shuffle sideways while engaged, (b) a wiped column stays a notch, and (c) the
notch evens out cleanly a beat after the unit disengages. This slice is also the
charge-feel sign-off (the one watched risk from slice 2).

This proof must include recreated battle/weave shots, not just Rust tests. The
visual acceptance bar is less-wrong formation order against the physical target:
fixed-file casualty closing should reduce the blobbing caused by lateral
relabeling, and the column should stay near its deployed footprint at enemy
contact rather than pinching narrower or spreading wider. A baseline/current
comparison is required, but the baseline is not ground truth. The shot review
must include a fresh, unprimed `screenshot-critique` subagent (`fork_context:
false`) looking only at the comparison sheet and tight crops with a prompt that
names the target and asks for visible defects in both images.

## API seam

- A real test in `crates/sim/tests/mechanics_formation.rs` (the file started in
  slice 1) — immortal fakes, reads `sim.positions` / `sim.soldier_slot` /
  `sim.units` (all `pub`).
- A human-viewable artifact under `specs/column-closing/visualizations/` — a
  deterministic capture rendered to something David opens in a browser (a
  slot-occupancy / lateral-displacement timeline). Self-contained HTML or a
  generated report, not a live server.
- Optionally a `renderer-lab` (`apps/renderer-lab`) scene that runs the same
  scenario visually for the eye check. Rebuild wasm first.

## What the human can run / see

- `cargo test -p sim --test mechanics_formation` — the metric gate.
- Open `specs/column-closing/visualizations/<name>.html` — a grid-over-time view
  of one unit: dots are slots, colour shows live/dead/vacant, a per-rank lateral
  drift trace alongside. The story it must tell at a glance: rear-rank dots stay
  in their columns while engaged; a wiped column shows as a persistent empty
  stripe; after the disengage marker, the stripes close in one re-even.
- Recreate and inspect the relevant battle/weave shots. Treat them as the
  acceptance evidence for formation order, not as decoration after the tests.
- Attach the full comparison sheet and tight crops to an unprimed
  `screenshot-critique` subagent. Record high-confidence visible defects before
  claiming the proof passes.
- The renderer-lab scene (if built) for the moving-picture version.

## Tests that pin it

1. **Rear-line lateral travel < ε while engaged.** Promote slice 2's dbg probe:
   over an engaged grind with front-rank casualties, the summed/peak lateral
   displacement of rear-rank men stays at the push-only floor — well below a
   one-spacing relabel step. This is the regression sentinel.
2. **Notch persistence.** After wiping a file mid-fight, the frontage stays
   notched (measure frontage occupancy by file) until the disengage re-even, then
   becomes even.
3. **Charge feel sign-off.** The slice-2 charge/impact watch, restated as an
   explicit acceptance: a charge into a forward-only line still produces the
   expected give/absorb within `mechanics_charge`/`mechanics_impact` tolerances
   — no new rigidity regression.

## Current checkpoint

- `rear_ranks_do_not_crab_sideways_while_engaged_casualties_close` is pinned in
  `crates/sim/tests/mechanics_formation.rs`.
- Current output: `NO-CRAB rear lane excursion n=35 p95=0.296m peak=0.327m`.
- The rail is `p95 < 0.45m` and peak `< 0.55m`, deliberately below a ~`1.0m`
  file relabel but above the harmless spring settle seen in the fixture.
- The human-viewable timeline is committed at
  `specs/column-closing/visualizations/no-crab-timeline.html`. It renders the
  same-file forward-close fixture plus the wiped-file notch and clear-beat
  re-even.
- Fresh Chrome WebGPU `vibe/penetration`/`vibe/offense` frames were regenerated
  and sent to Bacon, a fresh unprimed `screenshot-critique` explorer
  (`fork_context: false`). Bacon surfaced unresolved defects and preferred the
  baseline/left for `penetration`, but David reviewed the same shots and judged
  the current/right less wrong because the baseline middle harrows inward. Bacon
  also judged the current/right less wrong for `offense`.
- A post-merge evidence pass rebuilt wasm, refreshed Chrome hardware WebGPU
  `vibe/penetration`/`vibe/offense`, reran `compare-screenshots` with central
  crops under `/private/tmp/civsim-column-closing-postmerge.Fr2MCA/`, and then
  re-blessed those two vibe baselines after David accepted current as less wrong
  than the flawed baseline. Follow-up verification without `UPDATE_SHOTS` passed.
- Slice 3's visual acceptance is closed with the retained loose trails/offense
  dark-body ambiguity recorded as visual debt, not a blocker.

## What must stay green

Everything from slice 2's "must stay green," plus the new
`mechanics_formation` metric itself once landed.

## Feedback that would change this slice

- David's eye on the artifact is the real gate. If the notches read as ugly or
  the deep block still looks like it's drifting, that sends work back to slice 2
  (cadence, CLEAR_BEAT, or the engaging/advancing gate), not to new mechanics.
- If the recreated battle/weave shots show worse formation order, more blobbing,
  or a column that is clearly farther from its deployed-width target, do not
  re-pin them; fix the behavior first.
- If the critique subagent catches a visible order/blob/scan-readability issue
  the main pass missed, add it to the visual checklist or fix it before accepting
  the slice.
- If the visualization isn't legible enough to judge, iterate the artifact — its
  whole job is to make the lateral-vs-forward distinction obvious without reading
  code.

## On close

When all three slices have shipped and David has signed off on the artifact, run
[close-spec](../../../.claude/skills/close-spec/SKILL.md): archive this plan to
`specs/done/column-closing/`, fold the visualization in as provenance, and
rewrite the README from a build ladder into the durable rationale ("why a
fighting line closes forward, never sideways, and where the lateral re-even
lives").
