# Conditional renderer decision

Live backend runs currently visit different battle states because simulation
throughput differs. Compare renderer cost independently before spending another
full live round. This is a lab experiment, never the Menu benchmark's acceptance.

## Workload

Use the existing complete game route, frame coordinator, camera tour, recording
and report. Advance the canonical battle to tick9000 or12000 with its original
opening orders, then hold authority at that exact state. Assert its hash before
and after each run. Continue camera motion, grass updates, crowd pose evaluation,
lighting and water using one elapsed render clock. Positions/facings stay at the
held endpoint; animation sampling must not extrapolate soldier positions or become
freeze-frame caching. Preserve the actual geometry, framebuffer, default shadows,
HUD and all scene layers. Every report explicitly identifies renderer-only scope
and held tick, so existing live acceptance cannot mistake it for a live battle.

All candidates consume the same continuous camera/time function. Different frame
rates sample different points on that function; this is matched input trajectory,
not a claim of identical per-frame GPU work. Record consumed camera/scene counts
at common checkpoints and test animation/time advancement independently. Use the
existing five-minute tour without changing its phase composition.

## Bounded decision

Before timing, pass a short browser correctness control for all four candidates:
held hashes, moving camera and poses, no errors, report classification, cancellation
and disposal. Build immutable enabled/disabled variants from the same source and
WASM. Keep ordinary live Menu behavior covered by its existing tests.

Run three serial rounds at each held tick, with backend order fixed in advance:
Three/raw/TypeGPU/vgpu; vgpu/TypeGPU/raw/Three; raw/Three/vgpu/TypeGPU.
Use fresh browser launches, the same viewport/DPR, warmup and instrumented tour.
Archive host observations and retain failed quiet-host classifications. No builds,
tests or CPU timing overlap hardware timing. Compare per-phase frame-time median,
p95, lows and interval-union GPU time; never rank using overlapping pass sums.

A conditional winner must improve overall and dense-phase cadence beyond observed
same-backend spread across rounds, without a repeatable phase regression or quality
loss. For the leading pair, reverse their order in a fourth confirmation round and
repeat with instrumentation disabled. If that changes the ordering or there is no
material separation, record a performance tie and decide using the existing
maintenance/quality scorecard, explicitly acknowledging uncertainty. Do not launch
more attribution probes merely because the result is a tie. A reproducible invalid
control is fixed before ranking; an unknown-host verdict is not silently promoted.

This decision only chooses where to continue optimization. Final acceptance still
requires the actual live Menu battle, realtime simulation, camera/shadow quality,
and the original-versus-final net-shadow equation in measurement.md. The original
whole-map versus fitted-shadow comparison remains a separate required control.
