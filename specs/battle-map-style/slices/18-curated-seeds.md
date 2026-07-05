# 18 — Curated seeds in the catalog

Hand-picked generated maps become first-class, named, pickable battle maps.

## Contract unlocked

Generated maps ship in the production quick-battle picker beside the hand
maps — the replace-over-time path is open.

## API seam

- A small curated table (in `genmap` or the catalog): `{ name, seed, recipe
  overrides }` → e.g. "Highland Vale", "Twin Lakes Reach". Each becomes a
  `BattleMapCatalogEntry`-equivalent flowing through the manifest path (slice
  06) — named entries are pinned seeds using the same machinery, never a
  parallel map kind.
- Menu: curated entries listed like hand maps; free-seed entry stays.

## Human can run

Pick "Highland Vale" from the menu and fight it. Verification scenes can
address curated maps by name.

## Verification

- Certificates + determinism goldens pinned per curated seed.
- One model-sheet-style beauty snap per curated map (vista camera), blessed.
- Menu picker scene updated; catalog contract tests
  (`edgeSealMismatches`) green per entry.

## Stays green

Hand maps and their catalog entries untouched; all standing gates.

## Precondition

Slice 17's verdict accepted by David (this is the one blocking checkpoint in
the spec).

## Landed (2026-07-05)

- Curated table: Shore & Crags (seed 1, water flank), Highland Vale
  (seed 7, the pinned cliff/cliff anchor), Wooded Pass (seed 8, forest
  flank). Entries are pinned seeds riding the existing manifest/
  generatedBattleMapEntry path - no parallel map kind; Quick Battle lists
  hand maps, then curated, then the free Generated row; curated launches
  read entry metadata from game.generated_map_manifest().
- Cargo pins all three curated seeds
  (curated_generated_maps_are_pinned_and_certified); scene
  battle-genmap-curated snaps one overcast-highland vista per entry +
  asserts name/seed/edge-role wiring.
- Orchestrator fix: the scene's edge-role check compared JSON.stringify
  across sources with different key order - equal content, guaranteed
  false. Key-order-insensitive comparison; recorded as a scene-writing
  trap.

## Feedback that would change it

Which seeds make the cut — David's pick from the slice-06 browser, recorded
here with a one-line character note per map.

## Landed (2026-07-05) — BMS18-SLICE-F7C3

Curated generated maps live in the battle map catalog presentation owner, but
launch as normal generated maps (`mapId = -1`, pinned `generatedSeed`) through
the existing manifest-to-entry helper:

| name | seed | why |
|---|---:|---|
| Shore & Crags | 1 | cliff/water composition; gives the picker a water-flank generated map |
| Highland Vale | 7 | pinned generated-map anchor; cliff/cliff vale used throughout prior gates |
| Wooded Pass | 8 | forest-belt flank with opposing cliff wall; distinct from water and pure cliff |

Quick Battle now lists the three curated generated entries after the hand maps
and before the free-seed Generated row. The free-seed row, input, reroll, and
Play path remain.

Verification landed:

- `cargo test -p sim --test genmap -- --nocapture` pins curated hashes and
  certificates:
  - seed 1 `0xe28cbaf0d2e6e796`
  - seed 7 `0x9053a4fa78867b91`
  - seed 8 `0x7055cdf3eac03c64`
- `web/scenes/battle/battle-genmap-curated.mjs` boots each curated seed through
  the production generated-map route, asserts catalog/manifest wiring
  (name, seed, edge roles), freezes the locked vista camera under
  overcast-highland, and owns one baseline per curated map.

ORCHESTRATOR-TODO: run/bless `battle-genmap-curated` with browser GPU and do the
non-blocking visual review/checkpoint. This sandbox did not bless browser shots.
