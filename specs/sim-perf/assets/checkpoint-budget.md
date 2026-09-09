# Native checkpoint: budget remains red

The integrated contact metadata and scratch changes, using the profiler
harness from `89cd352f`, ran the uninstrumented native gate on 2026-09-09.
All task-owned correctness jobs and browsers had stopped before this run.
Other applications remained running; this is not a controlled bare-machine
experiment or a before/after speedup estimate.

| Window | Repeat means (ms) | Median of repeat means (ms) |
|---|---|---|
| 30,560 soldiers, opening contact | 25.875 / 22.707 | 24.291 |
| 30,560 soldiers, developed combat | 39.364 / 38.649 | 39.006 |
| 60,060 soldiers, opening contact | 59.916 / 55.289 | 57.603 |

The gate exits 1. Opening contact meets 25 ms; developed combat does not.
The developed window retains 30,280 living soldiers and at least 3,344
living fighters, with the unchanged hash `080c80b28e8ae3db` in both repeats.
The opening 30k-to-60k ratio is 2.371. The original gate's much noisier
measurements do not justify a percentage-improvement claim.

[Raw gate output](checkpoint-gate-2026-09-09.txt) includes every repeat,
standard deviation, population, interval and fingerprint. The next decision
requires a developed-window stage profile; neither sleeping nor parallelism
has been implemented or declared necessary solely from an opening profile.
