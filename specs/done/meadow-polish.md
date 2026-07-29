# meadow-polish — CLOSED (2026-07-29)

Reopened from [living-meadow](living-meadow/README.md) when David judged the
shipped meadow "not nearly as nice as the reference." Two slices (P1 look-grade,
P2 density) plus a productionizing ladder (P3). Build history: git log
5566e957..ae7cacc2; decisions: living-meadow/choices.md addenda 1-2.

## What shipped (the how lives in the code)

- **P1 look-grade** — filmic S-curve + violet/cream split-tone + saturation on
  `BattlePostChain` (pre-AgX), preset-gated (golden full, overcast near-neutral),
  URL/live tunable. Owner: packages/photoreal-renderer/src/post/postChain.ts.
- **P2 pen-exact density** — the decisive finding: the pen runs
  blades/m² = K/d^1.5 (K≈17600) with HAIR-THIN strokes and camera-centred
  record rings; our 1.5m whole-map grid was the wall no fan-out could hide.
  Production: two-layer architecture in battleWorld — immutable whole-map
  base + async camera-following 300m focus ring (0.6m cells, 599k records,
  80m hysteresis, 48m deterministic snap), zoom-gated (zoomT 0.62/0.54),
  GPU circle-mask dedupe in the route pass.
- **P3 perf** — the locked 33ms budget HELD (David's explicit call over a
  38.5ms raise): route-compute camera-wedge cull, varying trim, mid segments
  8→6, and the pen's far count-for-width trade (fan 3→2, width up) landed
  vista 37.9 → 31.0ms GPU median; mid 19.4-20.5ms — both faster than the
  pre-spec baseline (22.58ms) with the full look on.

## Measured findings worth keeping

- **Depth prepass is net-negative on Apple TBDR** (hardware HSR already kills
  opaque overdraw; the field is vertex-bound). Ships default-OFF with a
  toggle for immediate-mode GPUs. The pen's biggest trick does not transfer.
- **Thin strokes are a perf feature**: the vista camera is fragment-bound;
  count-over-width is cheaper AND closer to the reference.
- **Perf measurement discipline**: consecutive GPU runs drift (suspected
  thermal); only cold runs settle budget questions.

## The one open item

Ring engage/rebuild uploads 599k records in one frame → the two rAF-p95
TRANSITION checks in battle-perf-30k stay red. A chunked-upload attempt
churned (uploads never completed; disabled with rationale at the call site in
battleWorld.ts). Pickup: a proven-completing incremental applyPackedRecords
path, then re-enable `incremental: true` and re-run perf:30k.

## Also awaiting David

Ambient audio ships default-muted (flip in graphicsSettings after a listen);
grade strength is live-tunable if the mood needs a nudge.
