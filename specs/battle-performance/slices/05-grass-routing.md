# Bound visible grass GPU work

## Contract and question

Can horizon and wide-camera grass compute/raster work shrink without changing readable ground coverage?

## API seam

`PhotorealBladeFieldLayer.routeGpu` (or its selected-backend successor) owns classification, compacted indices and indirect counts; `BattleGrassField` supplies the canonical camera and residency state once per frame. Existing GPU routing, wedge culling, projected-size gates and hysteresis are the starting point. Measure routed source count, survivor count, compute time, triangles and overdraw before adding more culling. Do not duplicate projection or replace proven density with arbitrary top-N selection.

Freeze 04 residency, source positions/seed, blade dimensions, shading and shadow policy. Consider spatial candidate lists before per-record routing if 01 proves the full scan expensive; preserve region coverage and deterministic identity. Inspect `activeGrassVisibleRadiusM`'s stepped eye-height bands separately from existing activation hysteresis. Repeated zoom crossings must not cause abrupt coverage/cost steps; smooth or hysteretic transition parameters are a measured candidate, with frozen endpoint coverage. Dirty CPU diagnostic mirror work is sampled (200k cap), not a full unbounded scan; measure it instead of deleting visibility telemetry blindly.

Early-depth or representation changes are separate experiments: change one variable, compare, then either land or reject before the next. If raster fill dominates, a geometry or shader representation can change only with coverage/readability evidence. Algorithm choice is delegated to measured comparison; no unmeasured universal GPU-driven rewrite.

## Artifact and verification

Replay ground-only debug and full production frames at close, tactical and horizon views. Check classification boundaries, camera near-plane cases and deterministic survivor counts against a small CPU oracle at the algorithm seam. Preserve already-accepted close grass coverage; report GPU render and compute separately. Run repeated threshold crossings to detect temporal noise, including look-away/return.

Visual variable: grass density continuity, judged in matching foreground/midground patches excluding sky, units and HUD; blade color, terrain and shadow appearance are out of scope. Human feedback about grass thinness or shimmer changes the representation decision. Accept only if combined 04+05 reduces the measured bottleneck without a temporal coverage regression.

## Inherited verification and review

Keep existing camera, crowd LOD, animation/pose, grass sampling, depth, default-renderer and lifecycle checks green; run the narrow affected checks plus the standing hardware `battle-perf-30k` gate for renderer changes. Preserve its thresholds. Record pre-existing reds separately; do not re-bless unrelated failures. Simulation semantics and campaign consumers must remain unchanged.

For every visual artifact, inspect the actual candidate; use [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md) against the matched baseline/reference, then run an unprimed [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the **last visual acceptance check**. Use screenshot-regression/snapCheck for captures. Motion claims need a frame sequence/video as well as stills. Store evidence under this spec. Open review shots via preview-shots, allow about five minutes while doing other work, then record an evidence-based decision if no reply arrives and close the shots. Human feedback is non-blocking; failed acceptance is not.
