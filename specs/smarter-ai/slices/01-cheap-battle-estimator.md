# Slice 1 — Cheap battle estimator (production)

## Contract

A production-callable, deterministic, O(1) battle estimator the search can use
to resolve imagined fights without booting the physics sim. Today this logic
lives only in the test harness (`crates/campaign/tests/full_game.rs:70`,
`fast_resolve`). Promote it into the crate so both the harness and the AI use
one estimator.

## API seam

- **Module:** `crates/campaign/src/resolve.rs` (battle handoff already lives
  here) — add:
  ```rust
  /// Cost-weighted strength model of a battle's outcome: heavier side wins,
  /// both bleed in proportion to the strength gap. Deterministic, O(units).
  /// The AI's *imagination only* — the live, player-facing battle still runs
  /// the full physics sim. Never resolve a real encounter through this.
  pub fn estimate(setup: &contract::BattleSetup) -> contract::BattleResult
  ```
- **Strength yardstick:** reuse the AI's existing measure so estimate and eval
  agree — `economy::upkeep_per_soldier_milligold(map, st, faction, class)` is
  what `ai.rs:14 strength()` uses. The test's `fast_resolve` used the
  no-context `tunables::upkeep_per_soldier_milligold(class)` variant; the
  promoted version should take whatever context the production strength model
  needs (likely `map, st`) and stay consistent with `ai.rs strength()`.
- Output shape unchanged: `BattleResult { victor, units: Vec<UnitResult> }`.

## What the human can run

```
cargo test -p campaign resolve::estimate
```
A unit test that builds a couple of `BattleSetup` fixtures (lopsided, near-parity)
and asserts the victor + casualty bands match the documented model
(winner survives 50–100%, loser 0–45%, scaling with the strength ratio).

## Verifies

- Parity test: `estimate` reproduces the old `fast_resolve` numbers on the same
  fixtures (port the test inputs).
- Determinism: same setup → identical result, no RNG read (estimate is
  deterministic by construction — strength-ratio only, no dice). If we later
  want noisy battle outcomes, that noise belongs in **perceived strength**
  (slice 5), not here — keep `estimate` itself pure so rollouts are repeatable.

## Stays green

- `full_game.rs` harness — refactor it to call `resolve::estimate` instead of
  its private `fast_resolve`; trajectories must be unchanged (it's the same
  math). Delete the now-duplicated private fn.

## Feedback that would change this

- If David wants the estimate to account for terrain / reinforcement timing /
  unit-class matchups (cav vs. spear) rather than pure cost-weight, that's a
  richer `estimate` — but land the pure version first; matchup-awareness is a
  follow-up that directly raises the AI's tactical IQ.
