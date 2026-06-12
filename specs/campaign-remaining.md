# Spec: Remaining Campaign Work

Handover spec for the campaign layer's unfinished items. The campaign is
playable end-to-end (menu → campaign → battles → outcomes → save/load); this
covers what was deliberately deferred. Read this whole file before starting —
the Conventions section is binding.

## Orientation

Repo: `/Users/david/dev/game`, branch `main`. The campaign work merged at
`75ad3fe`. Architecture (do not violate):

- `crates/contract` — the ONLY shared vocabulary between campaign and battle
  (`UnitClassId`, `Pcg32`, `TerrainSpec`, `BattleSetup`/`BattleResult`).
- `crates/campaign` — pure campaign logic. Depends only on `contract`. Never
  on `sim`. Modules: `state` (serde'd dynamic state), `mapdata` (static
  topology from JSON), `sim` (tick pipeline), `pathfind`, `economy`,
  `resolve` (battle handoff/outcome), `battlegen` (locale → TerrainSpec),
  `ai`, `visibility`, `tunables` (ALL numbers live here — data, not code).
- `crates/sim` — the battle sim. Depends only on `contract`. `runner.rs`
  (`Battle`) is the campaign-facing wrapper.
- `crates/game-wasm` — composition root; the single place both games meet.
  `lib.rs` = `Game` (battle), `campaign_bind.rs` = `Campaign` + handoff fns.
- `crates/mapgen` — offline map pipeline (`cargo run -p mapgen --release`),
  ORBIS + Natural Earth + `overrides.json` → `web/public/data/campaign-map.json`
  + `campaign-bg.png`. Source data: `crates/mapgen/data/fetch.sh`.
- `web/src` — `main.ts` (scene dispatcher) → `menu/`, `battle/`, `campaign/`
  scenes. Campaign renders WebGL2 terrain (`campaign/terrain3d.ts`) under a
  transparent Canvas2D marker overlay; battle with WebGL.

Build/verify:

```sh
cargo test --workspace                      # 21 suites, all green at handover
npm --prefix web run build:wasm             # wasm-pack → web/src/wasm/game_wasm.js
npx --prefix web tsc --noEmit -p web
npm --prefix web run dev                    # then:
node web/verify.mjs           # battle harness (needs dev server)
node web/verify-campaign.mjs  # campaign harness
```

Both harnesses include exact pixel-regression snapshots (`web/snapshot.mjs`)
against baselines in `web/shots/baseline/` — any UI-affecting change fails
with a diff image in `web/shots/diff/`. After an *intentional* visual change,
re-bless with `UPDATE_SHOTS=1 node web/verify*.mjs` and commit the new
baselines. New snapshots must capture deterministic moments only: fixed
camera, sim paused (battle: `window.__game.freeze()` pins the shader clock
and HUD perf line), nothing seed- or wall-clock-dependent on screen.

Time model: 1 campaign tick = 1 minute; day = 1440 ticks; 1 road tile = 5 km;
battle ticks are 1/30 s. Campaign↔battle unit identity:
`unit_id = (army_id << 8) | roster_entry_index` (see `resolve.rs`).

---

## Package A — Correctness gaps (do these first)

### A1. BattleScene must survive mid-battle reinforcements  ★ highest priority

`sim::runner::Battle::tick` spawns scheduled reinforcement units mid-battle
(campaign battles only). The battle frontend assumes fixed counts:

- `web/src/battle/scene.ts:96` — `renderer.setStatic(soldierUnit, teams,
  classes, radii)` is called once in `enter()`.
- `web/src/battle/scene.ts:170-186` — `labelDivs` is built once per unit.

**Required**: each frame, compare `game.unit_count()` / `game.soldier_count()`
against the values captured at setup. On growth, re-read the static arrays
(soldier_unit/teams/classes/radii pointers — re-fetch, memory may have grown)
and call `setStatic` again; append label divs for the new units. Soldier
positions/facings/alive already re-fetch per frame, so only the static data
and DOM need rebuilding.

**Accept**: a campaign battle whose setup includes a reinforcement with
`delay_secs ≤ 60` shows the arriving column rendered and labeled. Add a check
to `verify-campaign.mjs`: script two friendly armies one tile apart, march the
pair into an enemy, Fight (not auto-resolve), assert
`game.unit_count()` grows during the battle and no page errors. (Drive the
battle with the existing `window.__game` debug API; see `verify.mjs` for the
fast-forward pattern.)

### A2. Chase re-targeting during encounters

The design says "attacker chases, path continuously re-targeted." Today the
attacker keeps its original path, which only coincidentally follows a fleeing
defender. Symptom: defender side-steps onto another edge and the encounter
dissolves even though the attacker is faster.

**Required**: in `crates/campaign/src/sim.rs::encounters`, while an encounter
is `Preparing` and the defender is marching, re-plan the attacker's path to
the defender's current loc each time the defender changes tile (cheap: only
when `def.loc` differs from the attacker's path tail target). Respect the
existing rules: only if the attacker is itself marching toward the defender
(don't hijack a player order to disengage — track whether the attacker's
current order *was* the chase: simplest is to only re-target when the
attacker's final path element is within 2 tiles of the defender).

**Accept**: a unit test where the defender flees around a junction corner and
an equal-speed attacker still catches it (battle initiates); the existing
`faster_army_escapes_slower_chaser` test still passes.

### A3. Expose `order_split` through wasm + minimal merge/split UI

`campaign::Campaign::order_split` exists; `crates/game-wasm/src/campaign_bind.rs`
does NOT bind it (merge and disband are bound).

**Required**: add `order_split(army, entries_bitmask: u32) -> bool` to
`campaign_bind.rs` (bitmask over roster indices is fine — rosters are ≤ a
dozen entries). In `web/src/campaign/scene.ts`'s army panel: per-entry
checkbox + "Split" button; "Merge" button enabled when another own army is
selected-adjacent (call `order_merge`). Keep the UI minimal — match the
existing terse panel style.

**Accept**: in-browser: split two entries off an army, see the new banner on
an adjacent tile; merge it back. Add one verify-campaign check via the
`window.__campaign` hook.

### A4. Campaign-battle UI hygiene

- In a campaign battle, the in-battle relaunch buttons (1v1/5v5/Map A/Map B/
  charge sandboxes/Restart) still render even though `onLaunch` is a no-op
  (`web/src/main.ts`, campaign `onBattle` wiring). Hide them when the battle
  came from the campaign (pass a `campaign: true` flag in BattleScene config).
- After a manual campaign battle ends, the only path back is Exit. Add a
  "Continue" button that appears once `game.victor() >= 0`, doing the same
  thing as Exit (label matters: the player won, "Exit" reads like quitting).

**Accept**: manual campaign battle shows no sandbox buttons; Continue appears
on verdict; quick battles unchanged (verify.mjs still 22/22).

---

## Package B — M6 depth systems

All numbers go in `crates/campaign/src/tunables.rs`. All new dynamic state
goes in `CampaignState` (serde, BTree collections only — HashMap iteration
order breaks determinism). Every system gets a native test in
`crates/campaign/src/lib.rs::tests` (look at the existing 15 for style: build
on `test_map()`, use `inert()` to disable AI unless testing AI).

### B1. Camp stance (mostly unimplemented — only the enum variant exists)

`Stance::Camp { build_ticks_left }` exists in `state.rs`; movement skips
camped armies. Nothing else is implemented: no order, no effects.

**Required**:
1. `order_camp(army)` in `campaign::Campaign` + wasm bind + army-panel button.
   Valid while halted, not in an encounter, not at sea. Sets
   `Camp { build_ticks_left: CAMP_BUILD_TICKS }` (add tunable, 60 = 1 h).
   Countdown in `sim.rs::timers` (pattern: ambush settle). Any move order
   breaks camp (already handled by `try_move` setting stance to March).
2. Effects once dug in (`build_ticks_left == 0`):
   - **Prep asymmetry**: in `sim.rs::encounters` (new-contact block), if the
     defender-to-be is camped: `prep_defender = 0`,
     `prep_attacker = PREP_SURPRISED_TICKS` (40). The camped side is always
     the defender regardless of ids.
   - **Ambush immunity**: `ambush_triggers` skips camped victims (they're
     halted anyway — make it explicit with a guard + comment).
   - **Vision +2 tiles**: in `visibility.rs::recompute`, a camped army's
     detection radius is `VISION_ARMY + 2`.
   - Deployment: camped armies are halted ⇒ `column: false` falls out of the
     existing `marching()` check; verify with a test, don't add code.
3. Render: tent glyph next to the banner (campaign renderer), pie while
   digging in (pie_kind 2 is already plumbed for camp in `campaign_bind.rs` —
   check the stance mapping there and keep it consistent).

**Accept**: tests — camped defender gives attacker 40-tick prep; camp breaks
on move; ambush spot doesn't trigger on a camped army standing on it.

### B2. Road upgrades

**Required**:
1. State: `road_levels: Vec<u8>` (per edge, init 1) and
   `road_jobs: BTreeMap<EdgeId, RoadJob { to_level, ticks_left }>` in
   `CampaignState` (`#[serde(default)]` for save compat).
2. Tunables: speed mult per level `[1.0, 1.0, 1.3, 1.6]` (index by level),
   cost = `15 gold × tile_count` per level step, build time =
   `120 ticks × tile_count`. Levels 1–3.
3. `order_upgrade_road(edge) -> bool`: edge must be a road (not sea), next
   level ≤ 3, no job running, **either endpoint node owned by the ordering
   faction** (city owner; junctions count as owned if the nearest city within
   8 tiles is owned — reuse `economy::territory_of`). Pay up front. Job
   countdown in the economy day/`timers` phase; on completion bump
   `road_levels[edge]`.
4. Apply the multiplier in `sim.rs::army_base_speed` (land branch) AND in
   `pathfind::edge_cost`/`tile_cost` so routing prefers good roads. Note:
   pathfind currently takes `&WorldMap` only — thread `&CampaignState` (or
   just `&[u8]` road levels) through `plan`/`edge_cost`. `Campaign::order_move`,
   `ai.rs`, and `resolve.rs` call sites update mechanically.
5. Wasm + UI: clicking near a road (reuse `nearestLoc`) opens a small edge
   panel: level, upgrade button + cost. Render levels: line width/brightness
   step per level in `campaign/renderer.ts`.
6. AI: in `ai.rs` spend step, if treasury > 600 after recruiting, upgrade the
   edge adjacent to its capital with the lowest level (simple heuristic; the
   "busiest corridor" version is a stretch goal).

**Accept**: tests — upgraded edge marches faster (tick-count comparison);
routing prefers an upgraded parallel route; save/load round-trips road state.

### B3. Outposts

No outpost code exists anywhere (state, visibility, mapgen). Design intent:
cheap watchtowers that extend vision and unmask ambushers — the counter-play
to ambush stance.

**Required**:
1. Buildable on any **junction** node in friendly territory
   (`economy::territory_of(loc) == faction`), one per node. Cost 150 gold,
   build 720 ticks (12 h). State:
   `outposts: BTreeMap<NodeId, Outpost { owner, build_ticks_left }>`
   (`#[serde(default)]`).
2. Effects (built only): vision source in `visibility.rs` with radius 6
   (pattern: the city branch), and concealed ambushers within 2 tiles of an
   enemy outpost are visible (extend the concealed branch).
3. Capture/destruction: an enemy army halting on the node for 240 ticks razes
   it (simplest: reuse the `Occupying` pattern, or just destroy instantly on
   enemy halt — pick one, document it in the tunables comment).
4. Wasm + UI: junction click → "Build outpost" button when valid; render a
   small tower glyph; show owner color.
5. AI (cheap version): skip — note it as out of scope.

**Accept**: tests — outpost reveals a concealed ambusher at 2 tiles where
nothing else does; enemy halt removes/captures it; save/load round-trip.

### B4. City buildings

`CityState.market_lvl` / `barracks_lvl` are read everywhere (income mult,
recruit speed, garrison establishment in `economy::garrison_establishment`)
but nothing can raise them.

**Required**: `order_build(node, kind: Market|Barracks) -> bool` — owned city,
level < 2, one build job per city (`build_job: Option<BuildJob>` on
`CityState`, `#[serde(default)]`). Costs/times in tunables (suggest: market
200/300 gold for L1/L2, barracks 250/400, both 2880 ticks = 2 days; balance
in B6). Completion in `economy::day_tick` (pattern: recruit queue). Wasm + UI
in the existing city panel. AI: in the spend step, if treasury > 800, build
market at its richest city.

**Accept**: tests — built market raises next day's income; barracks shortens
recruit job; build job blocked while another runs.

### B5. Ambush UI (backend done, no affordance)

`order_ambush` is bound through wasm already. Missing is discoverability:

1. Render ambush spots (`data.map.ambush_spots`) as faint glyphs when one of
   your armies is selected AND within ~2 tiles of the spot (don't litter the
   map; 4.6k spots exist).
2. Army panel: "Ambush" button enabled when `army.loc` equals a spot's
   trigger tile (the wasm side validates anyway — mirror the check client-side
   for button state). Show "settling…" (pie_kind 4 already plumbed) then
   "hidden" state (stance code 3; renderer already dims the banner).

**Accept**: in-browser: park an army on a forest tile, click Ambush, see
settle pie then dimmed banner; enemy army walking the trigger tile springs
the battle modal flagged "AMBUSH!" (modal already handles it).

### B6. Balance pass (do last; keep it small)

Playtest loop: `npm run dev`, new campaign at 10× speed, watch 30 campaign
days. Tune in `tunables.rs` / `overrides.json` only — no mechanics changes.
Things known to be untuned guesses: recruit costs vs. tier income, garrison
regen 2%/day, AI attack threshold (1.3×) and recruit batch sizes, march
speeds at sea (120 km/day), reinforcement radius 12 tiles. Targets: an AI
faction should take its first independent city within ~15 days; the player
shouldn't be able to steamroll three cities with the starting army; broke
factions should recover, not death-spiral. Record what you changed and why in
the commit message.

---

## Package C — polish backlog (optional, lower priority)

- Fog rendering: fogged enemy armies are simply absent; consider a subtle
  vision-range tint so the player understands *why* (visibility sets exist
  per faction in `state.visible`; only the player's set crosses the wasm
  boundary today — keeping it that way is fine for a pure-visual treatment).
- Road visibility: roads are hard to see at low zoom over the parchment
  raster; consider drawing them brighter or only above a zoom threshold.
- Sea-lane UX: embarking is implicit when a route crosses a port; show a
  boat glyph on `AtSea` armies (stance 6) and the embark pie (kind 3 —
  plumbed, unstyled).
- Battle-victory toast in campaign after auto-resolve (today the modal just
  closes; the casualties are only visible in army panels).
- `web/src/campaign/scene.ts::playerFaction()` is hardcoded to 0; route it
  from `Campaign` (add a `player_faction()` getter to the wasm bind) before
  any faction-select feature.

## Conventions (binding)

- Determinism: campaign state uses BTree collections; armies processed in id
  order; all randomness through `state.rng` (`Pcg32`); never wall-clock.
  `save_load_roundtrip_is_deterministic` must stay green — extend it when you
  add state (it catches missed serde defaults).
- New state fields take `#[serde(default)]` so existing saves load.
- Numbers in `tunables.rs` with a one-line comment each; mechanics never
  special-case a class/faction — express differences as data.
- Campaign must not import `sim`; sim must not import `campaign`. New shared
  types go in `contract` only if both genuinely need them.
- Tests: native, fast, in `campaign/src/lib.rs::tests` on `test_map()`. Use
  `inert()` unless testing AI. Browser checks go in `verify-campaign.mjs`
  (playwright; drive via `window.__campaign` / `window.__game` hooks).
- Before claiming done: `cargo test --workspace` (21+ suites green),
  `tsc --noEmit`, `npm run build`, both verify harnesses against a dev
  server. Commit per system (B1, B2… separately), message style: terse
  subject + what/why body, ending with the Co-Authored-By line used in
  recent history (`git log`).

## Suggested order

A1 → A3 → A4 → B1 → B2 → B3 → B4 → B5 → A2 → B6 → C as time allows.
A1 first because manual campaign battles are silently wrong without it; A2 is
parked late because the current behavior is conservative (encounters dissolve)
rather than broken.
