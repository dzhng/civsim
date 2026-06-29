# Slice 3 — prove the crab is gone (and didn't break the feel)

## Contract this unlocks

A pinned metric so the back-line crab can never silently creep back, plus a
human-viewable artifact David can open to confirm by eye that (a) back lines do
not shuffle sideways while engaged, (b) a wiped column stays a notch, and (c) the
notch evens out cleanly a beat after the unit disengages. This slice is also the
charge-feel sign-off (the one watched risk from slice 2).

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

## What must stay green

Everything from slice 2's "must stay green," plus the new
`mechanics_formation` metric itself once landed.

## Feedback that would change this slice

- David's eye on the artifact is the real gate. If the notches read as ugly or
  the deep block still looks like it's drifting, that sends work back to slice 2
  (cadence, CLEAR_BEAT, or the engaging/advancing gate), not to new mechanics.
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
