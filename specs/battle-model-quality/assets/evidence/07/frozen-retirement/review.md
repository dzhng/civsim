# Retire frozen sources without rebuilding settled clip samples

Retain this small controller cleanup for its lower allocation work and exact
playback. It does **not** pass the animated budget: every hardware run still
fails all four cadence checks. The steady CPU result is favorable; interruption
timing is mixed, and shared-machine activity prevents a clean causal speedup claim.

## Contract

Once a blend completes, playback already samples its current track directly and
ignores the stored source. Only a frozen source owns a numeric pose that needs
retiring. Repeatedly constructing a complete blend just to replace an ignored
clip source creates unnecessary objects. Retirement now replaces only a frozen
source, on the same copied lane and at the exact original clamped-weight boundary.
The shared weight expression retains its original operation order and `=== 1`
test. No public shape, animation duration, approximation, cache, storage limit,
simulation behavior or GPU path changes.

## Exactness and regression

Against `42d37869`, the existing pinned-source probe compared396 exact playback
and posed outputs. A separate Node diagnostic compared9,000,000 complete public
playbacks and matching `snapshotBytes`:30k mounted observers across100 ticks in
each of three repetitions, including repeated release/run interruptions.
[CPU samples](cpu.json) exclude playback sampling/assertion time, but their
allocations can affect later collection. This is a diagnostic, not browser timing.
Its three old/new update medians were8.069/7.054,8.194/6.850 and8.176/7.442ms;
p95 was17.506/17.392,18.842/17.610 and19.551/14.094ms.

A bounded follow-up compared36 playback results around completion at three
different start times, including rejected batches after an earlier lane would
retire. Both versions kept the previous playback and owned snapshot bytes after
the failure. These are sampled boundary cases, not an exhaustive floating-point
proof. The source review confirms the original weight expression is unchanged.

The48 existing timeline/mounted/packing/replay tests and TypeScript check pass.
Independent read-only source review found no defect in atomic failure,
consumer-held immutable snapshots, overlay exit or the completion boundary.
No test expectation or image baseline was weakened or changed.

[Canonical browser regression](temporal.json) passed675 checks, with no page
errors and exactly zero changed pixels in all40 existing images. Root inspected
every image in recorded order: the foot fixture changes gait/arm pose then falls;
the mounted fixture retains its rider action before the whole-body fall; the gray
fixture exercises layered motion. These intentionally blocky fixtures establish
transport continuity only, never model quality or locomotion acceptance.
The [foot](temporal-4.gif), [mounted](temporal-7.gif) and
[layered fixture](temporal-41.gif) GIFs are review derivatives of those matched
PNGs, ordered by the report at200ms per image, **not real-time motion playback**.
No visual change is claimed and no new art critique is inferred.

## Matched hardware old/new/old

All three runs used the existing production `battle-model-budget` scene on
Chrome152.0.7977.77, hardware WebGPU, headless, Apple M5 Pro20-core GPU,
5120×2880 at DPR1.30k mounted fixtures,67 bones, four influences,
2,304/576/144 triangles,947,112 animation bytes and three1024px maps match
exactly. Closest gameplay camera: distance3.5, pitch0.24, yaw−π/2, FOV0.85.
Main view contains6,113 near meshes;23,887 bodies are shadow-only, not impostors.
All30k retain a coarsest shadow caster and a palette.

[Summary](summary.json) was generated with assertions that every row matches
asset/detail, camera, dimensions, main/shadow histograms, palette fields, draw
calls and map size. Each row has60 warmup and180 measured frames. Each timed
row has180 unique GPU frame IDs, all matched to its CPU samples. GPU-queue
elapsed includes submission gaps; do not add it to CPU time. Allocation checks
remain a separate phase, not distinct-history frame timing.

| Run | Steady CPU median/p95 | Interrupted CPU median/p95 | Steady/interrupted timed GPU median | Control RAF p95 steady/interrupted |
| --- | --- | --- | --- | --- |
| Old before |12.865 /20.425 |13.875 /25.235 |23.611 /23.668 |50 /50 |
| Cleanup |11.190 /19.045 |15.670 /28.650 |23.435 /23.663 |50 /49.995 |
| Old after |12.560 /22.015 |15.945 /28.920 |20.805 /21.040 |33.335 /33.335 |

CPU columns are uninstrumented control frames, milliseconds. Timed CPU and all
stage values remain in the summary/raw reports. All timed RAF p95 values are
approximately33.335ms and **fail33ms**; they are not rounded into passes.
The cleanup's steady timed CPU median/p95 is11.105/16.295ms versus
13.385/20.465 and14.655/23.215ms. Its interruption control is worse than the
first old run, while its timed interruption CPU is lower than both old runs.
This is not a universal interruption improvement.

Preserved raw reports: [old before](a-before.json), [cleanup](b.json),
[old after](a-after.json). All exited1 for the same four cadence failures, with
no page errors. No retries were discarded or performed to seek a green result.
Wall-time advanced ticks differ; these are matched workload policies, not
identical pose histories over time.

Process/source records: [before](a-before-environment.json),
[cleanup](b-environment.json), [after](a-after-environment.json).
The2026-09-07 run spans10:26:48–10:29:54UTC. Our art lane held its new Blender
build during the comparison, but the machine was not idle: virtualization reached
351% CPU in the first run, unrelated compiler work appeared before/after, and
filesystem events/backup work appeared in the last run. Nothing outside this
task was stopped. The faster last-run GPU queue despite slower CPU is another
reason not to over-attribute the result.

## Review and next action

Shape review: two owner-local helpers remove repeated work,14 added/8 deleted
production lines including two comment lines; no dependency, flag or additional
runtime owner. Code review preserves copied histories and immutable payloads.
Docs keep this evidence separate from the open envelope. Choice audit found no
new scope or architectural policy beyond the delegated exact-cost cleanup.

Keep07 open. Remaining cost is chiefly preparation/upload and cadence in this
workload; do not infer an art triangle limit or accept the detailed candidates
from this pass. Medium/heavy authoring continues independently.
