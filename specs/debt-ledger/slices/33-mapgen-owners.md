# 33 — mapgen-owners

**Contract unlocked:** mapgen is a library with a thin binary; its helpers,
wire schema, and graph traversal have one owner each; shipped one-shot
migrations are gone. The committed map does not change.

## Items

- `crates/mapgen/src/lib.rs` + thin `main.rs`; tests out of `main.rs`
  (172-566, 70 % of the file; the 294-line test split per invariant).
- Wire schema: `contract::mapjson::{Node, Edge, Faction}` (serde) replacing
  `build.rs:63-100 NodeJson`, `campaign/mapdata.rs:147-205 RawNode`, the
  fixture at `mapgen/main.rs:177-205`, `probe.rs:45-55`. Round-trip seam test
  in `contract`. `TILE_KM` (`tunables.rs:40` / `build.rs:9`) becomes one
  `contract` constant.
- Helpers: `load_committed_map(dir)` (5 copies: `connectivity.rs:265, 662,
  746`, `landroute.rs:71, 910`); `geo::point_segment_dist` (`build.rs:113-122
  seg_dist` ≡ `landroute.rs:880-889`); `Raster::is_land_at` (4 copies:
  `raster.rs:167`, `probe.rs:95-100`, `landroute.rs:656`, `main.rs:512/549`);
  one `components()` BFS (`connectivity.rs:492-576, 898-947`;
  `campaign/tests/connectivity_islands.rs:49-73` consumes it via the lib);
  one stub pruner (of `prune-cities.mjs`, `build.rs:582-648`,
  `connectivity.rs:366-410`) — keep the Rust one, delete the `.mjs` if the
  bake no longer calls it.
- Delete: `connect_black_sea_rim_committed` (`connectivity.rs:262-271`, a
  shipped migration), the `debraid` subcommand arm that duplicates the
  pipeline call (`main.rs:32-36` vs `:156`), `print_report` +
  `off_main_city_component_sizes` + `nearest_main_node_on_landmass`
  (727-947, referenced only by a closed spec), the `("Olisipo", "x")`
  placeholder (`landroute.rs:32`).
- Split `connectivity.rs` (gazetteer 10-261 / descope 283-443 / labelling
  445-576 / reconnect 577-741) and `landroute.rs` (measure 10-661 / JSON
  663-777 / debraid 779-1078) into files named by those responsibilities.

## Decisions resolved here

The committed `web/public/data/campaign-map.json` is the fixture for both
mapgen and four campaign tests; a re-bake must be byte-identical.

## Delegated to the implementer

File names; whether the gazetteer lists (`STRAIT_CARVES`,
`BLACK_SEA_COAST_ROUTES`, `CITY_SNAP_EXEMPTIONS`) get one `gazetteer.rs`
(recommended — they are data scattered across four files).

## Verification

- `cargo test --workspace`; `connectivity_islands.rs`; slice 28 golden
  unchanged.
- Re-run the bake: `git diff --exit-code web/public/data` empty.

## Must stay green

The committed map; campaign golden.

## Feedback that would change this slice

None.
