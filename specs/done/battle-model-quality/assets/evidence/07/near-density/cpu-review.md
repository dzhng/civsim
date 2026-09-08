# Lower-density CPU attribution

A single1ms CPU sampling profile of the existing5K interruption/control loop
finds substantial LOD planning and animation observation work, with garbage
collection overlapping slow frames. It does not identify a verified optimization
or establish why uninstrumented cadence fails.

The diagnostic uses the exact lower-density asset, camera, dimensions, texture
size, main/shadow tier counts, palette demand and draw-call count from
[the A/B/A comparison](review.md), checked against its B report. Only the
interruption/control row runs; the allocation phase and other measurement rows
are deliberately omitted. Profiler startup occurs before60 warmup frames,
followed by180 measured frames. No production code or acceptance gate changes.
Execution used root`ce5c92c3` and the same Chrome152 hardware setup; the source
hashes recorded for the A/B/A still match. The bounded process completed with
exit0 after collecting its report; that is not a claim that its cadence passed.

The [raw report](cpu.json), [CPU profile](cpu.cpuprofile) and
[derived attribution](cpu-summary.json) retain the evidence. Profile timestamps
are aligned to the browser's NavigationStart and each frame's performance.now
start. Attributions apportion1ms sample intervals across actual CPU-frame spans;
they are approximate, not precise function timers. Inclusive stacks overlap
and must not be added together. Warmup and time outside those spans are excluded
from the listed function totals.

Across2,777.52ms of measured CPU frame spans, sampled inclusive work is about
619.72ms in LOD planning,439.22ms in action observation,280.41ms in action sampling
and272.00ms in playback packing. The profile attributes287.82ms to garbage
collection within those spans. The slowest frame takes47.94ms, with15.37ms of
sampled GC overlap; its observation/sample/upload phases are22.10/11.72/11.85ms.
This is evidence to investigate allocation sources, not proof that GC causes
every delayed frame or that any particular allocator is responsible.

The first measured RAF interval is33.33ms; profiler startup is no longer inserted
at that boundary as it was in the older interruption diagnostic. Profiling still
changes execution and scheduling throughout the loop. The raw cadence check
remains red, and zero page errors/renderer warnings do not make the timing an
acceptance result. Task GPU jobs were serialized, but machine-wide CPU/GPU work
was not isolated or continuously measured during this profile.

Review found no new runtime owner, changed test behavior or architectural choice.
The existing measurement scope covers this diagnostic; only evidence ships.

Next inspect allocations in the existing observation and sampling owners while
preserving immutable interruption sources. Do not reintroduce the rejected
caller-owned LOD-storage experiment merely because LOD appears high in a profile.
Any change requires exact transport/temporal proofs and an unprofiled matched
hardware comparison before crediting it. No additional renderer mechanism is
justified by this measurement alone.
