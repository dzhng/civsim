# Four-mesh stationary contact cost

This is an attribution experiment, not production-build or live acceptance.
Source runtime36b16ba4, hardware Chrome,1440×900CSS atDPR2, paused canonical
contact tick9000/hash9928381812590497427, rendering/animation live. One loaded
world alternates original geometry selection and the four-mesh candidate across
four settled cameras. The control duplicates the first threshold (18/18/9/4),
making the intermediate unreachable while preserving original near/mid/far
selection. The candidate uses32/18/9/4. Both retain the extra mesh allocation;
loading/memory overhead is outside this experiment. Histories reset after each
camera settles, followed by1s additional warmup and8s measurement.

The same cameras and repeated-arm counts match exactly. Shadows draw identical
geometry in every arm. Tactical/action/horizon main triangles fall47%,39%,45%;
wide-view main geometry is identical. This avoids the rejected three-mesh
arrangement's distant and shadow work increase.

Observed correlated GPU interval-union medians, milliseconds (A original, B added
intermediate; pass durations overlap and are not summed):

| View | A0 | B1 | A2 | B3 | A4 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Tactical |60.95|42.69|57.88|41.65|47.76|
| Action |78.83|44.49|50.04|39.61|44.22|
| Horizon |67.42|56.57|59.37|44.54|47.45|
| Wide |30.40|36.35|31.48|36.18|25.78|

Both candidate dense-view passes beat their adjacent controls. Wide-view timing
is worse despite identical geometry, and original-arm drift is large. No
quiet-host audit was acquired; no builds/tests or other task-owned GPU jobs ran
concurrently. Therefore this supports a dense-view opportunity, not a causal
percentage, backend ranking, general speedup or final cadence claim. The wide
result must be investigated in refreshed fixed-build controls rather than waved
away. Raw frames, GPU submission records, incomplete sample coverage and all work
counts remain in the compressed report and summaries. This is not the five-minute
Menu benchmark; final live and shadow-cost gates remain open.
