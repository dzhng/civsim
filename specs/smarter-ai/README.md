# Smarter campaign AI — lookahead, randomness, personas

## Goal

Make the campaign commander *deliberate* instead of *react*: at each decision
point it imagines a few candidate commitments, rolls each one forward with a
cheap battle estimator, scores the resulting position, and picks — with a dose
of human-like randomness. Different factions weight the score differently
(turtle vs. expander vs. merchant), so the map grows distinct personalities.

This is "chess-AI lite": clone the state, simulate candidate futures, evaluate,
choose. We deliberately stop at **one-ply** search for v1 (MCTS is a gated,
optional final rung) because most of the felt intelligence lives in the
*evaluation* and the *battle estimate*, not in depth.

## Why this fits civsim

The strategic layer is already shaped for search (see recon):

- `CampaignState` is `Clone + Serialize`, all collections `BTreeMap`/`Vec` in id
  order, and the RNG (`Pcg32`) lives **inside** the state
  (`crates/campaign/src/state.rs`). Clone → roll forward → reproducible future.
  A rollout clones the state, so it **never perturbs the live RNG stream** —
  determinism is preserved for free.
- `sim::tick(map, &mut state)` (`crates/campaign/src/sim.rs:16`) is a pure step
  function given the static map.
- The AI already thinks on a cadence — `commanders()` every 60 ticks
  (`crates/campaign/src/ai.rs:45`) calling `think()` (`ai.rs:137`). That is the
  discrete decision point search slots into.

The one missing substrate: a **production** cheap battle resolver. Today it
exists only in the test harness (`crates/campaign/tests/full_game.rs:70`,
`fast_resolve`). Slice 1 promotes it.

## The shape of the change

`think()` today is a propose-and-immediately-issue pipeline: defend → spend →
offensive → consolidate, each block issuing orders directly. We split the
**consequential, uncertain** decisions (which city each attacker marches on;
commit vs. hold) out of that pipeline and route them through search. The
deterministic bookkeeping (recruit-to-cap, build market, merge idle armies)
stays rule-based — searching over it buys nothing.

```
think(faction):
  defend / recruit / build / merge   ── unchanged rule blocks
  ┌─ offensive decision ─────────────────────────────────────┐
  │ candidates(faction)  -> [Plan]      // a few attacker→target assignments + Hold
  │ for each Plan:                                            │
  │   sandbox = state.clone()                                 │
  │   apply(sandbox, Plan)                                    │
  │   rollout::forward(sandbox, HORIZON) // battles auto-resolve via estimate
  │   score = eval(sandbox, faction, persona.weights)         │
  │ pick = softmax(scores, persona.temp, rng)  // randomness  │
  │ commit(pick)                                              │
  └───────────────────────────────────────────────────────────┘
```

Three randomness knobs, all drawn from `st.rng` (so determinism holds):

1. **Perceived strength** — when evaluating, fuzz own/enemy strength estimates.
   The AI commits on the *fuzzed* number; reality resolves on the true one.
   This is what makes it occasionally walk into a fight it shouldn't.
2. **Bravado / mood** — a slowly-drifting per-faction scalar that shifts the
   attack threshold. Persists, so a faction has a "streak," not per-hour noise.
3. **Selection temperature** — `softmax` over candidate scores instead of
   `argmax`. Doubles as a persona dial (cold/Calculating ↔ erratic/Warmonger).

## Slice graph

| # | Slice | Unlocks | Verify | Type |
|---|-------|---------|--------|------|
| 1 | [Cheap battle estimator](slices/01-cheap-battle-estimator.md) | `resolve::estimate(setup) -> BattleResult` in prod | unit test vs. test `fast_resolve` parity | substrate |
| 2 | [Rollout sandbox](slices/02-rollout-sandbox.md) | `rollout::forward(map, &mut state, ticks)` auto-resolving battles | determinism + no-hang cargo test | substrate |
| 3 | [Eval + candidates](slices/03-eval-and-candidates.md) | `eval::score`, `Plan`, `candidates()` + a probe that dumps scored futures | snapshot probe a human reads | substrate + visible |
| 4 | [Wire one-ply search](slices/04-wire-one-ply-search.md) | `think()` chooses offensive by rollout (argmax, default weights) | `full_game.rs` trajectory ≥ today; perf budget | **behavior** |
| 5 | [Randomness](slices/05-randomness.md) | perceived-strength + bravado + softmax | determinism held; cross-seed variety test | behavior |
| 6 | [Personas](slices/06-personas.md) | `AiPersona` variants → weight/temp profiles | per-persona behavioral tests | behavior |
| 7 | [Event-triggered re-think](slices/07-event-rethink.md) | contact/threat/siege re-thinks a faction off-cadence | feint-response test | behavior |
| 8 | [Rivals](slices/08-rivals.md) | per-faction nemesis: seeded or formed in play, auto-resets on power gap | seed/adopt/escalate/reset tests | behavior |
| 9 | [MCTS (optional, gated)](slices/09-mcts-optional.md) | multi-ply search over intent sequences | only if one-ply feels shallow | optional |

Slices 1→2→3 are substrate that lands without touching live AI behavior. Slice 4
is the first behavior change and the first measurable win. 5/6/7 are independent
of each other and can land in any order after 4; **slice 8 (rivals) builds on
slice 7's event detection** (a rivalry can form when you're attacked). Slice 9 is
gated on a human judgment call after 4–8 ship.

Rivalry is **not** a persona — it's a relationship every faction can carry
regardless of persona, biasing (not overriding) whatever persona it has.

## Sacred contracts (must stay green)

- **Determinism** (`state.rs` header doctrine): BTree-only, id-order iteration,
  RNG in state. Rollouts clone before ticking — the live `st.rng` stream must be
  byte-identical with and without search. There is a test that pins this.
- **Fog of war**: search runs under the faction's own `st.visible`
  (`ai.rs:147`), never omniscient. A rollout may only "see" what the real
  commander sees at decision time.
- **Player-legal orders only** (`ai.rs:1-4` doctrine): search still emits only
  `try_move` / `recruit` / `build` / `merge`.
- **The real battle is still the physics sim**: `resolve::estimate` is the AI's
  *imagination only*. The player-facing encounter still resolves through the
  full sim (`crates/sim`). Never route a live battle through `estimate`.
- **Campaign-health harness**: `crates/campaign/tests/full_game.rs` (loop
  liveness, no-freeze, economy sanity) and `lopsided_war_concludes` stay green.

## Firewalls / non-goals

- **Not touching battle physics.** Zero changes under `crates/sim`. (`tweak-mechanics` territory; off-limits here.)
- **Not changing the economy model**, only *reading* it for eval weights.
- **No MCTS in v1.** Slice 8 is written but gated.
- **No new frontend AI controls.** Personas come from map data
  (`mapdata.rs:165` `ai_persona` field), as today.

## Known unknowns (first slices resolve these)

- **Rollout horizon.** 120 ticks (2 game-hours)? 180? Tuned empirically in
  slice 4 against the harness.
- **Search cost budget.** clone × rollout × candidates × campaigning factions,
  once per hour. The memory notes a ~2ms/tick visibility bottleneck already;
  slice 4 must measure that the hourly search stays within budget (cap
  candidates / horizon if not).
- **Is one-ply enough?** Gates slice 8. Decide after 4–7 are playable.

## How to start cold

A fresh agent begins at `slices/01-cheap-battle-estimator.md` and walks the
ladder. Each slice file names its module seam, the test that pins it, and what a
human can run to judge it. Open `visualizations/decision-flow.html` for the
one-page picture.
