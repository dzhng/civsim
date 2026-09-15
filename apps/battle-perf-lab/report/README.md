# Matched live-run scorecard

This offline report validates two exported in-game benchmark recordings and their
experiment manifests. Run `bun apps/battle-perf-lab/report/compare.ts parity
left.json right.json scorecard.json` (one line). Each input is `{ manifest, report }`;
`RunManifest` in `compareRuns.ts` defines the collected metadata. Use `shadow-cost`
for one off/on pair on the same backend and build. Output creation is exclusive,
so an earlier experiment cannot be overwritten accidentally. Invalid pairs are
written with reasons and return exit status 1; malformed input throws.

The runner must collect the manifest, archive the unmodified export, and retain
its evidence. A null hardware field means uncollected and prevents eligibility.
The config SHA-256 identifies canonical backend-independent render settings,
including environment, shadow fit/resolution and sample count, excluding only the
on/off shadows setting already present in the exported graphics identity.
Build, dependencies, source commit and dirty diff are recorded independently;
assets, WASM and the render configuration must match across backends. A null dirty
diff means the runner verified a clean source tree, not that it skipped inspection.

Eligibility only establishes a comparable cadence pair. It does not establish
visual parity, sufficient repetitions, a performance win, or a backend choice.
Simulation progress and missing GPU data remain explicit; no physical GPU memory
or GPU presentation latency is inferred. GPU timing may be unavailable even when
cadence is comparable. Keep timing evidence separate from screenshots and other
host-contaminating diagnostic runs. FPS formulas remain owned by the game's
`benchmarkMetrics`; the scorecard recomputes and checks the original summaries.

CPU duration distributions include measured zero work and count absent/invalid
samples separately. GPU distributions include only complete submission-matched
results; snapshot presence does not imply available timing. The report preserves
pending results and cursor loss rather than waiting for queries or treating them
as zero. CPU and GPU distributions are separate and must never be summed into a
frame total. Phase labels, consecutive presentation IDs and the first terminal
crossing are checked against the recording boundaries.

The normal lab Vitest configuration discovers these tests. The colocated TypeScript
configuration checks this offline Node/Bun surface separately from browser GPU
controls, so server runtime declarations do not alter their DOM types.
