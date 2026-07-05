# S0 — Model consts + RED invariant harness

**Contract:** the executable definition of "done." Introduce the two owning
consts and write the full invariant roster as *failing* assertions — the failing
messages become the spec each later slice flips green.

**API seam / owner:**
- New `crates/mapgen/src/connectivity.rs`: `pub const SEA_LANES: &[(&str,&str)] =
  &[("Gades","Tingi"),("Constantinopolis","Nicomedia"),("Vibo Valentia","Messana")];`
- `crates/mapgen/src/raster.rs`: `pub const STRAIT_CARVES: &[StraitCarve] = &[]`
  scaffold (`StraitCarve { name, corridor: &[[f64;2]], carve_km: f64 }`).
- `main.rs` test `baked_campaign_map_satisfies_mapgen_invariants`: add the pinned
  invariants from the README (LANE-COUNT/CITY-TO-CITY, CONNECTED, NO-ISLANDS,
  STRAIT-WATER, LAND-DISCONNECTION, REFERENTIAL-INTEGRITY, BAKE-DETERMINISM),
  reading `SEA_LANES`. Add helper `longest_land_run` (mirror `longest_water_run`).

**Deliverable / inspectable:** `cargo test -p mapgen` RED, each assertion message
naming exactly what a later slice must satisfy.

**Gate:** the test compiles; fails only on the intended (not-yet-satisfied)
assertions; still-valid checks stay green.

**Stays green:** everything not part of the new model (name uniqueness, city-on-
land, snap margins, junction stubs).

**Human checkpoint (non-blocking):** David reads the invariant list and confirms
it IS the model — especially the Sicily endpoint (Vibo Valentia↔Messana) and the
strait-water threshold. Open nothing; proceed on the roster.
