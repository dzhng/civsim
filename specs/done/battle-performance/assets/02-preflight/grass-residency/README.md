# Grass residency extraction checks

The pre-extraction production Three class and the new Three adapter were exercised
with identical terrain, camera history and injected clock/frame scheduling. Their
stats, including record hashes and slice timing, matched through initial sampling,
frame slices, hiding/cancellation, resume, camera movement, synchronous settle,
stale callback draining, detail loss and terrain replacement. The only intentional
stats text change is the transition owner naming the shared residency module.
The temporary copied baseline was removed after comparison; no second state
machine remains in the test or runtime graph.

Permanent consumer tests check actual nonempty packed records from scheduled and
synchronously settled sampling, cancellation after hiding/replacement/disposal,
record revision stability, dedupe routing, and far-detail visibility. Existing
sampler and terrain-seam tests also pass. Full web typechecking passes. This is CPU
ownership/equivalence evidence; no new GPU or full-scene performance claim is made.

The baseline still builds the whole-map field synchronously and advances focus
sampling with the original cell/time budget. `settle` still completes the current
task synchronously. Future optimization must be a separate measured change.
