# Slice 1 — Search module (`ai::search::mcts`)

## Contract

A standalone MCTS over the labeled candidate-plan space that, given a snapshot
and a budget, returns the `Plan` a multi-ply search prefers — deterministic from
a passed RNG. Lands as pure substrate: nothing in `think` calls it yet, so live
behavior is unchanged.

## API seam

- **Module:** `crates/campaign/src/ai/search.rs`

  ```rust
  pub struct SearchBudget { /* iteration cap and/or wall-time cap */ }

  pub fn mcts(
      map: &WorldMap,
      st: &CampaignState,
      f: FactionId,
      profile: &persona::Profile,
      budget: SearchBudget,
      rng: &mut contract::Pcg32,
  ) -> plan::Plan;
  ```

- **Tree over intents, not tiles.** Edges at any node are exactly
  `plan::candidates(map, node_state, f, profile.gate, bfs)`. Never enumerate raw
  per-army×per-city moves — the labeled, fog-filtered, gate-filtered intent set
  is the whole branching factor.
- **The four phases, all on reused parts:**
  - **selection** — UCB over a node's candidate edges; `profile.select_scale` is
    the exploration constant (the same dial that is softmax temperature in
    one-ply).
  - **expansion** — clone the node state, apply the chosen plan's orders,
    `rollout::forward_plan` to advance to the next decision point.
  - **simulation** — `rollout::forward` to the horizon; leaf value is
    `eval::score(.., profile.weights)`.
  - **backprop** — carry the value up the visited path.
- **Determinism:** every random draw (UCB tie-breaks, any rollout stochasticity)
  comes from the passed `rng`, visited in a fixed order. The function must not
  read `st.rng` directly — `commander_decision` owns that boundary (`turn_rng`).
- **Budget:** sized so one call fits the per-decision perf budget the one-ply
  search already lives within (slice 2 measures it). An iteration cap is the
  simplest; a wall-time cap risks nondeterminism unless the *number* of
  iterations is what's pinned — prefer a deterministic iteration cap.

## What the human can run / see

- `cargo test -p campaign search` — the unit suite below.
- An optional `--nocapture` tree dump (depth, per-edge visit counts, chosen path)
  on a fixture decision, so the search is inspectable rather than a black box.

## Verifies

- **Deterministic:** same seed + same snapshot → identical returned `Plan` and
  identical internal visit counts. Run twice, assert equal.
- **Finds the known-best line:** on a hand-built tiny map where a two-step plan
  (take a soft city, *then* the prize it opens) clearly dominates, `mcts` returns
  the first step of that line where one-ply's `pick_softmax` does not.
- **Respects budget:** iteration cap honored; returns `hold` (empty plan) rather
  than hang when no candidate beats holding.
- **Fog-honest:** with a candidate hidden by fog at the root, the search never
  selects it (it isn't an edge).

## Stays green

- All smarter-ai contracts. This slice only *adds* a module; it reads the
  existing substrate and mutates only its own clones.

## Feedback that would change this

- If the labeled-intent edge set can't express the multi-step play the fixture
  needs, that's a signal to widen candidates (bounded) — recorded for slice 3,
  not solved by raw-move enumeration here.
