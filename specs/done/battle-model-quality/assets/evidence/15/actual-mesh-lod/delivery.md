# Practical LOD delivery — performance follow-up remains

The user chose **finish with a documented performance follow-up**. This closes the bounded asset pass, not the unchanged 33 ms performance gate. No simulation, production LOD threshold, clock, sample count or acceptance tolerance was weakened. Root owns final integration and the explicit user disposition.

## Geometry and visual disposition

| Source | Original triangles | Runtime near / mid / far |
| --- | ---: | ---: |
| Heavy | 127,196 | 7,958 / 982 / 782 |
| Medium | 155,190 | 7,972 / 1,066 / 866 |

Editable original Blend/GLB files remain authoritative. Runtime tiers derive independently from those originals, preserving exact imported rig/action arrays and retained material/texture semantics. Source reports and hashes are in `usable-heavy-tiers.json`, `usable-medium-tiers.json` and preceding source-control evidence. Final source tiers were delivered in 70899a9f and 133f472f; exporter/default800/subset and semantic controls in de6cfb26.

The initial far250 target yielded 376/460 triangles and visibly missing body surfaces: rejected, not cosmetic acceptance. `rejected-far250/` preserves that control. Final far800 restores the usable coarse body; `original-runtime-sheets/` preserves the initial high-near control. Near remains coherent. Magnified mid/far have angular surfaces, triangular shading and thin pike-line discontinuity. Fresh review prefers the original under magnification and cannot establish whether the pike discontinuity is missing geometry or raster aliasing. Actual distant figures are too small to certify hidden attachment completeness. These limitations are retained, not reclassified as proven harmless.

Final session 94624 ended 1 only for the four intended sheet changes; actual tier/projection checks and all 36 immediate frozen-image repeats passed, with no page errors. Parent inspected all four images and the fresh critique and approved retaining them. The four new named baselines are the reviewed final practical images. **No full-sheet normal rerun after replacing these baselines is claimed.** Existing heavy/medium default scene coverage remains registered; this pass did not rerun every old art snapshot against reduced geometry. The earlier 53697 green in `runtime-budget.md` describes initial tiers, not final practical tiers.

## Hardware results (milliseconds)

Same existing animated close-camera benchmark: 30,000 bodies, 1280×800, Apple/metal-3 hardware Chrome, 60 warm-up and 180 samples per group. These genuine foot bindings exercise walk/run interruptions, not every combat action. Each row is CPU median / RAF p95 / GPU queue-elapsed median (dash for untimed control).

| Workload | Steady control | Steady timed | Interruptions control | Interruptions timed |
| --- | --- | --- | --- | --- |
| Original heavy | 22.805 / 516.645 / — | 30.190 / 266.660 / 195.127 | 37.190 / 433.315 / — | 35.180 / 316.650 / 206.213 |
| Practical heavy | 21.470 / 49.995 / — | 21.535 / 33.335 / 24.974 | 22.920 / 49.995 / — | 23.485 / 33.335 / 25.047 |
| Original medium | 30.135 / 533.310 / — | 30.910 / 366.650 / 252.732 | 30.485 / 616.640 / — | 45.855 / 416.655 / 301.311 |
| Practical medium, confounded | 36.630 / 50.000 / — | 38.460 / 50.000 / 39.591 | 39.835 / 50.005 / — | 41.310 / 50.005 / 42.813 |

Original sessions 19390/49249 ended 1 with eight/seven timing failures. Final heavy 64153 ended 1 with four cadence failures; CPU and GPU-queue medians were below 33 ms. Final medium 99561 ended 1 with ten timing failures. Functional crowd/frame checks completed without page errors. Reports retain failures verbatim.

Heavy main admission stayed 2,546 near / 3,354 mid, with all 30,000 shadow bodies at far. Original near alone was 323,841,216 triangles per main geometry pass. Medium admission stayed 2,820 near / 3,492 mid. This is a changed-geometry workload comparison, not a clean isolated renderer speedup measurement.

Original measurements had unrelated Chrome activity. Final heavy ran 11:23:55–11:24:45 UTC. The final medium ran 11:26:18–11:27:06; the 11:28:54 process snapshot shows a 100%-CPU duration_probe with elapsed 3:04, implying overlap throughout medium but after heavy. Therefore medium is **not a quiet-state measurement**. Phase reports also show all 180 medium samples observing a tick versus 130–138 for heavy; do not attribute all differences to a single cause.

The authorized quiet repeat preflight found three unrelated duration_probe processes near 100% CPU. Its own runner 87215 was stopped immediately with SIGINT, terminal 130/browser closed, before a valid measurement. Read-only ownership inspection identified unrelated `/private/tmp/fly-maze-duration` and `/Users/david/dev/fly-escape` work; those processes were untouched. `quiet-budget-medium.txt` and `medium-quiet-before.txt` preserve this aborted attempt. There is no successful quiet repeat and no retry-until-green claim.

## Remaining performance question

GPU timing brackets queue elapsed, including CPU submission bubbles; it is not isolated active-pass GPU time. CPU/GPU medians overlap and must not be added. Readbacks drain after sampling, not via a per-frame await. RAF p95 additionally includes browser/compositor scheduling. Heavy 33.335 ms approximates two 60 Hz slots but still fails 33 ms; control groups had 14/180 intervals at least 50 ms each, so the control tail is not merely threshold rounding. Sequential query/control pacing does not prove queries improve cadence.

Follow-up: establish a genuinely uncontended hardware run, then separate the remaining observation/upload cost and browser cadence tail using existing timing owners. Do not infer a 30k/33ms pass from reciprocal GPU medians. No further geometry cuts, captures or instrumentation are part of this delivery.

## Change ledger and checks

- [new consumer] `web/tests/syntheticBudgetFixture.test.ts` — `actual heavy and medium budgets follow authored walk/run without inventing release`: previously only synthetic workloads were traced; now real manifests prove both authored gait roles and reject manual-null bindings without fabricated release. Existing synthetic tests retained.
- [new scene coverage] `web/scenes/models/_mesh-lod-sheet.mjs`, invoked by existing heavy/medium scenes: real camera admission plus separately magnified already-admitted buckets; 36 exact immediate repeats and four new named images. Diagnostic magnification is not production LOD policy.
- [workload extension] `battle-model-budget.mjs`: heavy/medium genuine-manifest choices join existing foot/mounted choices. The same 33 ms gates remain red; no synthetic geometry overrides for actual pair.
- [generated artifact] heavy candidate bake and both generated mirrors now consume practical source tiers and genuine heavy bindings. Medium family/source/generated ownership remains the independently delivered pike-family owner, not duplicated here.

Full CPU suite: 383 tests in 62 files and TypeScript passed (85799). Exporter/material/tangent regression evidence and independent reviews are retained in this leaf; reported findings were corrected, not silently ignored. No live catalog promotion is performed by these candidate scene changes.

Reproduction uses the existing owners: bake heavy with `node packages/soldier-assets/bake/heavy-kit.mjs`; medium with the integrated `pike-family.mjs --name medium-phalanx`. Run hardware from `web` with `VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome VERIFY_URL=http://127.0.0.1:5488 BUDGET_FIXTURE=heavy BUDGET_SOLDIERS=30000 BUDGET_WIDTH=1280 BUDGET_HEIGHT=800 BUDGET_STOPS=close BUDGET_FRAMES=180 SCENARIO_REPORT_JSON=../throwaway/report.json node scene.mjs battle-model-budget` (medium changes only fixture). These are reproduction commands, not a request to rerun during closeout.
