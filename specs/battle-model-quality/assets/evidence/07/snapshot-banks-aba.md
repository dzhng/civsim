# Frozen-bank hardware A/B/A repeat

The unchanged 33 ms cadence gate fails before and after parity banking. Both
pre-change repeats reproduce the interruption failure, so this experiment does
not attribute that failure to banking. Banking does admit the exact 60,000-source
allocation workload that both pre-change runs reject. Performance acceptance
remains open; this is not closure of 07.

## Reproduction and complete outcomes

Runs were sequential with exclusive GPU ownership, hardware Chrome on
`apple / metal-3`, in separate worktrees. A is `eef5001a`; B is `f8a6b49c`.
The harness, synthetic fixture and controller are identical between revisions.
No renderer, harness, threshold, library or model changes were made for this
repeat. Each timing row retains 60 warmup and 180 measured frames.

| Run/report | UTC report time, 2026-09-06 | Exit | Failed checks |
| --- | --- | --- | --- |
| [A1](snapshot-banks-aba-a1.json) | 17:35:39.688 | 1 | Both interruption cadence gates; staggered source admission |
| [B](snapshot-banks-aba-b.json) | 17:36:53.065 | 1 | Both interruption cadence gates |
| [A2](snapshot-banks-aba-a2.json) | 17:38:04.885 | 1 | Both interruption cadence gates; staggered source admission |

All three report no renderer warnings and no page errors. All timing rows submit
30,000 bodies. Before A1, one shell launch failed because the scratch log
directory did not exist; it produced no browser run or measurements. Creating
that directory and repeating the unchanged command yielded A1. There were no
other attempted runs or discarded reports. Owned servers were stopped after
measurement; the root server on port 5174 was untouched.

The exact command below ran from each revision's worktree. A used port 5176,
B used 5177; only the target port and report filename varied:

```sh
BUDGET_FIXTURE=mounted BUDGET_SOLDIERS=30000 BUDGET_FRAMES=180 BUDGET_WIDTH=1280 BUDGET_HEIGHT=800 BUDGET_CAMERA=gameplay BUDGET_STOPS=close BUDGET_DETAIL='{"subdivisions":[3,1,0],"jointCopies":8,"influences":4,"keySubdivisions":2}' BUDGET_TEXTURE_SIZE=1024 VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome VERIFY_URL=http://127.0.0.1:5176 SCENARIO_REPORT_JSON=/Users/david/dev/game-snapshot-banks-aba/specs/battle-model-quality/assets/evidence/07/snapshot-banks-aba-a1.json node web/scene.mjs battle-model-budget
```

## Timing comparison

Milliseconds, median/p95. Quantiles follow the existing harness: sorted sample
at `min(n - 1, floor(n * fraction))`. Stage quantiles are not additive; queue
elapsed time is not an isolated GPU pass duration.

| Row | A1 CPU | B CPU | A2 CPU | A1 RAF p95 | B RAF p95 | A2 RAF p95 |
| --- | --- | --- | --- | --- | --- | --- |
| Steady/control | 12.685/22.875 | 13.450/21.510 | 13.445/20.660 | 16.670 | 16.670 | 16.670 |
| Steady/timed | 12.850/23.235 | 14.715/26.100 | 13.500/24.700 | 16.670 | 16.670 | 16.670 |
| Interruptions/control | 15.020/27.030 | 15.925/29.665 | 15.900/27.830 | 33.330 | 33.335 | 33.330 |
| Interruptions/timed | 15.340/27.430 | 17.435/30.445 | 16.220/30.705 | 33.330 | 33.335 | 33.335 |

| Interruption stage | A1 control | B control | A2 control | A1 timed | B timed | A2 timed |
| --- | --- | --- | --- | --- | --- | --- |
| Observe | 3.065/10.705 | 3.465/11.345 | 3.590/10.850 | 3.155/10.705 | 3.800/11.140 | 3.760/12.005 |
| Sample | 1.520/3.865 | 2.020/3.655 | 1.935/4.485 | 1.210/3.735 | 2.105/4.085 | 1.990/4.525 |
| Build | 0.760/3.730 | 0.930/1.295 | 0.920/1.235 | 0.785/3.515 | 1.000/1.820 | 0.950/1.205 |
| Upload | 7.750/10.985 | 8.305/12.170 | 8.440/12.195 | 7.850/10.960 | 8.900/13.795 | 8.435/12.945 |
| Render | 1.180/1.740 | 1.585/1.835 | 1.340/1.875 | 1.175/1.790 | 1.695/1.970 | 1.335/1.865 |
| GPU queue elapsed | — | — | — | 16.409/26.822 | 17.406/30.051 | 16.613/30.635 |

A1 to A2 already shifts interruption CPU medians by about 0.88 ms and upload
medians by 0.59–0.69 ms. B's control CPU nearly matches A2 and its control upload
falls between A1 and A2. B's timed CPU is 1.215 ms above A2, including 0.465 ms
more upload and 0.360 ms more render; one B run cannot establish a regression.
The real-clock playback mix also varies: interruption overlay frames are
37/45/40 for control and 31/42/41 for timed, out of 180. The timed GPU queue p95
is lower in B than A2 despite the higher median.

## Exact admission is a separate observation

Timing interruptions retain only two snapshot slots and a 10,720-byte controller
high water in every run. The independent-history allocation exercise occurs
after timing, so none of these timing rows measures 60,000 distinct sources.

At allocation tick 13, all runs generate 60,000 exact sources. Both A runs reject
a 192,960,000-byte snapshot binding against the device's 134,217,728-byte limit.
B admits all sources in two banks of 30,000 poses, 96,480,000 bytes each, without
dropping any submitted bodies. The output fits at 128,640,000 bytes. The device
also reports `maxBufferSize = 268435456` in every run.

B's allocation observer reports 355,855,444 live bytes and 583,375,460 peak live
bytes, including overlapping replacement generations. A's 259,375,444-byte peak
ends with rejected work, so these totals are not equivalent completed-work
comparisons. Banking resolves the per-binding rejection, not every memory limit.

The next diagnostic should be a bounded CPU profile of interruption upload
preparation and submission on this unchanged workload, distinguishing controller
work, packing, queue writes and compute submission before proposing an
optimization. Preserve the existing gate and report profiling overhead separately.
