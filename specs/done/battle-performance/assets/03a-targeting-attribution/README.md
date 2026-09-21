# Remaining targeting work

Fresh post-bucket diagnostics retain all five independent canonical hashes through
tick12308. The stage-timed build and counters-only build ran serially after the
implementation worker exited. No GPU jobs or builds ran during these windows.
Host load remains uncontrolled; these results identify work, not final throughput.

Later combat spends22.55ms per tick in targeting,8.93ms in weapon repel and8.21ms
in projection, out of47.43ms instrumented total. Per-call timer overhead affects
attribution; do not subtract it from an uninstrumented result.

| Counter | Initial contact | Later combat |
| --- | ---: | ---: |
| Searches |1,376,572|1,250,844|
| Body visits per search |130.14|381.31|
| Obviously remote share of visits |19.80%|13.04%|
| Friendly bearing evaluations |21,620,127|57,332,437|
| Bearings unused by no-target returns |14,622,939|22,225,884|
| Retained friends on consuming returns |3,930,682|14,112,656|

Every remote-rejection witness is zero and counter conservation checks pass.
The counters do not prove a replacement spatial-index policy correct: original
hash collisions can admit nearby bodies outside the scanned cell rectangle.
Instead, the next candidate defers friend angle calculation until after selection
and the no-target return. It retains the original relative vector and calculates
the same atan2 for each consuming friend. This removes demonstrably discarded work
without a per-tick geometry table, new spatial ordering or mutable-state cache.
Adoption still requires exact hashes, focused tests and uninstrumented ABBA timing.

Counting instrumentation lives only on diagnostic branch
codex/battle-target-visit-counters at77b44155. Its per-body overhead makes its timing
unsuitable for performance claims. Compressed raw counts and stage records retain
the arithmetic inputs, outcome totals and build identity needed to audit this choice.
