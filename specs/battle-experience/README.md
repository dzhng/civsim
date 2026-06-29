# Battle Experience

## Next Agent Prompt

Current status, last updated 2026-06-30: Slice 01 is SHIPPED. Reusable scenery
props now have shared ownership through a registry and a dedicated review scene;
slices 02-05 remain planned. David added a reference for edge cliffs, distant
fog, and full-field grass coverage; use
`specs/battle-experience/assets/edge-cliffs-grass-reference.png` as review
context alongside the Aegean battle references. The same reference should guide
gentle terrain depth variation: battlefields should not be 100% flat unless a
specific map calls for flat ground.

What Slice 01 shipped:

- `packages/game-renderer/src/models/shared/sceneryPropRegistry.ts` is the new
  shared seam: `SCENERY_PROP_MODELS` (id → builder + label + `defaultScale`
  hint) and `PROP_REVIEW_GROUPS` (the model-sheet compositions). Geometry still
  lives in `sceneryPropModels.ts`; the registry names it. `campaign/sceneryPass.ts`
  now builds its meshes via `SCENERY_PROP_MODELS`, so no surface re-declares the
  builder list. Slice 03 battle props should consume this registry (including
  `defaultScale`), not a new table.
- New scene `web/scenes/models/shared-prop-models.mjs` + route
  `routeSharedPropModelShots` (`/renderer/shared-prop-models`) capture
  `web/shots/models/shared/props/{trees,conifer,broadleaf,rocks,mountain,cart}.png`.
  The cart family is new review evidence. The scene also asserts the
  shared-ownership invariant by source check.
- `campaign-models` no longer reviews props: the `campaign/props/*` snapshots,
  gates, and the campaign prop baselines are gone (terrain-grass-scrub /
  terrain-stone-relief terrain samples still use scenery and stay).
- Scripts updated: `scenario:renderer` and `shots:models` run the new scene;
  cutover/release audits require `models/shared/props/*` instead of
  `models/campaign/props/*` and expect `parity-shared-prop-models`.

BASELINE PROVENANCE WARNING (read before re-running gates): this Mac has no
SwiftShader WebGPU adapter (the canonical headless baseline device per
`web/shots/README.md`), so the committed shared-prop baselines were captured on
the hardware/Metal adapter (`VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware
VERIFY_HEADFUL=1 VERIFY_BROWSER_CHANNEL=chrome`). They are deterministic there
(0px on re-run). When the canonical SwiftShader `scenario:renderer` runs in CI,
the stone-dense `mountain`/`rocks` sheets may exceed the 2% wobble budget and
need a one-time re-bless under SwiftShader — same situation as the pre-existing
`campaign/terrain/terrain-stone-relief` baseline, which already fails ~3.96% on
the hardware adapter (proven identical with pre-slice code, so not introduced
here). Re-bless prop sheets with `npm --prefix web run shots:models:props`.

Exact next pickup point: start
`specs/battle-experience/slices/02-battle-terrain-feature-contract.md`.

Active blockers or warnings: do not delete the duel bench unless David asks; it
is still the fastest matchup/debug surface. The quick-battle budget default in
this plan is 15,000 gold, not 10,000, because 10,000 makes a 20-slot balanced
army feel artificially cramped with the current unit costs. Treat 15,000 as the
implementation default unless David redirects.

Global TODO:

- [x] Slice 01: reusable scenery prop review moved to shared ownership
  (registry + `shared-prop-models` scene); shared prop model sheets committed.
- [ ] Slice 02: create a battle terrain-feature contract that turns sim terrain
  tints, micro roughness, and height variation into typed render features.
- [ ] Slice 03: render battle woods, rocks, mud/scree, and micro roughs with
  proper 3D/shared model cues, height-aware placement, and terrain baselines.
- [ ] Slice 04: replace static quick-battle buttons with a map picker, 15,000
  gold army builders for both sides, and prebuilt 20-slot armies.
- [ ] Slice 05: audit hard-coded `z: 0` placement shortcuts and write durable
  docs for the shared terrain/model helpers using the `write-docs` principles.

Before ending your pass, update this section with what shipped, what remains,
and the next exact pickup point.

## Goal

Make battles feel more like authored places and less like isolated sim test
fields:

- reusable campaign scenery such as trees and rocks belongs to shared model
  ownership, with model-sheet evidence that both battle and campaign can trust;
- battle terrain types communicate visually with proper 3D or model-backed cues,
  not only flat color/tint;
- battle map edges have readable world logic: west/east are visibly and
  mechanically sealed by impassable cliffs, mountains, ocean, or walls, while
  north/south read as open grassland/desert continuing into heavy distance fog;
- the whole playable field is covered by an appropriate ground material,
  usually sun-bleached green/yellow grass, with sandy/desert variants for desert
  maps rather than bare flat color;
- battlefields have authored gentle height variation, not random mountains in
  the middle of the fight. Flat parade-ground maps are allowed, but most maps
  should expose rolling rises, shallow dips, ridges, dunes, or banks inspired by
  the archived reference;
- quick battle becomes a real setup flow where the player picks a map and builds
  or loads two armies under the same 20-unit campaign cap.

## Recon Facts

- Shared scenery source already exists in
  `packages/game-renderer/src/models/shared/sceneryPropModels.ts`; campaign
  rendering imports it from `packages/game-renderer/src/campaign/sceneryPass.ts`.
- Reusable prop baselines are still owned as campaign shots:
  `web/shots/models/campaign/props/{trees,conifer,broadleaf,mountain,rocks}.png`.
  `web/shots/models/shared/props/README.md` exists but has no committed sheets.
- Battle terrain data starts in Rust maps:
  `crates/sim/src/maps.rs` paints tints for water, rock/wall, forest, mud, and
  rough/scree. The wasm boundary exposes `terrain_tint_ptr`,
  `terrain_speed_ptr`, and `terrain_rough_ptr` from `crates/game-wasm/src/lib.rs`.
- Current sim terrain stores speed, roughness, and tint in
  `crates/sim/src/terrain.rs`; a durable battle heightmap still needs to be
  added there or to the campaign-to-battle terrain contract.
- Campaign terrain already carries relief in `web/src/campaign/terrain.ts`
  through `TerrainField.height` and `heightAt`. The battle height work should
  generalize that sampler shape instead of creating a battle-only API that
  campaign cannot reuse.
- The campaign polish workbench can expose prop seating bugs too:
  `web/scenes/campaign/campaign-polish-markers.mjs` captures
  `polish-label-spacing` and `polish-green-swatch`, while the controlled
  `testStageScenery` path in `web/src/campaign/renderer.ts` currently authors
  fixture props with hard-coded `z: 0`. Height unification should make those
  fixtures sample the terrain height instead of sitting below raised terrain.
- Renderer-side soldier elevation is already a known path:
  `packages/crowd-runtime/src/instanceData.ts` accepts `terrainHeight`, and
  `web/scenes/system/battle-elevation.mjs` verifies soldiers sit on sampled
  terrain relief.
- Battle rendering currently converts terrain tints into painted quads and some
  billboard-like world props in
  `packages/game-renderer/src/battle/terrainPass.ts`. It does not instantiate
  the shared mesh prop library.
- The main menu Quick Battle section is static markup in `web/index.html`.
  `web/src/menu/scene.ts` wires `button[data-battle]` directly to
  `onQuickBattle(kind)`, and `web/src/main.ts` maps `mapA/mapB` to
  `Game.start_battle(0/1)`.
- Full campaign handoff already has a roster deployment path through
  `contract::BattleSetup`, `sim::runner::Battle::from_setup`, and
  `sim::battle::deploy_roster*`, but standalone quick battle currently bypasses
  it.
- Current quick battle maps are `MapId::RiverAndCrags` and
  `MapId::WalledPlain`. A third map should be added as part of this feature so
  the picker is not a two-button relabel.
- David's edge reference is archived at
  `specs/battle-experience/assets/edge-cliffs-grass-reference.png`: the desired
  side-edge language is large hazy cliffs/mountains, while open directions fade
  through fog over continuous grass.

## Scope Firewalls

- Do not rebalance unit costs as part of this feature. Quick battle consumes
  `contract::unit_cost` as-is.
- Do not change campaign strategic economy, recruitment, AI, diplomacy, or
  save-game semantics.
- Do not replace the battle physics or terrain mechanics while adding visual
  cues. If visuals reveal a mechanical bug, spin that into a separate
  `debug`/`tweak-mechanics` pass.
- Do not turn battle scenery into dense decoration. The aesthetic target is
  sparse, legible Mediterranean terrain: open fields stay open.
- Do not make side boundaries look open if the sim treats them as sealed. The
  visible terrain boundary and movement/pathing boundary must agree.
- Do not make central terrain relief extreme. Mid-map height variation should be
  tactically readable and useful for asset placement, not a mountain range in
  the playable lane.
- Do not implement vision blocking, line of sight, projectile trajectory
  changes, or high-ground combat bonuses in this feature. The heightmap should
  be shaped so those systems can consume it later.
- Do not hard-code the heightmap abstraction to battle. Battle maps can use
  meter-scale relief and campaign can keep its broader visual scale, but the
  storage/sampling contract should be shared enough for both surfaces.
- Do not make renderer TS the source of truth for terrain that sim, campaign,
  vision, or projectile code must later consume. Canonical battle height data
  belongs in the terrain data contract; renderer code samples it.
- Do not let Slice 04 invent map metadata. It consumes the frozen map catalog
  produced by Slice 02/03.

## Slice Graph

1. Shared scenery model sheets: move reusable prop review ownership before battle
   starts consuming those models.
2. Battle terrain-feature contract: give renderer code a typed seam for forests,
   mud, rocks, micro roughs, water, and impassables.
3. Battle 3D terrain props: draw shared trees/rocks plus rough-ground cues from
   the contract and prove them with scenes/model sheets.
4. Configurable quick battle: expose the map/army builder once the maps have
   meaningful visual differences.
5. Docs and height-seating audit: make the shared helper ownership legible and
   prove prop placement no longer depends on fixture-local `z: 0` shortcuts.

## Review Map

- Static prop review:
  `VERIFY_GPU=1 UPDATE_SHOTS=1 node scene.mjs shared-prop-models` from `web/`
  after slice 01 adds the shared prop scene.
- Battle terrain visual review:
  `VERIFY_GPU=1 node scene.mjs battle-terrain-features` from `web/` after
  slices 02-03.
- Menu flow review:
  `VERIFY_GPU=1 node scene.mjs menu-renderer-shell menu-renderer-shell-visual`
  from `web/` after slice 04 updates the quick-battle flow.
- Height-seating audit:
  source-only `rg` checks after slice 05 classify `z: 0` hits. Acceptable hits
  are label/camera anchor comments, coordinate-system docs, deliberate flat-map
  declarations, or non-placement math. Prop/entity/scenery placement must sample
  terrain height.
- Docs review:
  docs added in slice 05 explain ownership principles and point to registries;
  they do not copy scene lists, helper inventories, map tables, or command
  matrices that the code already owns.
- Rust contract review:
  targeted `cargo test` for any new map catalog, roster setup, or terrain
  contract tests.

## Contracts

- Shared prop models live in `packages/game-renderer/src/models/shared/` and
  produce baselines under `web/shots/models/shared/props/`.
- Battle terrain feature extraction is a pure, deterministic module: same
  canonical terrain data plus same seed produces the same feature instances.
- Battle maps are described by one `BattleMapCatalog` contract after Slice 02:
  terrain grid id, edge roles, ground cover, height availability, presentation
  labels, and wasm/Rust map id. UI code consumes this catalog; it does not
  redeclare map traits.
- Every battle map declares edge roles. West/east must be impassable and visible
  as cliffs, mountains, ocean, walls, or equivalent blockers. North/south must
  remain visually open and dissolve into distance fog.
- Every battle map declares a ground-cover style, such as green grass, yellow
  grass, scrub grass, or sand/desert. The renderer treats this as full-field
  coverage before adding local terrain features.
- Heightmaps use a shared terrain-surface contract, not a battle-only type.
  Battle soldiers, shadows, terrain props, campaign scenery, roads, labels, and
  future projectiles/vision should be able to sample through the same small
  API shape even when each surface uses different scale/generation rules.
- Campaign polish scenes are part of the acceptance surface for this shared
  height contract: props in `polish-label-spacing` and `polish-green-swatch`
  must sit on the terrain, not sink through it.
- Every battle map carries a heightmap or deterministic height sampler. Soldiers,
  shadows, and terrain props must sample the shared ground height source so
  units walk uphill and assets do not clip through the terrain.
- Prop, entity, and scenery placement must not use local `z: 0` as a seating
  shortcut. Zero-height literals are acceptable only for documented camera/label
  anchors, coordinate-system explanations, non-placement math, or maps explicitly
  declared intentionally flat.
- For this feature, battle height affects rendered elevation and asset seating,
  plus any existing movement/pathing code that already samples terrain speed or
  roughness. It must not silently add high-ground combat, vision blocking, or
  projectile trajectory behavior.
- West/east impassability is owned mechanically by the terrain speed/pathing
  masks and map bounds, not by visuals. Horizon cliffs/ocean/walls are
  presentation of that existing blocker data.
- Height variation should be gentle over the playable center: enough rolling
  depth to make the field interesting and place assets naturally, but not
  impassable unless the terrain speed/edge role also says it is impassable.
- Quick battle setup data is serializable and testable without DOM: maps,
  budgets, prebuilt armies, and roster validation live in a catalog module.
- The menu remains keyboard-usable and WebGPU-gated; unsupported WebGPU must
  block launching battles while still allowing non-renderer surfaces like the
  manual.
- Final docs follow `write-docs`: one home per fact, source registries own exact
  rosters/lists, and documentation names why each shared helper exists plus what
  kind of code belongs there.

## Known Unknowns

- The exact third map theme should be picked during slice 02. Recommended:
  `CoastalScrub`, with one sealed ocean side, one cliff side, dry olive/yellow
  grass over the field, a few rocky outcrops, and one mud/rough lowland lane.
- If the existing 2D battle terrain quads still carry some cues after slice 03,
  that is acceptable. The goal is visible 3D/model-backed landmarks for terrain
  identity, not deleting all shader material.
