# 02 — B7b: road gaps at Cosa, Tarracina, Ostia (diagnose → fix)

**Contract unlocked:** every settlement is visibly road-connected where its
graph says so; no approach road dead-ends in open terrain. Evidence:
`assets/evidence/b7b-cosa-road.png`, `b7b-tarracina-road.png`,
`b7b-ostia-road.png`. Depends on 01 (endpoints re-baked).

## Diagnose first (inside the slice, gated)
**Named prime suspect (verified in recon):** `roadEdgeIsLandSafe` in the mapPass
road builder drops a WHOLE edge when <50% of its samples pass the coarse land
test — and that test is `field.landAt(x, y, 16)`: all-land within a 16 km
radius on the 8 km grid. Coastal approach edges fail wholesale — a render-cull
bug wearing a data-gap costume. But check the data first:
1. Does campaign-map.json contain edges reaching Cosa/Tarracina/Ostia with via
   endpoints on the node? (script over the JSON)
2. If yes → instrument the cull, log dropped edges, confirm.
3. If no → the gap is bake-side (ORBIS source or the junction prune).

## Fix at the guilty owner
- Render-cull guilty: sample through the full-res render mask (slice 00) at a
  small radius instead of the coarse 16 km test — and keep genuine sea
  crossings dropping (assert the sea-lane count/stats unchanged).
- Data guilty: fix in mapgen; extend the bake invariant: every non-island city
  has road-degree ≥ 1 AND no road polyline terminal lies in open terrain (a
  dead-end detector over via endpoints).

## What the human can see
- Regional capture: Tarracina's approach reaches the settlement, Ostia↔Roma
  ribbon present, Cosa connected.

## Verification
- Cargo invariants (if data-side); dead-end detector = 0; probe green.
- campaign-polish-roads scene; compare-screenshots vs the three evidence crops.
- **LANE DATA close-out oracle:** find-map-bugs on the regional shot — the
  road-missing/dead-end AND offshore-city classes must be absent, no new
  confirmed findings.

## Firewalls
- No road styling/width changes; the sea-lane dashed pass untouched; if both
  owners are guilty, fix both but commit separately.

## Resolves
- U3: data gap vs render cull, per city.
