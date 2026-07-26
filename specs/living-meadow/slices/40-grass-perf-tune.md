# 40 — Grass perf-tune (deferred, D2)

**Track:** perf · **Gate:** `gpuMedianMs`/FPS on named hardware, one knob at a time ·
**Runs after the look lands** (`03`–`09`). Designed now, not run early.

## Contract
The new look holds an acceptable frame budget — the loose "beat 26 fps" floor (D2),
without regressing the shipped turf baseline more than we choose to spend. Translucency
(`03`) and density-to-horizon (`05`) are the two terms most likely to cost; measure
*after* they land.

## API seam — wire existing instrumentation, don't build it
- `battleWorld.stats().performance.gpuTimeMs` (null-tolerant timestamp query),
  `drawCalls`/`triangles` (`renderer.info`), `bladeFieldLayer.stats()`
  (`{drawCalls, submittedTriangles, recordHash}`), `routePerf` frame-time window →
  `makeFullGamePerfReport`.
- **Knobs → a discrete quality ladder in `graphicsSettings.grassQuality`** (existing
  low/standard/fine, mapped to the pen's `QUALITY[4]` intent): per-tier
  segment/blade counts, far-tier cutoff (`farGrassEndM`/`edgeSinkStartM`), thinning
  exponent + `fadeStart`, `maxRecords`/`STATIC_GRASS_FIELD_CELL_M`,
  `GRASS_ZOOM_CUTOFF_T`.

## Verification (reproducible)
`perf:30k` → the `battle-perf-30k` scene on **named hardware**
(`VERIFY_GPU_ADAPTER=hardware`, `chrome` channel), median + p95 over the fixed
90-sample window. SwiftShader stays a correctness-only path (timestamp null-tolerant).
Compare `gpuMedianMs`/`submittedTriangles`/`drawCalls` before/after **per knob** —
one variable at a time. Reference: the turf baseline `gpuMedianMs ≈ 22.58` at mid
zoom on apple/metal-3.

## Reslice hook
If one quality tier can't both look right and hold budget, split `40-close` (near/mid
tier cost) and `40-vista` (far-tier coverage cost) — anatomy and integration have
different budgets.

## Delegated
Per-tier budgets; the wind realization's cost (analytic uniform vs RT, from `07`).
