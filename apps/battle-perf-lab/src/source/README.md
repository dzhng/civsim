# Source timestamp ranges

This lab configuration observes the timestamp pairs Three already reads. It adds
no queries, command buffers, submissions, buffer maps or polling. The existing
source inspector remains the sole owner of submission identity, pass labels,
retention and completion. Ordinary source builds do not enable the tap: their
legacy pass sums remain diagnostics and interval metrics are unavailable.

The transform is deliberately private, pinned-Three instrumentation debt. It
requires the exact SHA-256 of the installed `three.webgpu.js`, locates only the
WebGPU pool class, and inserts one CPU callback after its existing timestamp-pair
read. The WebGL pool and query algorithms remain untouched. Remove this transform
when Three exposes raw timestamp pairs through an upstream supported API; any
upgrade must otherwise revalidate source identity and paired rendering controls.

The device-local ledger retains at most 4,096 pairs. The source inspector consumes
pairs by query kind and exact UID, preserving independently resolving pools.
Missing, invalid, overwritten or overflowed ranges cannot produce complete range
metrics. Overflow invalidates that device's range stream until recreation.
Disposed devices ignore late callbacks. No device methods are called by the
ledger.

Observed span includes gaps; observed union merges overlaps. Both describe query
intervals, not GPU busy time. The total is calculated directly from all pass
ranges, never by adding stage unions. Bigint arithmetic precedes conversion to
milliseconds. Legacy sums remain visibly separate diagnostics.

CPU checks cover exact source identity, one callback-only transformation, legacy
untapped behavior, independent pools, overlap aggregation, missing/invalid/
overflowed pairs, pruning and disposal. The independent source review found no
actionable issues. A source image/count control with tap enabled is still required
before accepting hardware range comparisons. No visual or timing acceptance is
claimed by the CPU checkpoint.
