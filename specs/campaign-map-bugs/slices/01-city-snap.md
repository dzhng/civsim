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
