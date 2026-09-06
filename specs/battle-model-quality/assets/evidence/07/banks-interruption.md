# Interruption preparation: CPU attribution

The concrete hot owner is `planPhotorealCrowdLods`, not a demonstrated frozen-bank
transfer bottleneck. In this bounded profile its inclusive sampled CPU time is
623.791 ms across 180 measured frames (about 3.47 ms/frame). Playback packing is
another 297.906 ms; this profile does not justify treating all `uploadMs` as GPU
traffic or moving directly to a new GPU pipeline.

## Scope and evidence

The [capture script](banks-interruption-profile.mjs) runs the existing mounted
30,000-body, close gameplay, 67-joint, four-influence, 1024-map workload at source
revision `f8a6b49c`. The worktree also contains evidence-only commit `7500bc5b`.
Production source is unchanged. The evaluated diagnostic harness selects only
interruption/control, omits the separate allocation exercise, records frame
start timestamps and brackets CPU sampling. These are diagnostic changes, not
an acceptance run. No clock, renderer, threshold or asset behavior is changed.

Hardware Chrome uses the existing hardware flags, viewport 1280×800 and owned
port 5177. Sampling begins before the initial draw and the unchanged 60-frame
warmup, then ends after 180 measured frames. First measured RAF is 16.660 ms,
with one advanced tick; the earlier profiler-startup gap is absent at that
boundary. Warmup still follows the real clock and is not a fixed playback-state
comparison with another run.

One browser profile was attempted and completed. Before it, one server launch
from the wrong working directory emitted dependency-resolution warnings; that
server was stopped before browser launch and restarted from `web`. No dependency
was changed. The measured page reports no errors and no renderer warnings,
submits all 30,000 bodies, and includes 48 rider-overlay frames. The diagnostic
cadence check still fails at 33.330 ms p95. All other emitted checks pass.
The wrapper's process exit is zero because it collects failed checks without
throwing; the failed cadence check is retained in the report, not hidden.

The [raw profile](banks-interruption.cpuprofile), [frame report](banks-interruption.json)
and [summary](banks-interruption-summary.json) are retained. The
[summarizer](banks-interruption-summarize.mjs) clips 1 ms sample intervals to
measured frame/phase intervals using the NavigationStart clock origin. Attribution
near a phase boundary is approximate: samples can straddle adjacent work.
Inclusive rows overlap and must not be added. GC location does not identify the
allocation that caused collection. Warmup and idle samples remain in the raw
profile but are excluded from measured-frame attribution.

To reproduce, run Vite from `web` on port 5177, then run the capture script with
Node from the repository root, followed by the summarizer. The scripts own the
exact diagnostic configuration and output adjacent files. Reserve exclusive GPU
access first. No further browser/GPU work was performed after this capture; the
browser and owned server were closed and GPU ownership released.
Integration review corrected the reproducer's fixed revision label: future
captures record the actual checkout and modified source paths. The retained
original report still describes its measured source; it was not rerun or edited.

## Measured owners

The measured CPU brackets total 2814.395 ms. The `drawInstances` bracket named
`uploadMs` totals 1457.670 ms, with median/p95 7.570/10.940 ms; it includes CPU
world preparation, culling, LOD, grouping, packing and submission.

| Owner | Inclusive ms in measured frames | Approximate ms inside upload bracket |
| --- | ---: | ---: |
| LOD planner | 623.791 | 563.562 |
| Palette upload, including packing and compute submission | 461.006 | 461.006 |
| Playback packer `prepare` (nested in palette upload) | 297.906 | 297.906 |
| Native `writeBuffer` across consumers | 199.682 | 162.397 |
| Three compute CPU call (nested in palette upload) | 146.887 | 146.164 |
| Garbage collector | 337.861 | 123.559 |

The planner's per-instance map callback alone accounts for 359.680 ms self time,
the largest named self owner. This supports CPU preparation as the first target.
Packing and queue writes are material secondary work, but queue writes do not
dominate the upload bracket. GC is material too (12% of measured CPU time), yet
cannot be blamed specifically on planner allocation from this profile alone.
The 1 ms sampler is not precise enough to assign savings to individual lines.

## One bounded next change, not implemented

Give the existing LOD planner caller-owned reusable result storage for main and
shadow assignments and visibility, updated in place over the active count.
The current planner creates two assignment objects per body per call: 60,000
objects per frame, or 10.8 million over this 180-frame window, as well as result
arrays. Reusing that storage is a concrete allocation-removal candidate in the
measured hot owner, not a claim that all its CPU time or all GC is removable.

Keep the same transformed bounds, per-view frustum tests, projected-size
arithmetic, independent main/shadow hysteresis, shadow floor and counts. Do not
cache decisions across frames, drop bodies, quantize values, assume identical
poses, change the controller or weaken cadence. The owning crowd layer already
retains the prior main/shadow levels; a reusable result should have one explicit
owner and defined shrink/growth behavior, not a second planner path.

Before implementation, pin exact old/new output equivalence across moving
cameras, multiple views, threshold crossings, transformed corpses, mounted/foot
bounds, shrink and regrowth. A focused CPU comparison must then establish whether
the allocation removal helps. Only an unchanged full hardware gate can establish
acceptance; this diagnostic neither closes 07 nor proves a speedup.
