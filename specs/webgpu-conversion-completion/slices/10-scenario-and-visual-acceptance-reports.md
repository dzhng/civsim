# Scenario And Visual Acceptance Reports

## Contract

The cutover scoreboard goes from PENDING/FAIL-on-missing-input to actually
scored. The scenario-run reports exist, a blessed visual-comparison manifest with
an archived current-renderer baseline exists, and the soldier/model gates feed the
visual report. The audit *harness* already works — this slice produces its inputs.

## Why

Every gate is blocked on an input report that has never been generated:

- `scenario:webgpu` / `:campaign` (`web/package.json:14-15`) write to
  `…/scenario-runs/webgpu-latest.json` and `webgpu-campaign-latest.json` —
  neither exists. `scenarioRunCheck()` returns `pending` → `releaseReady=false`
  (`webgpu-cutover-report.mjs:113-114,123,75`). The writer
  (`web/scene.mjs:194-220`) works; the scripts have just never persisted output.
- `visualImprovementCheck()` (`webgpu-cutover-report.mjs:239-257`) needs
  `…/visual-report/webgpu-visual-report.json` with every capture's
  `currentRendererComparison` accepted — the file/dir and the `current-renderer/`
  archive don't exist; only `.example.json` templates do. Blocks cutover and
  release audit (`webgpu-release-audit.mjs:119`).
- Soldier/model gate JSONs + PNGs exist (50 + 20 captures) but `scenario:webgpu`
  (`web/package.json:14`) excludes those scenes; `webgpu-visual-report.mjs:340,371`
  reads pre-existing JSON, so without running the gates first the summaries become
  `missing-gate-evidence` and fail (line 184). README:26 claims they were wired in
  — contradicted by the script.
- `comparisonAccepted` rejects `missing-archived-capture`
  (`webgpu-cutover-report.mjs:283-286`); no blessed screenshots are archived.

## API Seam

- Run `scenario:webgpu` and `scenario:webgpu:campaign` to completion and persist
  `webgpu-latest.json` / `webgpu-campaign-latest.json`; fix whatever stops the
  writer (`web/scene.mjs:194-220`) from finishing.
- Archive a current-renderer baseline into `current-renderer/` and produce
  `visual-report/webgpu-visual-report.json` with real `currentRendererComparison`
  entries; bless the captures intended as the visual floor.
- Wire the soldier-gate (50) and model-gate (20) scenes into the report path so
  `webgpu-visual-report.mjs` finds their JSON instead of `missing-gate-evidence`.
- Reconcile README:26's claim with the script (either wire the gates in or correct
  the README).

## Human Review

Run `cutover:webgpu`. The scoreboard is now *scored*, not PENDING-on-missing: each
gate shows a real status backed by an artifact you can open (scenario JSON, visual
report, gate captures). Blessed captures are committed as the review floor.

## Verification

- `scenario-runs/webgpu-latest.json` and `…-campaign-latest.json` exist and
  `scenarioRunCheck()` passes.
- `visual-report/webgpu-visual-report.json` exists; `visualImprovementCheck()`
  reads real comparisons (no `missing-archived-capture`).
- Soldier/model gate summaries are present (no `missing-gate-evidence`).
- `cutover:webgpu` runs end to end and reports a real (not vacuous) result.

## What Must Stay Green

- The audit scripts themselves (`webgpu-cutover-report.mjs`,
  `webgpu-release-audit.mjs`, `webgpu-visual-report.mjs`) — this slice feeds them,
  it does not rewrite them.
- Foundation invariant: scores are diagnostic; blessing a capture is a human
  judgment recorded in the spec, not an automatic pass.

## Feedback That Would Change This Slice

- Which captures are blessed as the current-renderer floor (human call).
- Whether soldier/model gates belong in `scenario:webgpu` or a separate gate step
  that the report aggregates.
