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

## Ledger (implemented 2026-07-03, commits 4bde95b1 / 076d135c / a6eee6fb / 451706a6)
- **U3 verdict: BOTH owners guilty, committed separately.** The graph itself
  was never the gap — every target city has road edges with exact via
  endpoints on its node.
  - **Data (mapgen `landroute` pass):** via POLYLINES cut straight across
    painted-water bays (Cosa→Roma 9.9 km, Minturnae→Tarracina 6.3 km) and 4
    road-bearing junctions sat on painted water. Fix: junction snap to land
    (≤2.8 km), A* coastal reroute of >3 km water runs (38 edges, +134.8 km),
    `ROAD_FERRY_CROSSINGS` ledger (9 genuine straits), bake invariants
    (road-bearing nodes on land; runs ≤3 km raw / ≤4.5 km smoothed unless
    ledgered; road-degree-0 = SEA_ONLY_CITIES exactly).
  - **Render (mapPass road builder):** `roadEdgeIsLandSafe` fed the sea-label
    8 km/16 km area sampler to a whole-edge ≥50% gate — 96 of 632 road edges
    silently dropped. Fix: `drawnRoadRuns` owns drawn centerline geometry,
    point-truth per-run through `TerrainField.renderLandAt`; water dips
    ≤ 4.5 km bridged (TWIN of the bake invariant), ledgered ferry straits
    split honestly at the shore; carts ride the same drawn runs. Stats:
    roadEdgesCulled 0, roadWaterGaps 7, seaLanes 468 (sea-lane pass
    byte-identical).
- **Five case verdicts (fresh :5204 captures, this worktree):**
  - COSA — fixed (data reroute + render cull); ribbon through the settlement
    (`assets/evidence/b7b-after-cosa.png`).
  - TARRACINA — fixed (data reroute + render cull); coastal ribbon reaches it
    (`b7b-after-tarracina.png`).
  - OSTIA/PORTUS — fixed (render cull; edge existed); Roma-hub ribbon
    terminates in the model (`b7b-after-ostia.png`; cards-hidden proof in
    `assets/oracle/regional-closeout-02/crops/ostia-nocards-overrule.png`).
  - PUTEOLI — fixed (edge existed; drawn per-run now); sits mid-ribbon on the
    coastal road Minturnae→Pompeii/Salernum (`b7b-after-puteoli.png`; the
    pre-02 road-less state is `b7b-puteoli-road.png`).
  - FERENTINUM dead-end — gone (the stub was a junction whose continuation
    edges were culled; per-run drawing + junction land snap); the Tibur road
    runs through to the coast (`b7b-after-ferentinum.png`; the pre-02 stub is
    `b7b-ferentinum-stub.png`).
- **Gates on the final tree:** `cargo test -p mapgen -p campaign` green
  (incl. the new landroute reroute + bake invariants); campaign + water-sea +
  campaign-models scenes ALL PASS; fresh regional political capture
  byte-identical to the re-blessed baseline; render probe matches the
  slice-01 ledger exactly (whole-map 12 = 5 exempt + 7 island, regional 0,
  cards clean; whole-map sea-label reds identical to the slice-00 red
  baseline — B3, slice 03's).
- **DATA-lane close-out oracle: GREEN** — road-missing, road-dead-end, and
  offshore-city classes all absent; no new confirmed findings. Report +
  crops: `assets/oracle/regional-closeout-02/`. Confirmed leftovers are
  other lanes' known classes not yet in this branch's history: B4 jagged wash
  edges (slice 05, fix on lane-territory-coast) and the B8
  CASTRUM TRUENTINUM label tail (slice 04). Process note: stacked ROMA+OSTIA
  plaques fully hid Ostia's model+ribbon from a road judge — give future road
  judges a cards-hidden companion capture.
