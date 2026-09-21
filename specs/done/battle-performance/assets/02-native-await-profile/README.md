# Native asynchronous presentation attribution

A20-second paused tactical trace runs the fixed raw build0ea8406d at
1440×900CSS/DPR2, canonical tick9000/hash9928381812590497427. The renderer stays
live. A main-thread Chrome CPU profile and observational WebGPU scope/submit
wrappers run together. Both perturb execution; this is attribution, not a
backend ranking, uninstrumented frame-rate result or live acceptance.

819 completed frames were captured with no frame-id gaps. All14742 scoped
results resolved without GPU errors; the observer dropped nothing, retained no
pending scopes after drainage and raised no page errors. The two independent
profile-clock anchors disagree by0.12ms, within the1ms sample interval. The
profile identifies approximate time categories, not exact per-frame causal costs.

The key distinction: median `renderAwaitMs` is13.87ms, but it contains CPU work
inside asynchronous methods. Across the20.02-second window, the CPU profile
attributes about6.90s to JS/native API frames,0.41s to unclassified program work,
0.25s to GC and12.47s to idle. While at least one scope result is pending, roughly
5.33s is attributed CPU work and3.81s is idle (about4.6ms per captured frame).
These quantities overlap and are not additive render-stage costs. Idle sampled
during a pending scope is not proof the scope caused every idle interval.

The largest attributed CPU stacks include crowd snapshot/packing, projection
planning and pose preparation. Queue submit itself is tiny (median0.005ms).
The all-scope pop-to-resolve median is0.34ms, with p95 7.72ms; summing those
nested/overlapping scopes would be false. This trace does not justify treating
the full live35–70ms async metric as avoidable GPU waiting or deleting admission
barriers. Keep the error/lifecycle contract while measuring any proposed change.

Raw profile, scope columns, submission timestamps, frame samples, periodic stats,
clock anchors and failure checks are compressed beside the summary. GPU work
continues during profiling, so this is not an isolated CPU microbenchmark.
