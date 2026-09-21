# Direct frozen-pose copy

Frozen capture copies the evaluated Float64 pose into a final-sized number array
by index, then freezes both the array and source handle as before. It preserves
the existing immutable snapshot representation and two-entry capture memo; there
is no new cache, ownership interface, history policy or mutable shared storage.

An isolated probe on100 real frozen poses found a much cheaper indexed copy than
Array.from when creating5000 frozen snapshots. The unsealed/typed variants in
storage-probe.json are diagnostic controls only, not accepted representations.
Retained array-buffer deltas show collection timing artifacts and must not be
used as exact per-snapshot memory measurements.

The [retained live trace](../06a-transition-trace/README.md) supplies the same32
ordered updates to both variants. The before bundle already includes direct blend
and channel sampling, so this comparison isolates the frozen-copy change.
Full state, source-sharing and1,493,760 playback comparisons are exact; the old
pre-optimization evaluator checks48,192 sampled poses. All84 focused tests and
web TypeScript pass. A scoped independent Codex review finds unchanged values,
layout validation, error behavior, ownership and caching. No existing tests or
thresholds changed; the trace supplies the additional differential coverage.

Three balanced ABBA blocks after warmup give median update time
510.04→401.02ms
(**21.37% reduction**). This is an additional gain
over the preceding blend/channel implementation on this bounded workload, not a
full-window FPS estimate. No source/decoding/hydration/verification work occurs
inside the measured update loop. Raw arms, runtime and input hashes are retained.
Full live and GPU/visual acceptance remain open.
