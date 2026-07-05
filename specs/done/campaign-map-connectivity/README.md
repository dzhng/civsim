# Campaign Map Connectivity — (done)

The campaign map has ONE coherent connectivity model, owned by ONE computed step.
Every *reachable* city is on the main network (roads + the 3 sea lanes); every
*unreachable* city is a true island held as a passive neutral faction that teases
a future sea-travel expansion. No fake land bridges, no hand-maintained allow-list,
no silently-stranded mainland city.

This shipped in two waves. **Wave 1** (straits + lanes + Rhegium + render) fixed
the "channel rendered as land" bug and made sea lanes read as solid crossings.
**Wave 2** (reconnect/island model + honest invariant + Carthage owns Sicily)
completed the model.

## What shipped

- **Straits are water.** `raster::carve_straits` (`STRAIT_CARVES`) repaints the
  Messina, Bosphorus, and Gulf-of-İzmit channels to Sea after `paint()`, before
  `build()` — the ONE owner of "a strait is water," read via the same committed PNG
  the frontend downsamples (`terrain.ts`). Carves are sized to survive the 8 km
  frontend grid (a 2 km-raster carve alone is sub-cell and re-fills as land).
- **3 sea lanes**, each city-to-city: Gades↔Tingi, Constantinopolis↔Nicomedia,
  Rhegium↔Messana. They render as solid, on-top, mitred strips lifted onto the
  water surface (`pushEdgeLines`, the `xyz` line variant) — not the old flat,
  depth-buried dashes.
- **Rhegium** (absent from ORBIS) is injected via `sources::apply_extra_geography`
  (overrides `extra_sites`/`extra_routes`/`drop_routes`), replacing the fake
  Messana–Vibo-Valentia road ferry with the real strait crossing.
- **28 cities reconnected, 43 island holdings.** `connectivity.rs` is the sole
  owner: `descope_and_reconnect` descopes sea lanes and draws reconnect roads;
  `reconnect_plan` decides who reconnects and how.
- **Carthage owns Sicily.** `claim-reconnected.mjs` claims reconnected *groups*
  for the power whose `overrides.cities` names a member (only Panormus qualifies →
  Sicily → Carthage; power-owned 94→101). Islands and neutral mainland untouched.

## The reason it works this way

- **`reconnect_plan` classifies on ASTAR DRAWABILITY, not straight-line distance,
  and the invariant reuses the same predicate.** This was the pivotal correction.
  A pure landmass rule is wrong (the Afro-Eurasian mainland is one 8-connected
  blob, so the Black-Sea/Crimea outliers sit on the *same* landmass as Antioch yet
  must stay islands). A static distance cap is wrong for interior clusters (Sicily's
  Lilybaeum is 270 km from Messana but chains in via short hops). So the model is an
  **iterative Prim merge, same-landmass, per-hop cap `RECONNECT_MAX_GAP_KM = 140`**
  (measured from a clean 133↔158 km gap in the S0 report), where a city reconnects
  iff astar can *draw* a road to the growing set — endpoints snapped to land for
  waterline ports; undrawable cities island silently rather than panic. The invariant
  asserts `reconnect_plan(committed).is_empty()`, so classification == drawability and
  a disconnected mainland city fails by name.
- **Reconnect runs AFTER the ownership flood**, so reconnected cities keep their
  neutral `league_*` owner — the "muted neutral look." Ownership only changes where
  a power's hand-authored roster explicitly names a now-reconnected city (S5).
- **Islands need no downstream change.** `leagues.mjs` already makes ownerless
  cities neutral, `AiPersona::Neutral` already garrisons-only, `start_armies` arms
  only the 12 power cities. The feature only stops the bake from *lying* about which
  disconnections are intentional. A `cargo test -p campaign` guardrail
  (`connectivity_islands`) pins that every island stays non-playable + Neutral +
  army-less.

## Invariants that must stay true

1. **`connectivity.rs` owns "connected + island".** ONE predicate (`reconnect_plan`)
   shared by bake and test; ONE lane const (`KEEP_SEA_LANES`); the descope graph
   surgery lives here. No hand-list of islands exists anywhere.
2. **Component-membership, not degree-0, is the predicate.** A disconnected
   multi-city component (Britain) is an island; a disconnected mainland city or
   cluster is a bug.
3. **One land-truth owner.** `raster::classify_rgb` (twin of `terrain.ts` PALETTE);
   the invariant rehydrates the committed PNG via `Raster::from_rgba` and queries the
   same pixels the bake used.
4. **Bake determinism.** Sorted iteration, integer A\* keys, no RNG/wall-clock. A
   double bake is byte-identical; the committed mask probe matches a regenerated one.
5. **Islands are untouched downstream** (neutral, garrison-only, army-less).

## Pointers into the code

- `crates/mapgen/src/connectivity.rs` — `landmass_labels`, `main_component`,
  `reconnect_plan`, `descope_sea_lanes`, `descope_and_reconnect`, `KEEP_SEA_LANES`,
  `RECONNECT_MAX_GAP_KM`, and the `connectivity-report` subcommand (`mapgen
  connectivity-report`).
- `crates/mapgen/src/raster.rs` — `carve_straits`, `STRAIT_CARVES`.
- `crates/mapgen/src/sources.rs` — `apply_extra_geography` (Rhegium injection).
- `crates/mapgen/claim-reconnected.mjs` — S5 ownership claim.
- `crates/mapgen/src/main.rs::tests::baked_campaign_map_satisfies_mapgen_invariants`
  — the honest computed invariant (definition of done).
- `crates/campaign/tests/connectivity_islands.rs` — the island guardrail.
- `packages/game-renderer/src/campaign/mapPass.ts::pushEdgeLines` +
  `web/src/campaign/renderer.ts` (`this.lines` uses the `xyz` variant) — solid lanes.

## Dead ends (do not re-walk)

- **Data was never corrupted.** The land mask is rasterized from vector coastlines
  (`ne_50m_land.geojson`); a redownload or a 10 m swap does NOT fix the straits —
  it's resolution (50 m vector + 2 km raster + 8 km frontend grid). The carve is the
  fix. (This burned real investigation; don't re-fetch.)
- **Straight-line landmass classification** wrongly reconnects the Black-Sea rim
  across the mega-landmass; the distance-cap + astar-drawability model replaced it.
- **Sestus panicked** reconnecting straight-line-nearest to Lampsacus across the
  painted-water Dardanelles. Fixed by drawability + nearest-*drawable*-target
  fallback (Sestus routes up the Chersonese to Claudia Aprensis). Do NOT carve the
  Dardanelles for this — the drawability fallback is the general answer.
- **S5 first attempt flooded 205/400 cities** into powers (a multi-source flood from
  every power city swallowed neutral mainland leagues). Reverted. The shipped version
  claims ONLY reconnected-city groups that contain a power's `overrides.cities`
  member — bounded to ~7 (Sicily). Never re-introduce a general adjacency flood.
- **Peninsula-tip road-over-water** (Cyzicus/Tainaron/Cnidus, and the Perinthus↔Const
  ferry) was assessed and **accepted**: at playable zoom these run on the coast; the
  over-water look is a close-zoom artifact of the 8 km frontend dropping a thin neck.
  Islanding them would disconnect real cities for a cosmetic. The eroded-mask option
  (erode `reconnect_plan` drawability by ~1 frontend cell) is the lever if that
  preference ever changes.

## Measured provenance

`mapgen connectivity-report` on the committed map: 328/399 cities in the main
component; 71 off-main. First-hop gaps break cleanly at **133↔158 km** — mainland
coastal + Sicily's Syracusae→Messana (131 km) ≤133; the Black-Sea/Caucasus/Crimea
rim starts at 158 km — which set `RECONNECT_MAX_GAP_KM = 140`. Reconnected (28):
Sicily interior, Prusias→Nicaea, Malaca→Corduba, Sinope→Amisus, the coastal
mainland, Sestus→Claudia Aprensis. Islands (43): Britain-14 (internal roads, no
Channel bridge), Cyprus, Sardinia, Corsica, Balearics, the Aegean isles, Crete,
Rhodes, Malta, Cephalonia, Corfu, Djerba, and the Black-Sea rim.
