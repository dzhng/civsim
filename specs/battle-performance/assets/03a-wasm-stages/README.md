# Exact-WASM stage attribution

The optional timing build matches the canonical hashes at9000,9300 and9308.
[Stage results](summary.json) and [raw recording](raw.json.gz) preserve the
instrumented contact window. Combat targeting averages13.31ms, separation
projection6.03ms, soldier steering3.57ms, weapon repulsion2.97ms and body
pairs2.09ms per tick. These are exclusive scope times, including instrumentation
effects, not release timing or browser throughput. The uninstrumented current
binary's contact control is retained in the adjacent current-kernel evidence.

This ranks candidate work: investigate targeting and projection scans while
preserving visitation order and exact simulation results. Later heavier combat
and full-browser verification remain required; do not extrapolate this short
window into a live performance claim.

Native attribution was rejected before reporting stages. Its copied opening
matches WASM hashes at0 and1 but diverges by30; see [native](native-rejected.log)
and [WASM](wasm-fingerprints.log). The rejected native canonical mode was removed.
The cause of cross-target divergence is not established, and neither this pass
nor the next optimization may change gameplay to force those hashes to agree.

The timing feature supplies a monotonic host clock to the existing scope owner.
WASM module startup installs it before any Game entry point. Native tools retain
Instant. Nested scopes subtract children; [focused tests](clock-tests.log) verify
exclusive time, reset, averaging and rejecting empty windows. No dependency was
added. The stage run predates only the empty-window assertion; its positive308
sample count exercises the same timing path.

A fresh [default build comparison](default-build.json) has identical code,
imports, exports and other non-data sections to current production. Sixteen data
bytes differ, consistent with shifted source-location metadata; therefore full
binary identity is **not** claimed. Production WASM was not replaced. Both
independent reviews found no blocking issue; the zero-count edge was fixed.

A [duplicate-bucket prefilter candidate](rejected-filter.json) preserved all
canonical checkpoints but showed no selective timing benefit in the single
instrumented comparison. It was reverted. [Raw candidate data](rejected-filter-raw.json.gz)
remains evidence of the rejected experiment, not proof of a causal slowdown.
