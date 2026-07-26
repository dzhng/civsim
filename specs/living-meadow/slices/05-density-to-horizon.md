# 05 — Density-to-horizon LOD

**Track:** grass (on spike winner) · **Variable:** far density falloff ·
**Crop:** vista horizon band.

## Contract
Grass reads dense all the way to the horizon (the thing David called out — "rendered
even very far away"), with no bald far ring and no visible LOD banding. Our field
culls to a ~64 m disc today; the pen stays dense to ~1250 m.

## API seam
Adopt the pen's **continuous density law** `blades/m² = B·min(1,(dn/d)^1.5)` with
`K = B·dn^1.5` held constant across rings, as a **reshaping of the existing 3-tier
thinning** (`BladeFieldTransitionProfile` `farGrass*`/`edgeSink*`, the winner's
route/thinning) — **not** a new record schema and **not** a per-blade attribute
change (avoid touching `STRIDE_FLOATS=16` / the `/16` compute-dispatch literals).
Keep the shuffled-instance-prefix trick so any count is a uniform sample (no banding).

## Verification
compare-screenshots vs hero vista horizon + screenshot-critique told it may judge
only far-field coverage/banding. Watch `submittedTriangles` (this + `03` are the two
terms most likely to regress GPU cost — they feed the perf slice `40`).

## Must stay green
Near/mid close-gate density unchanged; draw-indirect stats invariants; the FPS loose
floor (perf *tuning* is `40`, not this gate — D2).

## Delegated
Ring radii / per-ring density constants; whether to stretch the far tier or add a
4th far ring. Heed the `battle-map-reference` rejection ledger — do **not**
re-litigate flat-paint far proxies it already rejected.
