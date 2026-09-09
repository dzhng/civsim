# Scratch reuse verification

The scratch-only pass starts from `29366294`, independently of the contact
change. It changes reusable storage and reset lifetimes, not simulation
formulas, input snapshots, iteration order, tunables or test expectations.

| Check | Result |
|---|---|
| Default `cargo check -p sim` | Clean |
| `cargo check -p sim --features perf_timing` | Clean |
| Unchanged golden test | Pass |
| `runner_smoke` | All three pass, including scheduled reinforcements, casualties and repeated auto-resolve |
| Seed 7 idle, 600 ticks | `ed293ec75fc41bcb` |
| Duels and sandboxes, 1,200 ticks each | Combined `8d21ca62c2a920c4` |
| Seed 7 AI, 9,000 ticks | `dda9a54e95963dbd` |
| Developed 30k fixture, both repeats | `080c80b28e8ae3db` |

Comparison with the original logs matched every reported fingerprint: two
idle hashes, all 230 duel/sandbox/combined hashes, and all 19 AI checkpoints
and final hashes. Both developed repeats measured the same `1500..1800`
window, with `30402 -> 30280` living soldiers and a per-tick minimum of 3344
living fighters. These verify state identity at different population sizes
and during sustained contact.

The reset audit checked the negative absent-wall sentinel, infinite empty
extent bounds, empty-slot sentinel and zero accumulators; all retained their
original values. Unit precomputation retains nested vectors while resizing
for the current units and formations. All precomputations finish before any
soldier moves. The small shared file-coverage helper remains unchanged.

Buffers retain peak capacity between ticks; truncating the unit-precomputation
list drops the nested storage for removed units, and dropping `Sim` releases
the remaining storage. The initial pass established reuse by code inspection:
fresh vector construction was replaced with clearing and refilling retained
capacity. A later [allocation-count probe](operation-counts.md) measured the
reduction in allocator calls. No speed or variance improvement attributable
to scratch reuse alone has yet been demonstrated.
The shared `covered_fighting_files` bitmap and feature-only force-trace record
vectors remain temporary allocations; this is not an allocation-free tick.

Parent review and an independent read-only Codex review found no defects in
reset values, resize behavior, phase ordering or the take/return lifetimes.
Formatting and diff checks are clean. No existing test or hash was repinned.

These runs overlapped other correctness work. Their wall times are not a
performance comparison or budget verdict. The integrating pass owns the
combined workspace/wasm/visual checks and the later paired timing and
variance comparison with the identical developed harness. This handoff does
not claim those pending gates or a speedup.
