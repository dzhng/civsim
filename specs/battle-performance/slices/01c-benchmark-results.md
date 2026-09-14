# FPS results and spike chart

Status: implemented and verified for baseline acquisition. The [evidence record](../assets/01-benchmark/README.md) owns full-menu checks, camera captures, raw timing and limitations. The baseline is slow; completing this measurement slice does not pass the final performance contract.


## Contract and seam

The completed in-game benchmark shows average FPS, 1% low, 0.1% low, minimum and maximum FPS, plus a visual frame-time chart locating spikes throughout the battle. It supports rerun, return to menu and local JSON export. No backend or account is needed.

`benchmarkMetrics.ts` owns pure aggregation over `BattleFrameSample`; `BenchmarkResults` in the existing React UI owns presentation. Retain raw intervals, frame ids, scene/tour versions, elapsed phase boundaries and sim ticks. Define **average FPS = rendered frame intervals / their total duration in seconds**, not mean instantaneous FPS. 1% and 0.1% lows = 1000 / arithmetic mean of the slowest ceil(N×0.01) and ceil(N×0.001) frame intervals in milliseconds. Min/max FPS = 1000 / max/min valid interval; label these instantaneous extremes. Show p50/p95/p99 frame time and >33.33/>50ms counts too. Zero/invalid intervals are flagged, never used as infinity or silently smoothed. Browser rAF cadence is labeled as a rendering-cadence estimate where presentation data is unavailable.

Frame-time chart uses elapsed seconds horizontally and milliseconds vertically, with 16.67 and 33.33ms reference lines. Pan/zoom/horizon/contact markers and hover show the interval, phase, camera and available CPU/GPU timing. Downsample only chart drawing with min/max-preserving bins so every large spike survives; all statistics use raw samples. Do not run a full React chart update every frame: collect into bounded typed/chunked storage, update the small live progress indicator at <=4Hz and render the full chart after timing ends. Record missing samples and interruptions. A cancelled or short battle result is visibly partial and excluded from comparisons unless both use the same window.

## Artifact and verification

Before 02 starts, capture the complete original-renderer five-minute baseline through the actual menu, with all metrics and camera checkpoints. This closes the baseline acquisition begun in 01.

Completed results in the actual game, downloadable raw JSON and optional local baseline overlay for equal scenario/viewport/settings identities. Synthetic known frame intervals pin averages/lows/extremes and spike-preserving bins. Verify a known inserted stall appears at the correct timestamp and does not disappear when zooming/resizing the chart; no need to ship an injected stall. Verify collector memory remains bounded for the five-minute run and reruns release it. Browser exercise covers menu launch through results/export and cancellation.

Visual variable: chart/statistic readability, with crops of result cards and spike regions; game rendering is out of scope. Use existing bronze UI housing, readable plot labels and accessible non-color-only spike markers. Delegated: chart implementation and visual layout within these definitions. Human preference for additional metrics may extend the report, not change existing definitions between runs.

## Inherited verification and review

Keep existing camera, crowd LOD, animation/pose, grass sampling, depth, default-renderer and lifecycle checks green; run the narrow affected checks plus the standing hardware `battle-perf-30k` gate for renderer changes. Preserve its thresholds. Record pre-existing reds separately; do not re-bless unrelated failures. Simulation semantics and campaign consumers must remain unchanged.

For every visual artifact, inspect the actual candidate; use [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md) against the matched baseline/reference, then run an unprimed [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the **last visual acceptance check**. Use screenshot-regression/snapCheck for captures. Motion claims need a frame sequence/video as well as stills. Store evidence under this spec. Open review shots via preview-shots, allow about five minutes while doing other work, then record an evidence-based decision if no reply arrives and close the shots. Human feedback is non-blocking; failed acceptance is not.
