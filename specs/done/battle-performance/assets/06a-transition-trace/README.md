# Identical live observation replay

The actual Menu battle supplied32 consecutive updates at ticks13357–13388,
with15,560 soldiers per update, after230seconds of its contact camera tour.
The capture preserves pre-update histories, completed boundaries, catalog clip
references, frozen-source aliases, special numbers and snapshot immutability.
The compressed trace and its fingerprint are retained here. Capture is intrusive
and supplies **no FPS measurement**. Its128MiB cap limits encoded payload, not
peak process memory; it retained122,359,881 encoded characters.

Two bundles use the same ActionTimeline and dependencies, changing only the
local-pose implementation: before both optimizations versus direct blending plus
direct channel sampling. Runtime, launch flags and source/bundle hashes are in
timing.json. Decoding reconstructs the whole reference graph; no JSON-only
history clone or presented-frame replay substitutes for actual observations.

All full histories, frozen payloads, sharing partitions, snapshot bytes and
1,493,760 playback values agree exactly after each call at before/after/interior
boundaries. The retained old evaluator additionally checks48,192 poses, sampling
every31st soldier. Both variants begin from the same decoded seed; this capture
does not include an independently recorded final live timeline checkpoint.
This proves equivalence on the retained inputs, not full GPU motion acceptance.

After warmup, three balanced before/after/after/before blocks run only update
calls. Hydration, decoding, comparison, pose sampling, rendering, adapter
conversion and crowd endpoint copying are excluded. GC within each update
window is included; forced GC precedes each timed arm. All other owned jobs were
terminal. Median wall time falls from629.86ms to489.63ms (**22.26%**), outside
all observed arm ranges (before627.69–639.74ms, after487.95–505.02ms).
GC collection duration also falls modestly, from97.89ms to89.80ms; duration is
not allocated byte volume. Exact timing values are in timing.json.

This is a bounded publication-preparation gain. It does not replace a complete
live benchmark, simulation-throughput gate, moving-image verification, or the
final equation requiring optimizations to exceed the cost of default shadows.
