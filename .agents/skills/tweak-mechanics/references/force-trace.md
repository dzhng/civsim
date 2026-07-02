# The force-trace harness

Every force that moves or turns a soldier is recordable, tagged with the exact
piece of logic that produced it. In a deterministic sim, "why did this man
move" is a ledger read, not a knob sweep — reach for this FIRST, before any
hypothesis, ablation, or eprintln.

## Enabling

```
cargo test -p sim --test force_trace --features force-trace -- --nocapture
```

The harness is compile-time gated on the `force-trace` cargo feature. The
default build is byte-identical (the golden hash does not move — that is a
standing gate). **Codegen caveat:** with the feature ON, float codegen shifts
and the golden hash differs. Traced runs are self-consistent diagnosis;
re-check any load-bearing observable on an untraced run before shipping a
conclusion.

## Recording model

- `sim.force_trace` (`ForceTrace`) accumulates `ForceRecord`s:
  `(tick, soldier, unit, channel, vec, pre, post, meta)`.
- Each `ForceChannel` variant is one application site;
  `channel.source_site()` returns the `file/function/role` tag (e.g.
  `collision.rs/apply_separation/friendly_slide`). There is deliberately no
  catch-all variant — an unrecorded channel is a bug.
- The friendly-slide chirality is its own channel
  (`BodySeparationFriendlySlide`), separate from `BodySeparationNormal`; the
  0.65 engaged lean is `SlotPullLean`, separate from `SlotPull`.
- **Caps and clamps record pre- AND post-cap values** (`record.pre` /
  `record.post`, `vec = post − pre`): "which cap fired and how much it
  removed" is first-class data. `channel.is_cap()` marks them.
- Values are recorded at the application site — the actual vector applied,
  never recomputed offline.
- `sim.set_force_trace_filter(ForceTraceFilter { units, soldiers, tick_range,
  channels })` bounds recording on long runs; `sim.clear_force_trace()` resets
  (e.g. after spawn/warmup). `sim.force_trace.dump_jsonl(path)` writes raw
  records for offline analysis — put them under `target/`, never in `specs/`.

## The built-in guarantee

`sim.force_trace_steering_residuals(tick)` returns, per living soldier, the
gap between the sum of recorded steering contributions and the applied
pre-collision displacement.
`force_trace.rs::force_trace_steering_conserves_pre_collision_displacement`
pins it near zero — so NOTHING moves a soldier untraced; a new force added
without instrumentation fails this test.

## Standard questions, one-liners

Query helpers live in `crates/sim/tests/common/mod.rs::force_trace`:

- **What carried this man across the seam?**
  `seam_crossing_decomposition(&sim.force_trace, soldier, tick, seam_axis)` →
  per-channel displacement along the seam normal on the crossing tick. The
  biggest entry is the carrier — name it, then read its source site.
- **Torque budget by channel** (swirl/pinwheel diagnosis):
  `unit_force_budget_by_channel(&sim.force_trace, unit, tick, &positions)` →
  net force + torque about the unit centroid per channel. Sum over a window to
  see which channel drives a rotation and whether it grows with tilt.
- **Which cap fired?** `cap_hit_histograms(&sim.force_trace)` → counts per
  cap channel; read individual records' `pre`/`post` for how much they bit.
- **Everything that touched one man:**
  `per_soldier_ledger(&sim.force_trace, soldier)`.

`force_trace.rs::write_heavy_force_budget_timeline_html` (`--ignored`) is the
worked example: traces a heavy-v-heavy probe clash and writes a
self-contained per-channel force/torque timeline chart to
`specs/done/melee-blob/visualizations/force-budget-timeline.html`. Copy its shape
for new probes.

## Discipline

- Trace, read the ledger, THEN hypothesize — the constituent-term logging the
  skill body demands ("log its constituent terms, find which one carries it")
  is a harness query now, not bespoke eprintln archaeology.
- No eprintln/probes in lib hot code outside the feature gate (float-codegen
  hazard — proven in the standoff-double-push work).
- If a new force can't be recorded at its application site, restructure until
  it can; an unobservable force is undebuggable by construction.
