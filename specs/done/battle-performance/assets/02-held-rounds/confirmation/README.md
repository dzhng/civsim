# Leading-pair confirmation

All eight declared full held tours completed. Functional checks pass in all eight;
quiet-host checks fail in all eight. The final resumed batch exited0. The first
trial completed before the requested pause, but its parent did not collect its
exit code; the original pause record remains unchanged.

| Query mode | Held tick | Backend | Average FPS | 1% low FPS | p95 frame ms |
| --- | ---: | --- | ---: | ---: | ---: |
| enabled |9000|TypeGPU|27.31|19.22|50.00|
| enabled |9000|raw|34.14|19.94|49.99|
| enabled |12000|TypeGPU|30.24|15.97|50.00|
| enabled |12000|raw|32.33|17.76|50.00|
| disabled |9000|TypeGPU|34.81|19.09|33.34|
| disabled |9000|raw|36.08|14.34|49.99|
| disabled |12000|TypeGPU|32.72|16.27|50.00|
| disabled |12000|raw|32.19|10.34|50.00|

## Decision consequence

The [bounded rule](../../../README.md) resolves these measurements
as a **performance tie between raw and TypeGPU**. Raw's early-state averages
already overlap TypeGPU across the three orders. Confirmation changes the
later-state average ordering with queries disabled, and raw's better early
average comes with worse lows. Phase results also trade off: in the disabled
later state, raw averages higher during pan/zoom but lower during horizon,
combined movement and return, with worse lows in every phase. There is no
across-the-board separation beyond observed variability.

This is a decision under uncertainty, not proof of equal engine performance.
All host-isolation verdicts remain failed. The first TypeGPU trial had substantial
competing CPU activity and ran before the overnight pause; comparisons across
that gap cannot attribute changes to query overhead. No additional broad timing
round is needed to avoid a tie. Select the continued implementation through the
maintenance/quality scorecard after the remaining coherent scene-count control.
No final live-performance or shadow-quality acceptance follows.

## Scope and provenance

Disabled means GPU timestamp queries/readbacks removed; CPU and submission
observation remain. Its GPU sample sets are empty and timings unavailable, not
zero. The [summary](comparison-summary.json) preserves exact overall and phase
cadence, resolved union sample counts, scene identity and original host verdicts.
GPU unions use the same join and completeness rule as the preceding rounds.

All eight retain the canonical held hashes,15,560 soldiers,1440×900 CSS,
2880×1800 framebuffer,DPR2 and matching graphics/audio settings. Their immutable
builds retain source8643cf05 and e9f4f080… WASM. The resumed build verification,
[pause record](pause.json), [seven outcomes](resume-outcomes.json) and
[resume log](resume.log) preserve the interruption boundary. The first trial's
original report and archive are retained without rewriting pause history.

Each trial directory contains four compressed original reports, a manifest,
trial log and archive index with uncompressed SHA256/byte count. Decompression
was checked byte-for-byte against all eight scratch originals. The duplicated
full report in scratch run.json is represented by menu-export plus manifest.
These records have per-frame cameras but only startup/terminal scene counts;
common coherent interior checkpoints remain separate correctness evidence.
