# Presented-frame GPU measurements

M9a joins existing observer events to successful battle-draw receipts, using the
complete observed submission span and preserving the union separately. Readbacks
may precede receipts; unusable terminal events close their later receipts too.
The join never waits for GPU completion or creates query work. Its two bounded
maps retain at most64 entries each and report eviction. A cached sample retains
its own frame identity until a newer measured frame replaces it.

Root hardware verification:22 checks pass on the actual raw Menu route, at
CSS1440×900/DPR2, tick30/hash15927906182668164452,15560 soldiers. Across three
zooms, each enabled sample exactly matches its receipt and producer event, frozen
reads retain identity, disabled-query builds advance frames with null timings,
and disposal clears samples/pending entries and releases all tracked resources.
No browser errors. These are correctness probes, not performance comparisons.
The compressed scripts retain the scratch-only observer exposure used to check
producer identity; no production debug API was added.

Root verification:38 focused tests,33 live tests, and web TypeScript pass.
Independent code reviews found no actionable issues, but root subsequently found
and reproduced the unusable-event-before-receipt bug. The retained red log and
regression test document that review miss and fix. Worker broad web runs each had
one missing sparse campaign fixture; they are not reported as full-suite passes.

The independent neutral-owner change moves the finite camera fallback constant
without changing its value or consumers' math, and removes an obsolete lake type
passthrough. Shared impostor math and the sea type remain with real consumers.
Combined builds and root camera/cascade checks verify the merged imports.

Shape review: one timing join beside the existing presentation API; no copied
renderer stats schema, new scheduler, dependency, or fallback. Diff review keeps
failure outcomes in the existing bounded map rather than adding another owner.
Documentation distinguishes source render-pass sums from correlated raw spans.
Production still constructs Three; content/depth diagnostics precede cutover.

## Change ledger

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| gpuFrameTiming: an unusable event arriving first closes its later receipt | New regression on a044026a observed pendingReceipts1 after terminal event and receipt | pendingReceipts0 for incomplete, dropped and missing-query outcomes; no GPU sample | Retain terminal failure until its receipt arrives; carried-in, reproduced before root fix. |

Other timing tests add coverage for the new contract; no existing threshold or
snapshot pin was relaxed. Neutral-owner test changes only replace the constant's
name/import; numerical expectations are unchanged. No simulation stat changes.
