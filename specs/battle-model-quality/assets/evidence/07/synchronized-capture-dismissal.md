# Synchronized interruption capture: important dismissal

**Do not prioritize joint-pose evaluation as the synchronized interruption-tail
fix.** The existing exact two-entry reuse already reduces this workload to one
evaluated frozen pose per transition tick. No production change is proposed.
This leaves per-body history, comparison, playback construction and packing work;
the probe does not attribute their individual costs.

The hypothesis was that the synchronized 30,000-body, 67-joint burst evaluates
30,000 complete frozen poses on the CPU. The current production chain is
`BattleCrowd.draw` → `ActionTimeline.update` on changed observations → `sample`
per render → `SoldierPosePalette.upload` → `PlaybackPacker.prepare`, using
retained control storage. Frozen evaluations occur only on misses of
`frozenPoseCapture`'s update-local two-entry exact comparison. No history or
phase approximation is involved.

The CPU probe starts at `f2de9e391c4de1e154e471acc440ba27e03bffdc`. It uses the
real synthetic mounted fixture with the banks-interruption parameters:
subdivisions `[3,1,0]`, eight joint copies, four influences, two key subdivisions
(67 joints). It copies the current budget observation recipe and replays every
integer tick 0–60, sampling at the tick and half tick. This deliberately complete
cycle includes every transition; it does **not** reconstruct the profiler's RAF
schedule, warmup history, dropped observations, culling or GPU work. Texture
generation is absent because neither controller nor packer consumes it.

| Workload | Freeze requests | Actual pose evaluations | Consumer result |
| --- | ---: | ---: | --- |
| 9 synchronized bodies, ticks 0–60 | 90 | 10 | One new 3,216-byte pose per transition |
| 30,000 synchronized bodies, ticks 0–60 | 300,000 | 10 | Identical upload count/payload size |
| 9 staggered bodies, ticks 0–24 | 36 | 22 | Nine new poses each at ticks 12 and 13 |

Synchronized transition ticks are 4,10,11,14,15,18,23,24,25,60. Each has one
evaluation and one upload, with no new upload at its half-tick sample. The packer
retains at most two frozen identities in that cycle. One 67-joint frozen pose
contains 670 scalar values (5,360 numeric bytes before packing); the GPU payload
is 67×48=3,216 bytes. Thus the alleged 30,000×67 evaluation amplification is
absent here. The 30,000 freeze requests and exact comparisons still happen on
each transition, and each prepared crowd still contains 600,000 control words.

The staggered positive control is important: interleaving three histories
exceeds the reuse window, yielding nine evaluations at each of ticks 12 and 13,
and 18 retained sources. Exact evaluation remains O(N×joint work) when histories
do not reuse; this dismissal applies to the synchronized cadence failure only.
It is not permission to remove exact distinct poses or reinterpret storage
admission as timing acceptance. Source retirement provides forward progress;
there is no retry loop or accumulating cross-update cache at this owner.

The [probe](synchronized-capture-probe.ts) changes an in-memory timeline copy
only to count requests/misses and bracket miss capture. It compares against the
untouched imported controller through the real packer: **294 complete prepared
frames, 73,230,960 control words and 1,548 exact small-scene posed outputs**
match. Prepared-frame equality includes uploads/slots/payloads, residency,
required slots and submitted count; both sides commit every frame. Small cases
also compare complete playback values. No expectations or thresholds changed.
The upper-mask control uses the same fixed valid word offset on both sides;
posed-output checks use the fixture's real joint mask. No GPU evaluation occurs.

[Recorded counts](synchronized-capture-counts.json) retain all transition rows,
the source SHA256 and CPU durations from the successful run. Bun 1.3.14,
Darwin arm64. The 30k lane's ten miss captures total 2.035ms in this instrumented
run, versus roughly 6.7–15.7ms for individual transition updates. These are
single-process diagnostic timings, not an A/B optimization result, browser
cadence evidence, or a claim of a quiet device. The count-based dismissal does
not depend on those durations. Existing banks/interruption-window browser
profiles remain the preparation-attribution evidence; their GC overlap does not
identify a specific allocation cause.

Reproduce from the repository root with:

```sh
bun specs/battle-model-quality/assets/evidence/07/synchronized-capture-probe.ts
```

Two initial module-loading attempts failed before measurements; the successful
probe evaluates transpiled instrumented source with the unchanged real imports.
No source file is patched at runtime. All CPU processes completed, no live tool
sessions remain, and no browser, GPU, simulation or root-worktree edits occurred.
Disposition: archive this dismissal and continue preparation attribution before
proposing another optimization. Slice07 remains open.
