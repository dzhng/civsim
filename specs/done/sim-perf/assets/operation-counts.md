# Developed-window operation counts

Temporary native instrumentation counted work during ticks 1500 through
1799 of the unchanged 30,560-soldier fixture. Both repeats retained hash
`080c80b28e8ae3db`. Instrumentation has been removed from the worktrees;
its wall times are not performance evidence.

The counting system allocator was enabled only around `Battle::tick`.
Allocation and zeroed-allocation calls share a counter; reallocation and
deallocation calls have separate counters. Each repeat yielded:

| Calls in 300 ticks | Original | Metadata + scratch reuse |
|---|---:|---:|
| Allocation | 119,213 | 51,113 |
| Reallocation | 53,797 | 4,597 |
| Deallocation | 119,213 | 51,113 |

This proves fewer allocator calls, not fewer allocated bytes, lower retained
memory or a proportional speedup. The combined change retains scratch
capacity between ticks. [Original counts](allocation-original.txt) and
[combined counts](allocation-combined.txt) agree across both repeats.

[Targeting counts](target-counts.txt), also identical across repeats, show
1,508,943 queries and 366,316,282 body-distance candidates. The existing
surface-distance test rejected 100,202,968. A hypothetical axis lower-bound
test would reject 64,063,520; the probe still executed the original distance
test and never skipped a candidate.

Friendly candidates called the recording helper 36,070,740 times, of which
33,105,375 inserted or replaced a record. This makes its duplicate-owner
scan worth investigating: single-body infantry cannot repeat when buckets
are visited once, while two-body horses still need owner deduplication.
There were zero mounted attackers in this window; that count does not by
itself establish whether every friendly candidate was infantry.
