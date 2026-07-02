# Slice 01 — Force-trace harness: every force, traceable to its source line

Not throwaway diagnosis — a permanent debug harness for ALL tweak-mechanics
work. This is a deterministic simulator where we control every variable; a
"why did this man move" question should be answered by reading a ledger, not
by trial-and-error knob sweeps. The current loop guesses a force, ablates,
re-runs, guesses again; the harness inverts that — measure first, then the
hypothesis list writes itself.

## Contract

For any soldier on any tick, the harness answers: **which force channels
acted on him, with what vector, and which exact piece of logic produced
each** — covering the full stack, not just steering. The trace is faithful by
construction: each contribution is recorded at its application site (the
value actually added), never recomputed offline.

## API seam

In `crates/sim`, behind a cargo feature (e.g. `force-trace`) so the default
build is **byte-identical** — the standoff-double-push effort proved probes in
hot code can shift float codegen; a compile-time gate is the only airtight
guard. Sketch (implementer refines):

- `ForceChannel` enum, one variant per contribution, each carrying its source
  tag (module + function + role, e.g. `sim.rs/steer_soldiers/enemy_bond`).
  Full coverage — every row of the README force-stack table:
  weave net, comp_push, pivot spring, enemy bond (weld and inside-reach push
  separately), slot pull (incl. the 0.65 lean as its own tag), corridor clamp,
  magnet (with `seeking_flank` flagged), cruise, fighting-pace cap, pike
  lateral friction, body separation (friendly vs enemy, slide component
  SEPARATE from the normal component — the chirality question needs it),
  hard wall, projection passes, weapon repel (frontal-gate status attached),
  hit_push, knockback/momentum, and facing changes.
- **Caps and clamps record pre- and post-cap values** — a cap is a decision;
  "which cap bit, and how much it removed" is exactly what trial-and-error
  can't see.
- Recorder: per-tick ring/append buffer of
  `(tick, soldier, unit, channel, vec, meta)` with a filter (unit set, soldier
  set, tick range, channel mask) so a 400 s run doesn't drown; dump to JSONL
  for offline analysis and HTML visualization.
- Query layer (test-side, `crates/sim/tests/common/`): per-soldier ledger,
  per-unit net-force and **torque-about-centroid budgets by channel**,
  seam-crossing decomposition (which channel carried the man across on the
  crossing tick), cap-hit histograms.

## Verification

- Default build: `golden_state_hash_stable` byte-identical; full
  `scripts/test-mechanics` green; zero new code in the hot path without the
  feature.
- Traced build: golden hash compared against default — if float codegen moves
  it, record that fact in the spec and treat traced runs as self-consistent
  diagnosis (conclusions re-checked against an untraced run's observables);
  if it doesn't move, say so and gate on it.
- Conservation sanity: per tick, sum of recorded steering contributions ≈ the
  applied pre-collision displacement (catches an uninstrumented channel —
  the whole point is that NOTHING moves a soldier untraced).
- A smoke test: one 10 s traced clash, assert every expected channel appears
  and every channel present is in the enum (no `Other`).

## Human can run / see

A runnable probe (`cargo test ... --features force-trace -- --ignored
--nocapture` or a small `bin/`) that films one matchup and emits the ledger +
a self-contained HTML force-budget timeline (per-channel net force and torque
per unit over time) under `specs/melee-blob/visualizations/`.

## Skill handoff (part of this slice's contract, not optional)

Update `.claude/skills/tweak-mechanics/` before closing the slice:

- Add a `references/force-trace.md` documenting: how to enable the feature,
  the channel taxonomy and source tags, the query helpers, the
  cap/pre-post convention, the codegen caveat, and worked one-liners for the
  standard questions ("what carried this man across the seam", "torque budget
  by channel", "which cap fired").
- Add a short section to `SKILL.md` pointing at it, positioned as the FIRST
  move of the measure-the-mechanism loop ("trace before theorizing") — per
  write-skills, body stays lean, details live in the reference.
- The instrumentation examples in the skill's existing text (log constituent
  terms, torque ledgers, crossing carriers) become harness queries, not
  bespoke eprintln archaeology.

## What would change this slice

If a channel genuinely cannot be recorded at its application site without
perturbing the sim (borrow structure, hot-loop layout), restructure the code
so it can — that refactor is in scope here: a force you cannot observe is a
force you cannot debug, and the code shape that hides it is itself the smell.

## Implementation note — 2026-07-02

Verification:

- Default `cargo test -p sim --test golden`: passed, pinned hash stayed
  `0xc8fad834908e0b0e`.
- `./scripts/test-mechanics`: passed.
- `cargo test -p sim --test force_trace --features force-trace -- --nocapture`:
  passed conservation + smoke (`2 passed`, probe ignored).
- `cargo test -p sim --test golden --features force-trace -- --nocapture`:
  moved to `0x85d3bfbc44fd15cb` versus the default pin. Treat traced runs as
  self-consistent diagnosis and re-check observables untraced.
- Probe generated
  `specs/melee-blob/visualizations/force-budget-timeline.html` and
  `force-budget-heavy-v-heavy.jsonl`.

Skill handoff landed in the reviewer pass: `.claude/skills` is a symlink to
`.agents/skills` (write there — the Codex sandbox exposed it read-only);
`references/force-trace.md` added and SKILL.md got the "Trace before
theorizing" section. Reviewer also moved the raw JSONL dump to
`target/force-trace/` (run output, never committed) and rewrote the probe's
HTML as a self-contained SVG chart (top-6 channels + Other, per-unit net
|force| and torque panels, tooltip, table view, light/dark).
