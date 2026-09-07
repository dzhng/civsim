# Sampled upper-body wrapper reuse

Retain the owner-local removal of one redundant non-exiting upper-body wrapper.
The fresh blend is already private to this returned playback; copying its identical
fields adds no isolation. Exit-to-base composition retains its existing copy.
No pooling, cross-frame sharing, cache, arithmetic, clip policy, frozen storage,
simulation, source geometry or renderer changes are introduced.

This is allocation reduction with exact-output CPU evidence, **not a measured
cadence improvement or accepted art envelope**. Median sampling time is mixed.
No hardware or browser capture was run, requested, or inferred from this result.

## Controlled experiment

Baseline is `fec4a02e`; candidate differs only in `ActionTimeline.playback`.
Both modules were loaded through the same Bun TypeScript transpiler and Function
loader, sharing the unchanged imported pure helpers. Bun1.3.14 on macOS arm64;
the reported Node compatibility version is24.3.0, not the execution engine.
The production synthetic mounted fixture uses67 joints, four influences and
doubled authored-key intervals. No textures or geometry are rendered.

The existing staggered observation helper and the synchronized scene's release
schedule supply observations. The latter's ordered running hint is irrelevant
to the current measured-speed timeline: speed remains1m/s, matching the scene.
Nine bodies over60 integer observations, each sampled at tick+0.5, yielded:

| History | Soldier samples | Upper overlays | Non-exiting overlays |
| --- | ---: | ---: | ---: |
| Synchronized |540|171|126|
| Staggered |540|99|54|

One allocation is avoided per non-exiting overlay. At30k bodies these proportions
average7,000 and3,000 avoidable wrappers per sampled frame, respectively. These
are fixed-schedule diagnostic proportions, not measured live battle frequencies.

The differential probe compared4,050 complete public playbacks and evaluated
local poses (two histories, nine bodies,75 observations, three fractions).
Complete prepared packing records match exactly, including controls, uploads,
slot counts and resident counts. Discard/commit paths and a rejected observation
batch preserve matching state. A bijection preserves46 frozen source identities
across samples and retirement. Every retained public result remains exactly
unchanged after subsequent entry, interruption, exit and death; both controllers
finish with zero owned snapshot bytes. This is sampled equivalence, not an
exhaustive proof or a new approximate-pose tolerance.

## CPU result

[Raw output](cpu.jsonl) preserves all samples and counts. One bounded run used
four alternating AB/BA pairs,30k bodies,20 warmup and80 measured frames per arm.
Only `sample()` is timed. Observation generation/update is outside that region,
but its allocations and previous exactness checks can affect subsequent GC.
No explicit collection or rerun-until-green was used. Machine-wide activity was
not isolated or profiled; other project lanes were active. This is not browser
production timing or the capped wall-time hardware workload.

| Pair | A median/p95 ms | B median/p95 ms |
| --- | --- | --- |
| AB |1.7295 /4.4585|1.6235 /3.5339|
| BA |1.5997 /4.1570|1.8302 /3.8469|
| AB |1.7086 /4.4528|1.7163 /3.2424|
| BA |1.6276 /4.0538|1.7709 /3.7951|

Candidate medians improve in one pair and regress in three; p95 improves in all
four. Retain the simpler exact allocation path without claiming a general speedup.
This result does not warrant spending a hardware slot by itself. The existing
lower-density cadence failures, separate standing30k gate and33ms threshold remain.

## Verification and review

The extended retained-playback test passes on both original and candidate source.
It is a nonregression/equivalence extension, not a red-to-green bug fix.
All64 tests in the existing timeline, mounted timeline, packing, raw palette,
replay and synthetic fixture files pass, and the full web typecheck passes.
No existing expected value or baseline was changed.

Shape review: one existing sampling owner,3 replacement lines for4, no new
surface. Diff review: fresh upper wrapper only, exact exit branch, no shared
source mutation. Docs are limited to this numerical evidence leaf; root owns
the slice pickup and global choices. Bundled Codex0.153.4 independent review
session `01a07d21-7fe4-7ab3-bf79-15be8db00188` completed exit0 and found no
actionable defects. Its attempted test execution was sandbox-blocked on linked
dependencies; the64 passing tests and typecheck above were run independently by
the implementing agent, not credited to that reviewer.

The temporary differential probe was removed after collecting its results.
Its measured SHA256 was
`f95347bab345edfbe2663fe2096abc700789be1cfb53ad5a58ac0e7ce9986308`.
The pinned baseline and focused source diff are the durable implementation
comparator.

Test ledger: `paused mounted playback sampling is deterministic and does not
mutate retained poses` previously checked retained evaluated pose through a
repeated release; it now also checks exact retained public values and evaluated
pose through exit, retirement and death. Both versions pass these assertions;
the contract is unchanged and strengthened. No test was re-pinned, deleted,
weakened or flipped; no unit statistics moved.
