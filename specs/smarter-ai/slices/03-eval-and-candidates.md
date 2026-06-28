# Slice 3 — Position evaluation + candidate plans

## Contract

Two pure functions the search composes: a way to **score** a position from a
faction's view, and a way to **enumerate** the handful of offensive commitments
worth simulating. Plus a probe so a human can *read the AI's reasoning* before
it changes any behavior.

## API seam

- **Module:** `crates/campaign/src/ai/eval.rs` (new submodule of `ai`):
  ```rust
  /// What the faction is optimizing for. Slice 6 supplies per-persona presets;
  /// slice 4 uses a neutral default.
  pub struct Weights {
      pub territory: f64,   // cities held
      pub army: f64,        // cost-weighted surviving strength
      pub income: f64,      // daily income / treasury
      pub threat: f64,      // penalty for own cities under threat
  }

  /// Single scalar: higher is better for `faction`. Reads only what the faction
  /// can see (fog) + its own ground truth (own cities/treasury/armies).
  pub fn score(map: &WorldMap, st: &CampaignState, faction: FactionId, w: &Weights) -> f64
  ```
- **Candidate plans** — `crates/campaign/src/ai/plan.rs` (new):
  ```rust
  /// One imagined commitment: where each of the top attackers marches (or Hold).
  pub struct Plan { pub orders: Vec<(ArmyId, Loc)>, pub label: &'static str }

  /// A few sensible plans for `faction`, reusing today's target-finding
  /// (`pathfind::nearest_targets`, the focus_city logic, ai.rs:261-308):
  ///   - "focus": mass on the diplo_target's weakest reachable city
  ///   - "nearest-beatable": each attacker → nearest city it outmatches
  ///   - "nearest-any": advance on the nearest enemy city regardless
  ///   - "hold": no offensive march (consolidate only)
  pub fn candidates(map: &WorldMap, st: &CampaignState, faction: FactionId,
                    bfs: &mut pathfind::Visited) -> Vec<Plan>
  ```
- Candidate generation **must not mutate** `st` — it reads, proposes order
  tuples. `commit` (slice 4) applies them with `sim::try_move`.

## What the human can see (the visible deliverable)

A probe binary / test that, for a fixture campaign, prints per faction:

```
faction Argos  (persona: default)
  candidate "focus"            score 1240.5   ┐
  candidate "nearest-beatable" score 1318.2   ├ rollout HORIZON=120
  candidate "nearest-any"      score  980.1   │
  candidate "hold"             score 1102.7   ┘   -> would pick: nearest-beatable
```

Run via `cargo test -p campaign ai::probe -- --nocapture` (or a tiny
`examples/ai_probe.rs`). This is the artifact that lets David critique the AI's
*taste* — is it valuing the right things? — before it drives the game.

## Verifies

- `score` unit tests: more cities ↑ score; an own city under threat ↓ score;
  losing your army ↓ score. Monotonic in each weight.
- `candidates` returns the documented plan set on a fixture, dedups identical
  order sets, and never includes a city the faction can't see/reach.
- The probe output is committed as a snapshot (small, human-readable) so changes
  to eval/candidate logic show up as a reviewable diff.

## Stays green

- No live behavior change yet — `think()` still issues orders the old way.
  Nothing in the running game calls `score`/`candidates` until slice 4.

## Feedback that would change this

- The **weights and the candidate set are the whole personality of the AI** —
  expect David to iterate here most. Keep both trivially editable and the probe
  output front-and-center. If he wants a defensive plan ("pull back to a
  chokepoint") or a feint, add it as a labeled candidate here.
