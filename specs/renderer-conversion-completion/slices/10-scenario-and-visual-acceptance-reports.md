# Scenario And Shot Acceptance Reports

## Contract

The cutover scoreboard goes from PENDING/FAIL-on-missing-input to actually
scored. Scenario-run reports exist, and release-review visuals are committed
under `web/shots/`. There is no separate visual-report image store: if a visual
artifact is not under `web/shots`, it is not part of the release-review surface.

## Why

Every gate is blocked on an input report that has never been generated:

- `scene:renderer` / `:campaign` (`web/package.json:14-15`) write to
  `web/reports/rendering/scenario-runs/renderer-latest.json` and
  `renderer-campaign-latest.json` — neither exists. `scenarioRunCheck()` returns
  `pending` → `releaseReady=false` (`renderer-cutover-report.mjs`). The writer
  (`web/scene.mjs:194-220`) works; the scripts have just never persisted output.
- Release-review shot coverage must be checked against `web/shots`, not against
  generated HTML/JSON reports under `specs/done`.
- Campaign model shots are produced by `scene.mjs campaign-models` into
  `web/shots/models/campaign/{entities,props,terrain,labels}/`.
- Soldier model sheets and animation review GIFs live under
  `web/shots/models/shared/soldiers/`.

## API Seam

- Run `scene:renderer` and `scene:renderer:campaign` to completion and persist
  `web/reports/rendering/scenario-runs/renderer-latest.json` /
  `renderer-campaign-latest.json`; fix whatever stops the writer
  (`web/scene.mjs:194-220`) from finishing.
- Ensure the release-review shot inventory is committed under `web/shots`.
- Keep `campaign-models` in `scene:renderer` so object shots regenerate through
  the normal scene runner.

## Human Review

Run `cutover:renderer`. The scoreboard is now *scored*, not PENDING-on-missing:
each gate shows a real status backed by an artifact you can open. Blessed visual
captures are committed under `web/shots`.

## Verification

- `web/reports/rendering/scenario-runs/renderer-latest.json` and
  `…-campaign-latest.json` exist and `scenarioRunCheck()` passes.
- `releaseShotCoverageCheck()` passes against `web/shots`.
- `scene.mjs campaign-models` writes campaign object shots under
  `web/shots/models/campaign/`.
- `cutover:renderer` runs end to end and reports a real (not vacuous) result.

## What Must Stay Green

- The audit scripts themselves (`renderer-cutover-report.mjs`,
  `renderer-release-audit.mjs`) keep treating `web/shots` as the visual source of
  truth.
- Foundation invariant: scores are diagnostic; blessing a capture is a human
  judgment recorded in the spec, not an automatic pass.

## Feedback That Would Change This Slice

- Which `web/shots` captures are part of the release-review floor (human call).
