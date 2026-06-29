# Slice 04: Configurable Quick Battle

## Contract

Clicking Quick Battle opens a setup menu instead of immediately launching a
hard-coded scenario. The player chooses a map, configures both armies under a
shared gold budget and 20-unit cap, or applies a prebuilt army template for fast
play.

## API Seam

Create a quick-battle catalog module owned by the web app, with pure helpers
that tests can exercise without DOM. It consumes the frozen `BattleMapCatalogEntry`
contract from Slice 02 rather than redeclaring terrain metadata:

```ts
export const QUICK_BATTLE_GOLD = 15000;
export const QUICK_BATTLE_MAX_UNITS = 20;

export interface QuickBattleArmyTemplate {
  id: string;
  name: string;
  units: Array<{ classId: number; count: number }>;
}

export function validateQuickBattleArmy(army: QuickBattleUnitPick[]): QuickBattleValidation;
```

Recommended location: `web/src/battle/quickBattleCatalog.ts`.

Map list source: import or derive from the Slice 02 `BattleMapCatalogEntry`
module. Quick Battle may add UI selection state, but it must not own separate
edge-role, ground-cover, height, or wasm-map-id metadata.

The wasm/Rust seam needs one of these implementations:

- preferred: add `Game.start_custom_battle(map, team0ClassesJson,
  team1ClassesJson)` or a compact pointer-based equivalent that builds a
  `contract::BattleSetup` and uses the existing roster deployment path;
- acceptable first slice: call `Game.load_map(map)` plus repeated
  `spawn_class(...)` from JS using the same deployment rows as
  `sim::battle::deploy_roster`, then harden into Rust once the UI is proven.

## Human Review Surface

The first menu screen should keep Campaign, Quick Battle, Duel, and Field Manual
easy to scan. Clicking Quick Battle moves into a dedicated setup panel with:

- map choices as a compact selectable list/cards;
- map previews or labels that make the side-boundary style obvious, e.g. river
  and crags, wall and cliffs, coast and scrub;
- side A and side B army builders with gold spent, slots used, and validation;
- class rows sourced from `Game.class_specs()` so names/costs stay canonical;
- prebuilt armies that fill close to 20 slots and stay within 15,000 gold;
- Launch and Back controls.

Recommended prebuilt armies:

- Balanced Host: line infantry, spears, missiles, cav, one elite anchor.
- Cavalry Wing: fewer infantry, more shock cav and horse archers.
- Pike And Bow: phalanx/spear core, archers/skirmishers, light screen.
- Cheap Swarm: many light/peasant units plus a small serious core.

## Verification

- DOM/unit tests for army validation: over budget, over 20 slots, empty side,
  valid template, custom add/remove.
- Catalog tests for each map: west/east sealed, north/south open-fog,
  ground-cover style present, and no duplicate map ids.
- A drift test proves Quick Battle map options are derived from
  `BattleMapCatalogEntry` and do not carry a parallel map metadata table.
- `VERIFY_GPU=1 node scene.mjs menu-renderer-shell menu-renderer-shell-visual`
  covers entering setup, selecting a map, applying templates, launching, and
  returning to menu.
- Deep links remain supported: existing `?map=A|B` should still work, and a new
  quick-battle deep link can be added only if useful for scenes.

## Must Stay Green

- `#menu-1v1` duel modal remains available as a fast debug/play surface.
- Unsupported WebGPU still disables renderer launches and shows a blocking
  message.
- Campaign new/load buttons keep their current behavior.
- Restart Battle should restart the exact chosen map and army setup, not fall
  back to a default scenario.

## Feedback That Changes This Slice

If 15,000 gold feels too permissive in playtest, change only
`QUICK_BATTLE_GOLD` and template contents. The validation contract should not
need to change.
