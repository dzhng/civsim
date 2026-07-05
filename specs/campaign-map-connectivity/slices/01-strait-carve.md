# S1 — Strait carve: straits become water (the foggiest slice)

**Contract:** every strait a lane crosses reads as WATER through the single land-
truth owner (bake + frontend), while both endpoint cities stay on land and the
two landmasses are NOT land-connected. The Bosphorus 20/21-land probe flips to
water.

**API seam / owner:** `raster::carve_straits(&mut Raster, &STRAIT_CARVES)`,
called from `main.rs::main` **after `paint()` and before `build::build`** (so
city-snap, ownership flood, and landroute all see carved water). Paints
`RenderMaskClass::Sea.rgb()` along each corridor with the existing
`draw_line`/`fill_poly` (a capsule = thick `draw_line`), AFTER land+mountains so
it overrides the land fill. Corridors authored in world-km in `STRAIT_CARVES`
(Bosphorus→Marmara from Constantinopolis[917,394]→Nicomedia[1000,373]; Gibraltar;
Messina).

**Constraints (measured):**
- **Width ≥ 16 km** (≥ 2× the frontend 8 km grid stride) so the downsampled
  frontend mask reads water too — the binding constraint.
- Corridor threads the channel, NOT the city-to-city straight line — do not carve
  through the endpoint harbors. If the carve breaks an endpoint port's 3×3 all-
  land neighborhood, add it to `build::CITY_SNAP_EXEMPTIONS` ("strait harbor",
  the existing pattern) — the `water_cities`/`margin_water_cities` invariant is
  the safety net that screams if a carve covers a city.

**Interaction to expect:** carving the Bosphorus turns previously-land road
crossings (Constantinopolis–Deultum/–Perinthus) into water crossings; landroute
reroutes or demands a ferry entry, and roads that truly cross the strait must be
culled in S2 (only the sea lane crosses).

**Deliverable / inspectable:** re-baked `campaign-bg.png` with the 3 straits as
water. Run the Bosphorus probe line (20/21 land → water).

**Verification gates:**
- New `raster.rs` unit test: synthetic land raster, carve a corridor, assert
  centerline cells classify Sea via `classify_rgb`, endpoint cells stay land.
- Flips **STRAIT-WATER** + **LAND-DISCONNECTION** green.
- `committed_mask_probe_matches_regenerated_probe` regenerated.
- **Visual (screenshot-critique):** montage of the 3 carved channels on the
  parchment — an unprimed second opinion that reads "water, not a land bridge."
  **compare-screenshots** against David's Bosphorus before shot.

**Stays green:** the round-trip classifier test; city-on-land (endpoints stay
land).

**Human checkpoint (non-blocking):** preview the 3 carved straits; give ~5 min,
then proceed on the evidence and record the decision.
