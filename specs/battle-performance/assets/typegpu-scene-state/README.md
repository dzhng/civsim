# TypeGPU scene state integration

Before integration, the actual Menu build atf440191a renders all15560 soldiers
but returns no depth, seating measurement or pose diagnostic; model reload rejects
because the facade treats TypeGPU as a comparison backend without crowd ownership.
[The baseline report](baseline.json) records these observed gaps with no page
errors and zero tracked bytes after disposal. This is an expected failure of the
capability requirement, not an acceptance pass.

The Opus scene pass is still active. Root prepared the existing whole-population
seating and staged-reload GPU checks in `throwaway/typegpu-scene-hardware/` for its
fixed build after review. No post-change browser claim exists yet. These checks
will not establish drawn-foot placement or camera/performance acceptance.
