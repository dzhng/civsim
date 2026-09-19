# Held renderer comparison rounds

The [declared comparison](../../renderer-comparison.md) separates rendering from
live simulation throughput. These results are conditional evidence only. No
renderer is selected, and none of these held runs satisfies live acceptance.

## First order

Round0 completed all eight actual five-minute Menu tours, in Three/raw/TypeGPU/vgpu
order at each held state. Every functional check passed. Every quiet-host verdict
failed and remains failed. The other declared orders and leading-pair confirmation
are still required.

| Held tick | Backend | Average FPS | 1% low FPS | p95 frame ms |
| --- | --- | ---: | ---: | ---: |
| 9000 | Three | 30.47 | 10.93 | 66.67 |
| 9000 | raw | 37.04 | 28.35 | 33.34 |
| 9000 | TypeGPU | 37.45 | 28.01 | 33.34 |
| 9000 | vgpu | 21.84 | 19.70 | 50.00 |
| 12000 | Three | 27.73 | 8.25 | 83.33 |
| 12000 | raw | 32.30 | 19.73 | 49.99 |
| 12000 | TypeGPU | 30.68 | 19.17 | 50.00 |
| 12000 | vgpu | 19.37 | 11.64 | 66.67 |

Raw and TypeGPU show better overall cadence than Three in this order. Their order
relative to each other changes between states. vgpu has lower cadence despite
several similar GPU interval measurements; this does not identify a cause. The
recorded host noise and missing counterbalancing prevent a repeatability claim.

All runs preserve 15,560 soldiers, 1440×900 CSS, 2880×1800 framebuffer, DPR2,
standard grass and far grass, bloom, unmuted audio and default single shadows.
Both expected canonical hashes remain fixed. Camera, pose and environment time
continue; the [held-input controls](../02-held-authority/README.md) describe what
that proves and the artificial pose-replay boundary it introduces. The fixed
builds use source8643cf05 and the earlier e9f4f080… WASM, intentionally independent
of the subsequently integrated simulation optimization.

## Reading the evidence

[Round0 summary](round-0/comparison-summary.json) retains the original cadence
statistics, phase summaries, identities and complete host verdicts. GPU statistics
join each recorded frame to its submission id and use the complete, zero-missing-
query **interval union**, not the sum of overlapping passes. Median and nearest-
rank p95 use only those resolved samples. Missing samples remain counted; terminal
queries are not awaited. GPU intervals exclude queue wait and presentation and do
not explain frame pacing by themselves.

Each run directory retains the compressed raw Menu recording, trial verdict,
host observations and scenario checks, plus its manifest and exact trial log.
[The archive index](round-0/archive-index.json) records uncompressed hashes and
original scratch paths; every compressed file was round-trip verified. Original
`run.json` files remain in scratch; their report and manifest are preserved here
without committing a second copy of the full recording.

These timing reports record cameras per frame and scene statistics at startup and
termination. They do not contain common interior-checkpoint geometry/LOD counts;
the comparison protocol's corresponding evidence requirement remains open. Do
not infer identical per-frame work from equal scene identity or from this table.
There is no new visual acceptance claim or changed performance threshold.
