# Completed-interval replay GPU checkpoint

The final normal production replay passes614 checks and44 snapshot assertions
after correcting the harness storage contract and refreshing the reviewed
controller image. No page errors; independent read-only review found no findings.
This is diagnostic transport evidence, not detailed model or live-motion acceptance.

The initial full replay reported fifteen failures: fourteen retained CPU snapshot
budget assertions and one controller image. Current and completed history each
retain one immutable source per applicable lane. The old hardcoded two-source
budget described current history only. The corrected bound is two intervals times
one base lane, or two lanes when a rider overlay exists. GPU residency remains
bounded by two submitted sources; its assertion is unchanged. The second full run
passes every functional/numerical check and fails only the controller baseline.
Existing CPU tests separately prove source sharing and retirement after death.

The controller phase changes from 0.628 to 0.644 at tick90. Actual class7 replay
reports march phase0.5 at29 and run phase0.5666666667 at30. Completed travel from29
to30 now uses preceding march stride1.7, rather than newly selected run stride2.21:
`0.5 + (3.4/30)/1.7`, not `0.5 + (3.4/30)/2.21`. The resulting phase difference
0.0153846154 persists to90. This is the intended interval-owner correction, not
extra inferred idle-entry distance. The historical independent-shadow policy also
predates this baseline; its separate causal diagnostic is recorded in
[manual-life evidence](../../../01/manual-life/review.md).

Root inspected both complete controller images. The fresh image-only critic
independently read all four changed phase labels and found no obvious model or
layout regression. Top navigation clipping, low footer spacing, placeholder
geometry and stippled ground shadows remain existing limitations; this pass
does not fix or accept those surfaces. The old image is retained here, and only
the controller baseline is refreshed. Other image tolerances are unchanged.

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| Temporal replay bounded controller snapshots | Maximum two CPU frozen poses for every appearance. | Maximum two intervals times applicable lanes; GPU submitted-source bound remains two. | Completed history is retained and counted, not leaked. |
| Controller screenshot | Run phase0.628 and prior rendered frame. | Run phase0.644 and reviewed current frame. | Completed walk-to-run interval uses its preceding stride. |

Evidence: initial.json, budget.json, final.json, controller-before/after.png,
critique.txt and code-review.txt.
The second run's exact immediate repeats and numerical CPU/GPU comparisons are
separate from its tolerance-based historical snapshot checks.
