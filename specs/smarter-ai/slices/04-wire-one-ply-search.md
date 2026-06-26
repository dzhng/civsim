# Slice 4 — Wire one-ply search into `think()`

## Contract

The first behavior change: the offensive decision in `think()` (`ai.rs:247-309`)
stops issuing the first rule-picked target and instead simulates each candidate
plan, scores the rollout, and commits the best (argmax — randomness arrives in
slice 5). Defend / recruit / build / merge blocks are untouched.

## API seam

- In `crates/campaign/src/ai.rs think()`, replace the offensive block body with:
  ```rust
  let plans = plan::candidates(map, st, f, bfs);
  let mut best = None; // (score, &Plan)
  for p in &plans {
      let mut sandbox = st.clone();        // clone → never touches live rng/state
      for &(army, loc) in &p.orders { sim::try_move(map, &mut sandbox, army, loc, true); }
      rollout::forward(map, &mut sandbox, tun::AI_ROLLOUT_HORIZON);
      let s = eval::score(map, &sandbox, f, &eval::Weights::default());
      if best.map_or(true, |(bs, _)| s > bs) { best = Some((s, p)); }
  }
  if let Some((_, p)) = best {
      for &(army, loc) in &p.orders { sim::try_move(map, st, army, loc, true); }
  }
  ```
- New tunables: `AI_ROLLOUT_HORIZON` (start 120), `AI_MAX_CANDIDATES`
  (cap to bound cost), in `crates/campaign/src/tunables.rs`.

## What the human can run / see

- A full campaign in the app — the AI should make visibly less suicidal marches
  (no more walking the main army into a city it can't take while its capital
  falls).
- `cargo test -p campaign --test full_game` — the campaign-health harness, now
  with the searching AI driving both sides.

## Verifies

- **Trajectory ≥ today:** on the `full_game.rs` seed sweep, the searching AI
  should not regress loop liveness / no-freeze / economy sanity, and ideally
  cuts "army lost to an unwinnable assault" events. Record before/after counts.
- **Perf budget (the gating measurement):** instrument one hourly
  `commanders()` pass and assert wall-time stays within budget given
  `candidates × horizon × campaigning factions`. If over, cap horizon /
  candidates and log what was dropped (no silent truncation). The memory's
  ~2ms/tick visibility cost is the reference scale.
- Determinism: a fixed-seed campaign produces an identical trajectory across two
  runs (rollouts clone, so the live stream is unperturbed).

## Stays green

- `full_game.rs`, `lopsided_war_concludes`, determinism doctrine.
- Defend/recruit/build/merge behavior identical to today (only the offensive
  target selection now goes through search).

## Feedback that would change this

- Horizon too short → AI can't "see" a battle resolve before scoring (looks
  myopic); too long → cost + the sandbox drifts into noise. Expect to tune
  `AI_ROLLOUT_HORIZON` against what David sees in-app.
- If argmax already feels too robotic here, that's the cue that slice 5
  (randomness) is the higher priority follow-on.
