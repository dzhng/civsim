# S2 — Connectivity owner: compute → reconnect → delete → self-check

**Contract:** one deterministic Rust step makes "one connected component, exactly
the 3 named lanes, zero unreachable cities" TRUE BY CONSTRUCTION. Replaces
`descope-sea-lanes.mjs`; retires the `SEA_ONLY_CITIES` allow-list.

**API seam / owner:** `connectivity::reconnect_and_prune(&mut map, &carved_raster)
-> Report { reconnected, deleted }`, called from `main.rs::main` **after
dequalify and before `make_committed_roads_land_safe`** (added roads then get the
land-safe pass). Reuses `landroute::astar_land_path` + `build::classify_route_tiles`.

**Algorithm (deterministic, name-sorted throughout):**
1. Keep only sea edges whose city-pair ∈ `SEA_LANES` (both endpoints `kind=="city"`);
   delete the rest. Drop the road ferry each kept lane replaces (Const–Nicomedia,
   **Messana–Vibo Valentia**) — remove those from `ROAD_FERRY_CROSSINGS`.
2. Component = union-find over `road ∪ the 3 sea` edges; seed the giant.
3. For each city outside the giant (name order): `astar_land_path` (carved raster)
   to the nearest in-component city within the detour cap. Success → add a `road`
   edge (via = the A* polyline, tiles via `classify_route_tiles`), recompute,
   repeat to fixpoint. This pulls Sicily's coastal towns onto Messana; Messana
   reaches the mainland via the S1 Sicily lane.
4. Delete every city still outside the component + its edges; iteratively prune
   orphaned junctions (≤1 edge). **One rewiring routine** (reused for add +
   delete) fixes edges, ambush `edge`, `factions[].capital/.cities`,
   `start_armies[].at`.
5. Self-check inline (bake aborts on its own output): one component; sea edges ==
   `SEA_LANES`; zero degree-0 cities; no road crosses a strait.

**Retirements (refactor-clean, same pass):** delete `crates/mapgen/descope-sea-lanes.mjs`
and its `post_step`; delete `SEA_ONLY_CITIES`, `validate_sea_only_cities`, and the
`island_cities`/`stranded` exemption in `main.rs`.

**Deliverable / inspectable:** a fully connected baked map. The `Report` prints
to stderr (reconnected list + deleted list with counts — "Britain 14 deleted,
Sicily N reconnected") like landroute already does.

**Verification gates:**
- Flips **CONNECTED** + **NO-ISLANDS** + **LANE-COUNT** green.
- New `connectivity.rs` unit tests on a synthetic graph: a reconnectable-by-land
  city gets a road; a true island gets deleted; references rewired.
- `road_water_violations` + ferry ledger still green (added roads land-safe).

**Firewall:** reconnect uses land pathfinding on the carved raster, NEVER a
straight-line water heuristic. Deterministic (sorted, no RNG) → byte-identical
re-bake. Never hand-edit JSON. Leagues: no ownerless faction, no dangling roster.

**Risk / fog:** the A* detour cap (`astar_land_path` bails past ~`straight_gap*5+60`
km). The fixpoint (hop city-to-city, not all-to-anchor) mitigates. If a city
genuinely has no land path it is correctly deleted.

**Human checkpoint (non-blocking):** David reviews the reconnect/delete ledger —
confirm no wanted city vanished, no absurd straight road added. Adjust cap/anchor
if needed; proceed on the evidence otherwise.
