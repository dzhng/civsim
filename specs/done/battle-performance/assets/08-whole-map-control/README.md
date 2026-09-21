# Original whole-map shadow control — CPU/build checkpoint

The originalc924e5ce default is one1024² whole-map shadow. The lab build control
redirects the shared policy's camera-fit method to its existing whole-map fallback;
its exact source anchors reject drift. Production defaults are unchanged.

The constructor registers a weak reference once. Reading the diagnostic returns
the policy's installed CPU fit/refit count, with copied arrays. No diagnostic
strings, counters or clones run on camera updates. This does not observe GPU
uploads, rasterization or whether a disposed world is still reachable before GC.

Root integrated both implementation and read-time-diagnostic revision. The combined
trial/plugin tests pass73/73, the transformed-policy suite6/6 and TypeScript passes.
Independent review also passes. Full source and raw Menu builds now succeed with
the control enabled, using the existing production WASM. These logs supersede the
worker's synthetic-build-only limit; no GPU run or shadow-cost measurement exists
for this control yet.

The earlier reversed-depth receiver guard differs from the original outside the
old shadow volume. That needs visual comparison before calling B equivalent to
original shadow quality/coverage. Native fitted mode still lacks matching public
fit diagnostics. Neither fit arithmetic nor successful compilation closes the
final A/B/C net-cost, readability or moving-shadow gates.
