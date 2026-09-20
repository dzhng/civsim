# TypeGPU scene state integration

Before integration, the actual Menu build atf440191a renders all15560 soldiers
but returns no depth, seating measurement or pose diagnostic; model reload rejects
because the facade treats TypeGPU as a comparison backend without crowd ownership.
[The baseline report](baseline.json) records these observed gaps with no page
errors and zero tracked bytes after disposal. This is an expected failure of the
capability requirement, not an acceptance pass.

[The initial candidate](initial-candidate/README.md) passes Menu lifecycle checks,
but an independent P2 on reload before first preparation is accepted and being fixed. Root prepared the existing whole-population
seating and staged-reload GPU checks in `throwaway/typegpu-scene-hardware/` for its
fixed build after review. No post-change browser claim exists yet. These checks
will not establish drawn-foot placement or camera/performance acceptance.

[Direct GPU regression](pre-prepare-regression/README.md) reproduces the accepted
preparation-order failure with the actual published crowd assets.
