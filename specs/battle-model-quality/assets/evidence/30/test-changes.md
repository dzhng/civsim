# Cutover test behavior ledger

| Test | Previous behavior | New behavior | Why it changed |
| --- | --- | --- | --- |
| `campaign figures use each represented class's authored clip` in `web/tests/stackCrowd.test.ts` | No class-specific stack clip assertion; the prior stack builder emitted the shared `march` default. | Two represented classes emit `sword-walk` and `pike-carry`, respectively. | Authored families do not share clip names; the consumer must resolve each manifest role. **moved** |
| `packages/soldier-assets/bake/roster.test.mjs` | No complete authored-production source-to-loader check. | Every registered appearance loads through the real loader, agrees with its source bake and role bindings, and has strictly decreasing triangle counts across three tiers. | Production replaces the synthetic catalog; copied or missing tiers must not pass as authored delivery. **moved** |
| `battle-model-workbench` custom far-roster check | No complete authored-roster far submission in this scene. | The entire current catalog is submitted through real far admission. Screenshot repeat remains pending. | Synthetic far diagnostics remain isolated and cannot prove authored roster admission. **moved** |
| `campaign teardown during crowd preparation cannot publish or retain GPU owners` | The lifecycle fixture supplied an empty catalog, which the new complete-catalog guard correctly rejects before allocation. | The real loader supplies the named synthetic fixture catalog; GPU allocation remains mocked and the teardown assertions are unchanged. | Preserve coverage of asynchronous ownership cleanup after strengthening production admission. **fixture repair; contract unchanged** |

The remaining dirty CPU-test changes in `battleModelReplay.test.ts`,
`battleActionAdapter.test.ts`, `battleCrowd.test.ts`, `presentation.test.mjs` and
`soldier-placeholders.test.mjs` relocate the same synthetic inputs to their
explicit fixture catalog; their behavioral assertions and thresholds are
unchanged. They were already synthetic, not real-model tests replaced with fakes.
The production source-to-loader check above supplies the separate authored
coverage. No simulation statistics, outcomes or unit balance values changed in
this cutover pass.

Workbench and action-replay expectations now resolve the manifest's canonical
roles instead of spelling synthetic clip names. Their interruption, terminal
pose, rollback and pose-parity requirements remain unchanged. Pixel updates are
still pending; the initial workbench differences are retained, not declared green.
