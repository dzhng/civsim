# M9a — correlate GPU cost with the frame actually presented

Precedes M9 diagnostics/cutover. Keep the production constructor unchanged.

The native observer already reports complete GPU submission spans and interval
unions. The facade reports null GPU time, and consumers cannot safely invent a
frame total from overlapping pass sums or an unrelated latest event. Join actual
successful presentation receipts to their own submission events.

The final sample identifies rendered frame and GPU submission, with observed span
and union in milliseconds. The selected renderer's `performance.gpuTimeMs` is the
**complete submission span**, including compute and inter-pass gaps, with explicit
metric identification. It is not source Three's uncorrelated render-only sum.
No completed sample means null, never zero. Exclude incomplete/dropped/invalid
measurements and readiness-only submissions. Out-of-order readbacks cannot replace
a newer presented-frame sample with an older one. Repeated frozen frames do not
invent submissions. Keep pending receipt/event retention bounded and observable;
query disablement and cursor gaps must remain explicit.

A small frontend timing owner beside the existing battle presentation API can own
the join and survive the facade's move into production. Do not add a package-wide
copy of source renderer stats, move unrelated lighting/depth/asset owners, or add
new query/readback work. The existing observer remains authoritative; no waits
for GPU completion may be introduced into presentation. Keep benchmark raw event
exports and cancellation/lifecycle behavior unchanged.

Verify delayed and out-of-order completion, incomplete/drop/gap cases, disabled
queries, frozen receipts, readiness-only work, bounded eviction and finite valid
measurements with meaningful event/receipt tests. Wire the actual native facade;
root verifies hardware sample identity and the query-disabled null result. The
remaining content counters and scene-read migration are the next separate pass.
At that pass, preserve every30k/33ms/content assertion and count distinct completed
raw frame identities rather than repeatedly sampling a cached result.
