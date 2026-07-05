# Campaign Map Connectivity

Give the campaign map ONE coherent connectivity model. After the sea-route
descope, the map must be a single graph: every surviving city reachable from
every other over **roads + exactly three named sea lanes**, with no isolated
islands and no fake land bridges across the straits the lanes cross.

## The model (definition of done)

- **Exactly 3 sea lanes**, each joining two CITIES (never a junction / mid-water):
  1. **Gibraltar** — Gades ↔ Tingi
  2. **Bosphorus** — Constantinopolis ↔ Nicomedia
  3. **Sicily** — Vibo Valentia ↔ Messana *(new; replaces the Messana–Vibo road
     ferry. Rhegium is absent from the committed map, so Vibo Valentia is the
     measured-available mainland port — David confirms the endpoint.)*
- **One connected component** over roads + the 3 lanes: BFS from any city
  reaches every city.
- **Reconnect**, don't delete, the ~24 mainland cities that only lost their sea
  link (Malaca→Corduba, Prusias→Nicaea, Sinope→Tabia, Sicily's own towns→Messana,
  …): add a road along a real **land path** (`astar_land_path` on the carved
  raster), never a straight line.
- **Delete** every city that still can't be reached: Britain (14 cities),
  Cyprus, Crete, Sardinia, Corsica, Rhodes, Balearics, the Aegean islets, Crimea,
  the Black-Sea outliers, Sestus, … (~47, minus whatever Sicily reconnects).
  David's ruling: keep ONLY Sicily among the islands.
- **The straits are water.** The Bosphorus/Marmara is currently painted LAND
  (20/21 samples between Constantinopolis and Nicomedia) — so the cities are
  walkable-across and the lane crosses land. Every strait a lane crosses must
  read as water through the one land-truth owner.
- **Sea lanes render solid and on top of the water** — not faint dashes buried
  under the surface mesh.

## Next Agent Prompt

**Status (2026-07-05):** Spec just materialized from three synthesized drafts.
Nothing built yet. Pick up at **Slice 0**.

**Build order:** S0 → S1 → S2 → S5 on the bake spine (serial); **S3 (render) runs
in parallel** from S0 and is re-verified in S4. S4 gates the whole; S5 closes.

1. **S0 — model consts + RED invariants** (`slices/00-invariant-harness.md`):
   `SEA_LANES` (connectivity.rs) + `STRAIT_CARVES` scaffold (raster.rs), and the
   full invariant roster written as *failing* assertions in
   `baked_campaign_map_satisfies_mapgen_invariants`. The failing messages ARE
   the contract each later slice flips green.
2. **S1 — strait carve** (`slices/01-strait-carve.md`): `raster::carve_straits`
   after `paint()`, before `build()`; width ≥16 km (see invariant below).
3. **S2 — connectivity owner** (`slices/02-connectivity-owner.md`):
   `connectivity.rs` after dequalify, before landroute; replaces
   `descope-sea-lanes.mjs`, retires `SEA_ONLY_CITIES`.
4. **S3 — render fix** (`slices/03-render-fix.md`): sea lanes → `xyz` height-
   lifted, solid. Parallel; re-verified in S4.
5. **S4 — verification** (`slices/04-verification.md`): lane scenes +
   screenshot-critique + find-map-bugs.
6. **S5 — consolidation + close** (`slices/05-close.md`).

**Update this section before ending your pass.**

### Global TODO
- [ ] **S0** `SEA_LANES` + `STRAIT_CARVES` consts; RED invariant harness
- [ ] **S1** `raster::carve_straits` — straits become water (Bosphorus 20/21-land → water)
- [ ] **S2** `connectivity.rs` — compute set, reconnect by land A*, delete rest; retire descope.mjs + SEA_ONLY_CITIES
- [ ] **S3** sea-lane render — `xyz` z-lift + solid (no dashes)
- [ ] **S4** lane scenes + screenshot-critique + find-map-bugs sweep
- [ ] **S5** refactor-clean, double-bake determinism, close-spec

## Single-owner invariants (firewalls every slice inherits)

1. **`SEA_LANES` owns lane identity.** The 3 city-to-city lanes are named in ONE
   const; the keep-list, the carve corridors, and the cargo invariant all read
   it. No other file names a lane. (Retires the JS `KEEP` array.)
2. **`raster::carve_straits` owns "strait → water".** A strait becomes water
   ONLY by painting `RenderMaskClass::Sea` into the raster — never a frontend
   hack. `web/src/campaign/terrain.ts` reads the same committed PNG.
3. **`connectivity.rs` owns the connected graph.** One deterministic step
   computes the reachable set, adds reconnect roads (land A*), deletes the rest,
   and rewires ALL references (edges, ambush `edge`, `factions[].capital/.cities`,
   `start_armies[].at`). It retires `descope-sea-lanes.mjs`, the `SEA_ONLY_CITIES`
   const, `validate_sea_only_cities`, and the `island_cities`/`stranded` exemption.
   The "intentionally isolated island" concept ceases to exist.
4. **`main.rs` invariant test owns the definition of done.** It re-reads the
   committed artifacts through the raster/probe owners (no re-derivation) and
   asserts the model below.
5. **Carve width ≥ 16 km.** The frontend downsamples the bg to an **8 km grid**
   (`terrain.ts` cell = 8, one bg pixel per cell). A strait carve must be ≥ 2×
   that so the downsampled frontend mask also reads water — a narrower carve is
   invisible to the frontend and to city-snap's neighborhood test.

## The pinned invariants (S0 writes them RED; S1–S3 flip them green)

- **LANE-COUNT / CITY-TO-CITY** — exactly 3 sea edges; unordered endpoint-name
  set == `SEA_LANES`; both endpoints `kind=="city"`.
- **CONNECTED** — roads + 3 lanes form ONE component covering every city.
- **NO-ISLANDS** — zero degree-0 cities; `SEA_ONLY_CITIES` gone. Only a lane
  endpoint may lack a road.
- **STRAIT-WATER** — each lane's endpoint-to-endpoint segment sampled through the
  rehydrated raster has ~zero longest land run (endpoints NOT land-connected);
  no road edge crosses a strait corridor.
- **LAND-DISCONNECTION** — the road-only graph has exactly `#lanes + 1`
  components (a tree of landmasses stitched by the 3 lanes).
- **REFERENTIAL INTEGRITY** — every faction capital/city and army `at` resolves
  to a surviving node (leagues firewall).
- **BAKE DETERMINISM** — a double bake yields byte-identical `campaign-map.json`
  + `campaign-bg.png`; committed probe == regenerated probe.

## Firewalls
- **Bake determinism** — carve/reconnect/delete are pure functions of source +
  consts; sorted iteration, no RNG.
- **Never hand-edit `campaign-map.json` / `campaign-bg.png`** — bake artifacts.
- **Battle untouched** — no `crates/sim`, battle scenes, or battle render passes.
- **One land-truth owner** — a strait is water only via `raster::carve_straits`.
- **Every visual slice** runs [screenshot-critique](../../.claude/skills/screenshot-critique/SKILL.md)
  as its last check, and [compare-screenshots](../../.claude/skills/compare-screenshots/SKILL.md)
  against David's before shots for the lanes.

## Ordering decisions (where the drafts split)
- **Carve after `paint()`, before `build()`** (2 of 3): city-snap, ownership
  flood, and landroute must all see carved water.
- **Connectivity after dequalify, before landroute** (2 of 3): reconnect roads
  are then made land-safe by `make_committed_roads_land_safe`. A* runs on the
  already-carved raster, so it doesn't need landroute's output first.
- **Render fix uses the existing `xyz` line-pass variant** (all 3): sea lanes
  currently use the flat `xy` pass (renderer.ts:752, z=0, depth-buried); borders
  already use `xyz` (renderer.ts:754). Reuse that seam — no new pass, no depth
  reshuffle.

## Recon facts the plan is built on
- Bake pipeline: `main.rs::main` → `raster::paint` → `build::build` →
  leagues.mjs → prune-cities.mjs → dequalify-names.mjs → descope-sea-lanes.mjs →
  `landroute::make_committed_roads_land_safe` → `probe::write_committed_probe`.
- `landroute::astar_land_path` (8-neighbour land pathfinding on the raster)
  already exists — reuse for reconnect.
- One land-truth owner: `raster.rs` `classify_rgb`/`RenderMaskClass` ↔
  `terrain.ts` `PALETTE` (pinned by `painter_pixels_round_trip…`).
- Committed state: 398 cities, 2 sea edges; 327-city main component + Britain
  (14) + 57 single-city islands; 24 mainland cities reconnectable by land.
