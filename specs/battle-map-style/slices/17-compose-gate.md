# 17 — Compose gate: the style-family verdict

The first whole-frame judgment — everything before this judged one variable
through one crop.

## Contract unlocked

"Our battle maps look the same style as the reference" becomes a recorded,
evidenced verdict on multiple seeds — the spec's headline goal.

## API seam

None — this slice composes what exists: generated map (02–06) + blade grass
(10–12) + cliff material (13) + backdrop (14) + lakes (15) + haze (16) at the
slice-00 locked camera.

## Human can run

`battle-map-style.mjs` master shots on **3+ seeds** (fixed list, recorded
here), plus one hand map for contrast, under `overcast-highland` and
`golden-hour`.

## Verification

- **Style-family rubric, explicitly not replication:** tall terrain-owned
  flank cliffs ✓/✗; rolling grass sea with visible near-blade structure ✓/✗;
  water pocket sitting naturally ✓/✗; aerial depth (far lifts/desaturates)
  ✓/✗; horizon centered ✓/✗; reads inside the Aegean register ✓/✗.
- compare-screenshots against `assets/target-battle-map.png` and against the
  aesthetics reference `battle-overcast-highland.png` — telemetry + less-wrong
  verdict, per seed.
- screenshot-critique (unprimed) on every master shot.
- All band oracles green on every judged seed; perf:30k; tripwires.
- **Human review checkpoint** (non-blocking for the track, blocking for slice
  18): preview-shots the master sheet; if silent ~5 min, decide on evidence
  and record.

## Stays green

Everything. This slice ships no code — a failed verdict routes to the owning
slice (never patched here) and this file records which.

## Round 1 verdict (2026-07-05): FAIL — routed, not patched

Judged: seeds 7/3/8 x overcast-highland/golden-hour at the locked framing
(evidence: assets/compose-round-1/). Unprimed rubric: atmosphere and unit
legibility PASS across the board; composition FAILS - none of the six is in
the reference family yet.

- **Core miss (routes to 02+14 as recipe/scale work):** the battlefield
  reads as a pancake plain from the center-line camera. The 107-121 m flank
  walls sit 700+ m from the lens and project as horizon mounds; the
  reference's walling ranges occupy ~45% of frame height. Fix direction:
  taller flank ranges + taller vista-apron ridge rows (recipe knobs by
  design) and/or judge from cameras nearer a wall; decide with clay
  evidence, not in this slice.
- **Water dither (routes to 15):** the lake/stream surface reads as a
  blue/cream checkerboard at distance - the dither/alpha pattern is the
  loudest texture in golden frames.
- **Trees in the lake (routes to 06/scenery):** scenery placement does not
  exclude water cells.
- **White horizon band under GOLDEN (routes to 16):** the fade-to-skybox
  was verified under overcast-highland; golden's band still shows a hard
  full-width strip.
- **Dirt-patch dotted edges (routes to 06):** field-texture borders show
  polygon stepping.

Also standing before re-judge: the two pre-existing regressions from the
slice-16 sweep (photoreal-shadows toggle, photoreal-sky warm band) - fix
lane in flight.

## Feedback that would change it

David's verdict IS this slice. Each miss becomes a pointer to the owning
slice plus a reopened checkbox in the README TODO.
