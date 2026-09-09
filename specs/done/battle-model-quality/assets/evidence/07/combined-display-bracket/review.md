# Available-display bracket — not an accepted envelope

All three sequential runs fail the unchanged33ms criteria. Higher native
resolutions also move more visible soldiers into the highest mesh tier, so this
is a combined display/detail bracket, not isolated pixel-fill attribution.
No production code, camera policy, asset or threshold changed.

## Reproduction and controls

Revision `f38e3b36`, Apple M5 Pro20-core GPU, hardware Chrome152.0.7977.77.
The [environment record](environment.json) includes sanitized display modes,
source hashes, process samples and every exit. The internal panel reports
3024×1964 physical pixels (1512×982 logical at120Hz); the external panel reports
5120×2880 physical pixels (2560×1440 logical at60Hz). The headless harness uses
those physical drawing-buffer dimensions at pixel ratio1. It does not measure
a particular desktop window, display presentation refresh or UI cost.

The three commands differ only in width/height and report path. They ran once
each, in baseline/internal/external order, from09:35:22 to09:37:50UTC. Each
timing row uses60 warmup and180 measured frames. No red repeat was discarded.

```sh
BUDGET_FIXTURE=mounted BUDGET_SOLDIERS=30000 BUDGET_FRAMES=180 BUDGET_WIDTH=1280 BUDGET_HEIGHT=800 BUDGET_CAMERA=gameplay BUDGET_STOPS=close BUDGET_DETAIL='{"subdivisions":[3,1,0],"jointCopies":8,"influences":4,"keySubdivisions":2}' BUDGET_TEXTURE_SIZE=1024 VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome VERIFY_URL=http://localhost:5174 SCENARIO_REPORT_JSON=specs/battle-model-quality/assets/evidence/07/combined-display-bracket/baseline.json node web/scene.mjs battle-model-budget
```

The existing mounted fixture has67 joints,9,216/576/144 triangles, four
influences,947,112 animation bytes and three1024px maps. These are tested
synthetic inputs, not admitted art limits. The fixed1024m terrain, camera target,
distance3.5, pitch.24, yaw−π/2, FOV.85 and zoom remain the same. Aspect follows
the actual display dimensions, so field of view and visibility are not identical.

## Outcomes

Milliseconds. CPU columns are median/p95; GPU is queue-elapsed median/p95,
including submission gaps rather than active-pass duration. These overlapping
quantities must not be added. Quantiles use the existing harness's sorted
`floor(n*fraction)` definition. [Summary](summary.json) retains full precision,
stage costs, exact asset/camera stats and allocation scope.

| Drawing buffer | Mode | CPU control | CPU timed | RAF p95 control/timed | GPU timed |
| --- | --- | --- | --- | --- | --- |
|1280×800|steady|12.70/20.52|12.16/20.57|16.67/16.67|16.04/19.57|
|1280×800|interruptions|13.34/25.37|13.61/24.11|33.33/16.67|16.13/22.35|
|3024×1964|steady|13.49/22.08|13.86/22.50|66.66/33.34|30.15/31.28|
|3024×1964|interruptions|15.14/27.74|15.65/25.41|66.66/33.34|29.90/31.03|
|5120×2880|steady|14.02/21.84|14.69/23.01|83.34/50.00|46.39/48.90|
|5120×2880|interruptions|17.92/34.89|18.50/31.64|83.33/50.00|46.82/49.15|

[Baseline](baseline.json) has one failed interruption-control cadence check;
[internal](internal.json) fails all four cadence checks;
[external](external.json) additionally fails both GPU-queue median checks.
All runs submit30,000 bodies, pass timing coverage and exact frozen-storage
admission, and report no renderer warnings or page errors. Each timed row has180
distinct measured GPU frame IDs matching its180 submitted samples.

| Drawing buffer | Main L0 / L1 | Shadow L2 | Tracked live / replacement peak bytes |
| --- | --- | --- | --- |
|1280×800|1,432 /4,080|30,000|355,855,444 /583,375,460|
|3024×1964|5,305 /0|30,000|355,770,548 /583,290,564|
|5120×2880|6,113 /0|30,000|355,809,332 /583,329,348|

The remaining bodies are shadow-only here, not main-view impostors. Allocation
tracking covers fresh crowd generations after the existing world was created;
it excludes earlier world/framebuffer allocations, opaque texture storage and
driver overhead. Similar tracked totals therefore do not imply similar total
VRAM across resolutions. Whole-device uploads and replacement overlap remain in
the raw reports. The60,000-source staggered phase occurs after timing; its
admission does not establish distinct-history frame cadence.

## Limits and next decision

This was not an idle machine. Ten-second process samples plus before/after
samples record background activity; they cannot prove activity between samples
or GPU occupancy. The medium Blender build77689 was already running when the
reservation was announced and was not interrupted. Baseline samples include
Blender78.7% CPU, while an internal-display sample includes a virtualization
process187.5%; background backup/system/app work also varies. No unrelated
application was stopped. Sampling itself adds small unisolated observer cost.
These facts limit causal and cross-run timing claims; they do not waive failures.
Chrome also differs from the older151-era reports, so those are not a matched
before/after comparison with this bracket.

Real-clock observations differ as cadence slows: timed interruption rows advance
93/165/258 ticks and include35/63/62 overlay frames. The clock/catch-up cap is
unchanged, but these are not identical per-frame pose histories. The result
supports keeping native-display acceptance open, not blaming one subsystem or
assigning a triangle/texture budget.

Independent read-only review confirmed these boundaries and recommends one
geometry-sensitivity experiment: fix5K framing and change only synthetic
subdivisions `[3,1,0]` to `[2,1,0]`, reducing L0 from9,216 to2,304 triangles.
Require unchanged visible/main/shadow tier populations, palette demand and map
sizes with contemporaneous controls. Improvement would support sensitivity to
near geometry; it would not separately quantify vertex, raster, fragment or
post-processing cost. Little improvement would weaken that hypothesis, not prove
another cause. No accepted triangle maximum follows from either outcome.
Do not rerun the same three configurations until one passes, reduce output
resolution silently, or weaken the33ms gate.
