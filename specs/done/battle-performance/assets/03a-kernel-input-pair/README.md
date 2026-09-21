# Combined kernel-input candidate — not adopted

The candidate removes unused fight_near bookkeeping, defers retained-friend flags,
and shares per-unit facing directions across separation consumers. Both passes
remain isolated:98e4d2e6+c8580623, with the original facing pass atd0390b87. No
production Rust change was integrated from this experiment.

| ABBA run | Early ms/tick | Later ms/tick |
| --- | ---: | ---: |
| A0 control |25.128|50.010|
| B1 candidate |24.536|45.734|
| B2 candidate |24.122|46.389|
| A3 control |24.270|47.211|

All four exits and five canonical hash assertions pass; artifacts remain
unchanged. The declared rule requires both Bs to beat both As at both windows.
Late combat meets that rule, but early ranges overlap: B1 is slower than A3.
Therefore the combined candidate is not adopted as a performance change. No
repeat was launched to obtain a preferred outcome. The late result remains
useful evidence for a future materially different experiment; it does not meet
30Hz or establish a browser win. No individual change gets a speedup attribution.

Owned builds, tests and GPU work were stopped during timing. A bounded read-only
Claude contract review and root source/report reads ran during the window; no
source edits or archive work occurred. External host activity was uncontrolled.
Recorded host samples bracket the early window only, not a continuously quiet
host or a separate later-window guarantee. Preserve that uncertainty.

Control production WASM:
b42782f4d67ff8b2efca21978166267e500111102f233b68af06e1f9f5f365e1.
Candidate WASM:
15f888022d65a00431dfb596c5d81ce7d58e03fa34053284bcf41c80ecb4f087.
The build manifest records source commits and identical release flags. Integrated
WASM/worker parity was not run because the adoption gate failed.

Root verification of the combined candidate passed23 library tests, the unchanged
golden0x68f4569d1cc8116f and the new wheeling-charge behavior. Removing live friend
flags makes the frontage test fail; retaining headings only by unit count makes
the wheeling test fail. Both mutations were restored exactly before the green
runs and builds. Independent Codex review found no actionable regression, passed
library/golden/impact tests and checked parallel/force-trace compilation.

The counter-only test is replaced on the isolated branch by a real same-pass
frontage test; deferred-friend tests read flags by the retained owner. The new
wheeling test checks current-heading impact through the public simulation API.
No production assertions, golden values or gameplay changed. The counter worker
removed its own redirected scratch output; root review, mutation and test logs
provide independent evidence rather than relying on a missing worker report.

Compressed reports, drivers and logs are hash/round-trip verified by the manifest.
The successful earlier packed-body experiment remains a separate adopted change.
