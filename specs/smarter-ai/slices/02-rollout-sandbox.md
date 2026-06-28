# Slice 2 — Rollout sandbox

## Contract

Advance a *cloned* campaign state forward N ticks with battles auto-resolved by
the cheap estimator (slice 1), so the AI can see the consequences of a
commitment without blocking for a player-driven battle. The live game loop hands
a `Pending`/`battle_ready` encounter to the player; a rollout must instead
resolve it immediately and keep ticking.

## API seam

- **Module:** `crates/campaign/src/rollout.rs` (new):
  ```rust
  /// Tick a sandboxed (already-cloned) state forward `ticks` campaign minutes,
  /// auto-resolving any battle-ready encounter via `resolve::estimate`. Pure
  /// w.r.t. the live game — callers clone first; this mutates only the sandbox.
  pub fn forward(map: &WorldMap, st: &mut CampaignState, ticks: u32)
  ```
- Internally: loop `ticks` times calling `sim::tick(map, st)`; after each, while
  `st.battle_ready.is_some()`, build the setup (`resolve::battle_setup`-style,
  ~`resolve.rs:189`), call `resolve::estimate`, and `apply_outcome`. Reuse the
  existing setup/apply machinery — do **not** fork it.
- The AI does **not** re-think inside a rollout (avoid recursion / cost blowup):
  the sandbox's other factions keep marching on the orders they already have,
  but `commanders()` is suppressed during `forward`. A `bool` on the call path
  or a sandbox flag on the state gates the `tick % 60` AI call in `sim::tick`.

## What the human can run

```
cargo test -p campaign rollout
```

## Verifies

- **Determinism (the load-bearing test):** clone a fixture state twice, run
  `forward(.., 200)` on each → byte-identical results (`serde` round-trip eq).
  And: cloning + rolling forward leaves the **original** `st.rng` and state
  untouched (the sandbox is the clone; the live stream never advanced).
- **No hang:** a fixture with two armies set to collide resolves the battle via
  `estimate` and keeps ticking to the horizon — no deadlock waiting on a player.
- **Suppressed re-think:** assert `commanders()` did not fire inside `forward`
  (e.g. a counter, or that no recruit/build happened mid-rollout).

## Stays green

- Determinism doctrine (`state.rs` header). This slice is where it's easiest to
  break — guard it with the clone-equality test above.
- `sim::tick` behavior for the live loop is unchanged; the only addition is the
  suppress-AI gate, which is a no-op when not in a rollout.

## Feedback that would change this

- If suppressing all other-faction AI makes rollouts too unrealistic (enemies
  feel like they "freeze"), an alternative is to let one cheap reactive layer
  run for them. Start with full suppression — it's the cheapest and most
  predictable baseline; revisit only if eval quality demands it.
