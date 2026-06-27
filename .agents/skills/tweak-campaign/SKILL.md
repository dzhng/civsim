---
name: tweak-campaign
description: How to change the CAMPAIGN strategic layer in crates/campaign — army movement on the road graph, economy, encounters/battle handoff, the commander AI, diplomacy, orders, and the wasm/frontend campaign loop. Use when adding or changing campaign behavior ("armies move too slow", "AI won't attack", "save crashes mid-game", "add a stance/order", "rescale time", "the worker AI"). Distinct from [tweak-mechanics](../tweak-mechanics/SKILL.md) — that is battle physics inside one fight; this is the world the battles sit in. Pairs with [write-tests](../write-tests/SKILL.md) and [debug](../debug/SKILL.md).
---

# Tweak Campaign

The campaign is an EU4-style pausable real-time strategy layer over a road
graph (`crates/campaign`). Pure logic, shared with the battle sim only through
`contract`. This skill is the map plus the constraints that bite — the rest you
can read.

## The map

- `sim.rs` — the tick pipeline (`tick`), movement, encounters, `try_move`,
  `order_pursue`, `new_state`. **The commander AI is *not* a tick phase.**
- `state.rs` — `CampaignState`, `Army`, `Stance`, the determinism doctrine.
- `tunables.rs` — every constant. Time, movement, economy, AI dials.
- `ai.rs` + `ai/` — the commander brain: `commander_decision(s)`,
  `apply_decision`, `think`, `eval`, `plan`, `persona`, `rival`, `orders`.
- `rollout.rs` — the lookahead sandbox (`forward`, `forward_plan`).
- `resolve.rs` — battle handoff (`battle_setup_for`, `apply_battle_outcome`)
  and `estimate`, the cheap battle model the AI imagines fights with.
- `economy.rs`, `pathfind.rs`, `mapdata.rs` (`WorldMap::from_json`).
- `crates/game-wasm/src/campaign_bind.rs` — the wasm boundary.
- `web/src/campaign/scene.ts` — the render loop + the off-thread AI worker.

## Workflow

1. **Locate the seam.** A behavior is in exactly one layer — movement
   (`sim::movement`), an economic rate (a day-boundary in `economy.rs`),
   contact (`sim::encounters`), the battle estimate (`resolve::estimate`), or
   the commander's *judgement* (`ai::`). Don't change the tick loop to fix an
   AI decision, or the AI to fix a physics-of-movement bug.
2. **Make it a tunable, not a literal.** New durations/rates go in
   `tunables.rs`. Game-world durations go through `ticks_from_minutes` (see
   Time below); the dial belongs to data, not code.
3. **Verify by the layered tests (below).** Pin the mechanism on a controlled
   fixture first, then the behaviour, and keep the gate green.

## Tests — layer them, and know which reds may move

General discipline is [write-tests](../write-tests/SKILL.md); the layering and
the **invariant-vs-outcome** read are the campaign echo of
[tweak-mechanics](../tweak-mechanics/SKILL.md). Three layers, smallest first:

1. **Mechanism test** — a tiny inline-JSON map, one behaviour, *variables
   controlled* so only the thing under test moves: clear city garrisons to pin a
   faction's strength to its field army, set exact unit counts, use
   `unit_type: None` to hit the class-rate path. Assert the **invariant** — the
   army marches on the soft city, pursuit runs down a router, a rival escalates
   to the stronger mutual aggressor, `estimate`'s casualty band. An invariant
   pins a *truth*: keep it strict; a red means you broke it.
2. **Behaviour test** — the real map (or a controlled fixture), driven N ticks
   with `Campaign::drive_ai` at the commander cadence (`tick % 60 == 0`),
   resolving `battle_ready` via `resolve::estimate`. Asserts an **outcome** (a
   warmonger out-attacks a turtle, different seeds diverge). Outcomes are noisy —
   any rng-timing change flips one seed — so **a comparison is a distribution:
   sum or average over a seed set, never assert a single seed**. (Determinism is
   the lone exception — same-seed replay is an invariant, not an outcome.)
3. **The gate** — `full_game::lopsided_war_concludes` proves the loop concludes
   end-to-end (always on); `grand_map_report` is the heavy `#[ignore]`d
   trajectory harness (`CAMPAIGN_DAYS=N`). A real root fix is **contained** — it
   moves the few tests that pinned the old behaviour and leaves the gate green.

Run with **`cargo test -p campaign --no-fail-fast`**: campaign is many test
binaries, and plain `cargo test` stops at the first failing one — a partial
false green that hides the rest. Trust the exit code, not a grep over output.

**A gate that breaks out of all proportion is a finding, not a chore.** When a
small, reasonable-sounding addition makes the gate hang or stop concluding —
wildly more than the change should warrant — that disproportion *is* the signal:
the feature has collided with a latent mechanical assumption, and the gate is
the only thing loud enough to surface it. Do NOT tune the new knob until it
passes (shrink the window, gate it to the player, special-case the AI) — that
buries the bug and ships a worse game. Build the red loop and **instrument the
trajectory**: a 5-second siege made the loop never conclude; the tell was
`flips=0` across 800 battles — cities had become un-takeable — and the root was a
besieged city *regrowing its garrison mid-assault*, so the attacker won every
fight yet never captured. Once that was fixed the knob worked at any value. The
lesson generalises: a green gate you reached by weakening the feature optimised
the test, not the game; the red gate was the discovery.

## Rules — the constraints that actually bite

- **Determinism is sacred.** BTree collections only, armies iterated in id
  order, and the `Pcg32` lives *in* `CampaignState`. Any new randomness draws
  from `st.rng`. Transient scheduling state is `#[serde(skip)]`. Pin it: a
  fixed seed must replay byte-identical (see `external_ai_protocol.rs`).

- **`serde_json` can't serialize a tuple-keyed map.** `relations` /
  `no_rematch` (`BTreeMap<(u32,u32), _>`) use the `pair_key_map` helper —
  without it `save()` *panics* the moment the map is non-empty (and a worker
  snapshot, or any save after a treaty, hits exactly that).

- **Node ids reindex to 0-based on load.** Map JSON `"id"` is 1-based;
  `WorldMap`/state index 0-based. Fixtures and `Loc::Node(_)` asserts use the
  0-based index, not the JSON id.

- **Ticks are game-minutes, and units move slowly.** `1 tick =
  MINUTES_PER_TICK` minutes; `TICKS_PER_DAY` and `BASE_TILES_PER_TICK` derive
  from it (foot ≈ 30 km/day, so a 5 km tile is *many* ticks). Reason in
  game-time, never guess tick counts. Scale game-world durations with
  `ticks_from_minutes`; leave real-time-anchored windows (`PREP_TICKS`) and the
  AI's tick cadence alone. Watch for hidden `/ 60` "ticks-per-hour" literals.

- **The host drives the AI, off the tick loop.** `sim::tick` runs only
  diplomacy. The brain is reached two ways: the worker via
  `Campaign::advance_external` (lockstep-with-fixed-delay: snapshot at T, apply
  at T+`AI_LATENCY`, so async never changes the outcome — only forces a wait),
  and `Campaign::drive_ai` synchronously for tests. To change *what the AI
  does*, edit `ai::`; never re-add an inline commander pass.

- **The AI is a client of the player order API.** It emits `ai::Order`s
  (`Move`/`Recruit`/`Build`/`Merge`) applied through the same functions a player
  uses. A new AI action is a new `Order` variant + `orders::apply` — it must be
  something a player could also do.

- **Lookahead runs on a clone.** `commander_decision` clones, rolls forward
  with `rollout::forward_plan` + `resolve::estimate`, scores with `eval`. Two
  traps: (1) seed the turn's randomness from `turn_rng` (snapshot rng ⊕ tick ⊕
  faction) — drawing from the clone's own rng freezes the dice whenever the
  world rng is static between turns; (2) `in_rollout` skips fog recompute and
  diplomacy, because rollout cost grows super-linearly with army count and fog
  recompute is the per-tick bottleneck. Gate expensive search (idle army +
  cadence).

- **The wasm/frontend boundary is thin.** Add a `Campaign` method in `lib.rs`,
  wrap it in `campaign_bind.rs`, then rebuild (`npm run build:wasm`) before the
  TS sees it. The campaign AI lives in `web/src/campaign/ai-worker.ts`; the host
  protocol is in `scene.ts::advance`.
