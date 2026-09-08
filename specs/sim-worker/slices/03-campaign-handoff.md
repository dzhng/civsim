# Slice 03 — Campaign handoff as serde JSON

## Contract unlocked

The two games meet only through `contract::BattleSetup` and
`contract::BattleResult` as JSON; no `Game` crosses the campaign boundary,
so the battle can live in any thread. Still in-process.

## API seam (Rust, `crates/game-wasm/src/campaign_bind.rs` and `lib.rs`)

- `Campaign::battle_setup_json(&mut self, encounter) -> Option<String>`:
  the `battle_setup(encounter)` call plus the `fighting = Some(eid)`
  bookkeeping from today's `start_campaign_battle`, serialised as an
  envelope `{ setup: BattleSetup, ai_teams: [bool; 2], terrain_source }`.
  The AI mask is decided here because it needs the campaign (whether the
  player's army is in the encounter). Preparation is a mutation (setup
  generation commits reinforcements): never retried automatically.
- `Game::from_campaign_setup_json(json: &str) -> Game`: `Battle::from_setup`
  with the same `campaign::units::UnitOption` modifier closure and
  `class_stats`, both already dependencies of `game-wasm`, then `set_ai`
  from the mask, then `Game::from_battle_with_terrain_source`.
- `Game::battle_result_json(&self) -> String` and
  `Campaign::report_battle_json(&mut self, json)`.
- `start_campaign_battle` and `report_battle` are deleted in this slice.
- `class_specs_json()` as a free function so no caller needs a probe `Game`.
- TS: `sim/simRecipe.ts` — `SimRecipe` union (`duel`, `sandbox`, `map`,
  `generated`, `custom`, `campaign {setupJson}`); the `createGame` /
  `createQuickBattleGame` bodies in `main.ts` become recipe builders and the
  in-process adapter constructs the `Game` from a recipe (this is exactly
  what the worker will do in 04). `campaign/scene.ts` `fight` builds the
  campaign recipe; `onBattle(recipe, done)`; `done` receives the result JSON
  from `sim.campaign.result()` and calls `report_battle_json`. Auto-resolve
  uses the same recipe with `ai_teams: [true, true]` and `sim.advance` in
  300-tick chunks feeding the existing progress modal, keeping the
  21,600-tick cap and the forced-result policy. JS carries the JSON opaquely
  and never round-trips `u64` ids through `number`.

## What the human runs and sees

`?campaign=handoff`: fight, receive reinforcements, exit early, return;
auto-resolve to victory and to the cap. Casualties write back as before.

## Verification

- `cargo test --workspace` plus a round-trip test: `battle_setup_json` →
  `from_campaign_setup_json` → 600 ticks → `state_hash` equals the
  in-process construction path for three encounters from the handoff
  fixture (player attacker, defender, uninvolved; regular and modified
  classes; arrived and unarrived reinforcements; a forced result). This test
  is the last run of the deleted functions; then they go.
- `bun run --cwd web verify:campaign` and the campaign handoff /
  reinforcements / save-load / conquest scenes, zero re-bless.

## Delegated to the implementer

Envelope field names; Rust helper names; chunk size for auto-resolve
progress (cap the progress report at 5 Hz).

## Must stay green

01 and 02; class modifier behaviour, team assignment, terrain source and
forced-result behaviour (today all in one function in `campaign_bind.rs`).

## KILL

`state_hash` differs between old and new handoff for any fixture (setup
serialisation lost information — fix, never re-pin); serialise +
deserialise of the largest campaign battle (30 units a side) over 10 ms;
Rust delta over 120 lines.
