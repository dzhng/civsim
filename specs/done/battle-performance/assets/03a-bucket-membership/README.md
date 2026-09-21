# Exact target-search bucket membership prefilter

Each target search preserves its original ordered bucket list. A local bit table
can prove that a bucket has not appeared; a set bit always falls back to the
original exact membership check. Distinct buckets sharing low bits remain
independent. Nothing survives the call, and no body traversal, floating arithmetic,
combat tie rule, timestep, unit stat or command order changes.

Claude implemented the bounded candidate; root inspected it and independent Codex
review found no actionable issue. The focused regression checks distinct colliding
IDs, repeated IDs, first-visit order, complete membership and the full81-entry
capacity. Root deliberately removed the exact fallback, duplicate rejection and
bit recording separately: each mutation failed the behavioral assertion. The
restored16 library tests, targeting mechanics and golden test pass. The integrated
worker also matches direct execution through all309 ticks9000–9308, including
observations/render facings and pinned hashes.

Both control and candidate use the same release build flags. The rebuilt control
matches current pre-change production WASM byte-for-byte (`2657fca8…`). The
measured candidate is `e9f4f080…`; the final source's mask is derived from its array
length and emits that exact same binary. The main production build independently
matches it. Source integration is5f418b5f; a subsequent test-only extension fills
all81 slots with colliding distinct IDs.

Four serial fresh Node runs use the canonical setup and opening orders, sampling
308 single-tick calls in each window. They verify hashes at9000,9300,9308,12000
and12308. These are uninstrumented synchronous WASM call costs, including unchanged
AI/export work, not a browser or quiet-host acceptance result.

| Run | Initial contact ms/tick | Later combat ms/tick |
| --- | ---: | ---: |
| Control0 |25.727|55.599|
| Candidate1 |24.318|47.654|
| Candidate2 |24.572|49.400|
| Control3 |27.623|50.588|

Both candidate runs are below both controls in both windows. The direction supports
keeping this small exact-semantics optimization; variation limits percentage claims.
Later combat still exceeds33.3ms, so sustained30Hz and final live acceptance remain
open. No GPU work or builds/tests ran during these timed Node windows. The records
include host load, exact WASM digests, build contract and all raw tick samples.

No existing test expectation was repinned. The new regression adds coverage of
membership/order behavior the former linear scan already provided; all three
fault mutations are retained as failing logs beside the passing restored runs.
