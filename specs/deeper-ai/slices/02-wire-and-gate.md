# Slice 2 — Wire the selector + the perf gate

## Contract

`ai::think` chooses its offensive with `mcts` when depth is enabled, and the
existing one-ply softmax otherwise. Depth is opt-in and the whole campaign stays
deterministic and within the per-decision perf budget with it on.

## API seam

- **The switch.** Replace only the offensive block in `ai::think`
  (`crates/campaign/src/ai.rs`, the `have_idle && tick % AI_SEARCH_EVERY == 0`
  branch) with: if depth enabled → `plan = search::mcts(.., budget, rng)`; else →
  today's `candidates` + `pick_softmax`. Issue `plan.orders` exactly as now.
- **Enabling depth.** Prefer a `Profile` field (e.g. a per-persona `search_depth`
  or budget) so depth is a persona trait, not a global mode — `Calculating` is
  the natural first persona to think deeper. A global tunable
  (`AI_SEARCH_DEPTH_*`) is acceptable for the first wiring. Default is one-ply, so
  existing maps are unchanged.
- **Boundary unchanged.** `mcts` runs inside `commander_decision` on the clone
  with the passed `rng`; its returned `Plan` flows into the `Decision` and out
  through `apply_decision`. `AI_DISPATCH_EVERY` / `AI_LATENCY` are untouched.

## What the human can run / see

- `cargo test -p campaign` — full suite green with a depth-enabled persona in a
  fixture.
- A timing line (behind the test harness, not shipped) reporting per-decision
  search cost for a depth persona on the grand-map sweep, to read against the
  one-ply baseline.

## Verifies

- **Determinism held (load-bearing):** `same_seed_replays_identically` extended
  to a depth-enabled faction — fixed seed → byte-identical campaign. This is the
  most likely break; pin RNG read order.
- **Liveness:** `full_game` and `lopsided_war_concludes` still conclude with a
  depth persona in the field.
- **Perf within budget:** per-decision search cost for the depth persona stays
  within the budget the one-ply search established (see the `lookahead-ai-cost`
  memory for the cost model and the bottleneck levers — fog is already frozen in
  rollouts). If it doesn't, lower the `SearchBudget`; do not widen the horizon.
- **No-op when disabled:** with depth off, the campaign is byte-identical to
  pre-slice — proving the wiring is a clean swap.

## Stays green

- Every smarter-ai contract, especially determinism and the health gate.

## Feedback that would change this

- If perf can't fit even a small budget, depth may be confined to a single
  marquee persona or to the player's immediate neighbours — log the limit, don't
  silently cap coverage.
