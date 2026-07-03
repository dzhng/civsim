# 01 — B1: cities snap to the rendered mask (mapgen, re-bake) ★human

**Contract unlocked:** every city renders on land as the player sees it — the
marker footprint sits on rendered land with an inland margin — pinned forever by
the bake invariant. Evidence: `assets/evidence/b1-tarraco.png`, `b1-corinthus.png`,
`b1-pella.png`, `david-tarraco-offshore.png`, `david-overview-political.png`.

## API seam (bake-owned; invariant 1)
- `crates/mapgen/src/build.rs` city snap: target cells whose **margin
  neighborhood is all-land in the final painted raster** (after rivers/lakes
  overpaint), margin from slice 00's probe (≈ the marker radius at overview
  zoom; expect ~1 render cell). The previous snap used the pre-paint source
  raster — that's the bug.
- **Ports must not be dragged inland**: harbor/river-mouth cities that read
  fine (only the marker pixel touches water) get a named exemption or a smaller
  margin — the goal is "no marker clearly offshore", not "no city near water".
- Extend `baked_campaign_map_satisfies_mapgen_invariants` with the margin
  assertion against the committed bg — the permanent bridge test.
- Re-bake (JSON + bg + dist copies); `snap_edge_endpoints` keeps roads attached.
  Never hand-edit outputs.

## What the human can see
- Before/after overview captures; the probe report at 0/12 offshore.

## ★ Human checkpoint (non-blocking)
City positions physically move on a shipped map. Open before/after overview
with preview-shots; ~5 min; if silent, proceed on the probe + critique evidence
and record here.

## Verification
- Cargo invariant green; probe: 0 open-sea cities, exemption list explicit.
- Campaign scenes: re-bless moved baselines deliberately (one bless commit);
  screenshot-critique on the overview; compare-screenshots vs the evidence
  crops (Tarraco/Corinthus/Pella defects gone).
- **No oracle run here** — the data-lane close-out (slice 02) covers it.

## Firewalls
- Positions only — no road topology changes (slice 02 owns roads); no frontend
  edits; battle scenes green.

## Feedback that would change this slice
- A city snapped somewhere odd-looking → adjust its target cell choice, not the
  invariant.

## Ledger (implemented 2026-07-03)
- Snap criterion: `snapped_city_positions` targets the nearest cell whose 3x3
  neighborhood is all-land in the FINAL painted raster (classified via the
  slice-00 owner). 98 cities moved, all ≤ 4.93 km. `MAX_CITY_SNAP_MOVE_KM = 6`;
  beyond it a city stays put and joins `CITY_SNAP_EXEMPTIONS` (8 named:
  Tainaron Pr., Cnidus, Apollonia Pontica, Perinthus, Meninge,
  Constantinopolis, Gades, Thaenae — peninsula/strait/small-island harbors).
- Invariant extended: every non-exempt city's 3x3 bg neighborhood all-land +
  exemption list must name real cities (stale-exemption guard).
- Prune stability: bake exports transient `srcPos`; prune-cities spaces on it
  (and strips it), so the snap can never change WHICH cities survive.
- League colors: assignment now keyed to sorted league id, not kmeans group
  order — position jitter can no longer reshuffle hues. One-time global
  neutral-league recolor accepted in this slice's bless (12 leagues would have
  permuted anyway; now stable forever).
- Probe: whole-map landFraction<0.5 went 22 → 12 (5 exempt); regional-italy 0;
  all 412 centers land. Remaining 7 non-exempt (Rhodos, Samos, Corcyra, Melita,
  Leucas, Populonium, Sinope) are island-class — marker sits ON its visible
  island; visual verdict at the data-lane oracle (02).
- ★checkpoint: unprimed critique confirms no square marker floats on open
  water; its remaining findings are owned by open slices (03/04/05). NEW
  pre-existing observation for the final sweep: southern-Italy grey region
  reads as "missing fill" (independents color) — David to rule at 10.
- Re-blessed (deliberate, this slice's variables): campaign-lod-whole-political,
  campaign-lod-regional-italy-political, campaign-lod-border-fog.
- Evidence-crop note: b1-tarraco/corinthus/pella show the icon+label class —
  resolved by slice 04, not here (see tools/README.md reconciliation).
