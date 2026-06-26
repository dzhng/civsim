# 23 — Snapshot And Vibe Migration

## Contract

Visual regression, scenario, and vibe verification target the WebGPU default
path. During migration, legacy/current-renderer captures exist only to prove
parity and improvement. After cutover, routine screenshots run WebGPU only; old
baselines are retired or re-blessed deliberately, with every frame opened and
reviewed before claiming parity.

## API Seam

- `web/scenario.mjs`
- `web/verify-battle.mjs`
- `web/verify-campaign-visual.mjs`
- `web/scenarios/campaign-webgpu-visual.mjs`
- `web/vibe/*.mjs`
- `web/snapshot.mjs`

## Playable Deliverable

- Scenario list clearly marks WebGPU default cases, transitional legacy-only
  cases if any still exist, and the slice that removes each legacy-only case.
  Once cutover is accepted, this list must contain WebGPU visual scenarios only;
  old renderer captures remain outside the runner as archived comparison files,
  and current-renderer screenshot commands are removed or quarantined with the
  retired renderer rather than left as routine compatibility targets.
- `campaign-webgpu-production` is the first production-route campaign WebGPU
  gate. It runs against the normal campaign URL; legacy campaign captures are
  migration evidence, not a live renderer route.
- `menu-webgpu-shell-visual` pins the normal menu ready state, unsupported
  WebGPU state, and duel modal around the WebGPU app shell.
- `campaign-webgpu-visual` owns the controlled campaign marker and panel
  snapshots through the production raw-WebGPU campaign adapter; the old
  `verify-campaign-visual.mjs` entry is only a compatibility wrapper.
- Visual report page links current-vs-WebGPU comparison images by surface during
  migration, then records which legacy captures were archived or deleted after
  cutover. It does not keep current-renderer screenshots as a permanent
  verification mode.

Current checkpoint:

- `VERIFY_WEBGPU=1 node scenario.mjs webgpu-visual-report` captures the WebGPU
  menu, unsupported-WebGPU state, battle default, battle selection/HUD at DPR2,
  campaign whole map, campaign label zoom, and campaign-to-battle handoff
  surfaces.
- The scenario writes
  `specs/webgpu-skinned-crowd/visualizations/webgpu-visual-report.html` and
  `specs/webgpu-skinned-crowd/visualizations/visual-report/webgpu-visual-report.json`.
- The report deliberately marks final visual improvement as pending until
  archived current-renderer captures for the same scenes are attached.
- Archived current-renderer captures can be attached without reviving the old
  renderer by rerunning the scenario with `VISUAL_CURRENT_RENDERER_DIR` and
  `VISUAL_COMPARISON_JSON`. The manifest shape is documented in
  `specs/webgpu-skinned-crowd/visualizations/visual-comparison.manifest.example.json`.

## Verification

- `npm run verify` passes on WebGPU defaults.
- `VERIFY_WEBGPU=1 node scenario.mjs campaign-webgpu-production` passes on the
  normal campaign route.
- `VERIFY_WEBGPU=1 node scenario.mjs menu-webgpu-shell-visual` passes with zero
  pixel drift after the menu shell baselines are blessed and inspected.
- `npm run scenario:webgpu` covers the quick production WebGPU route set:
  lab route contracts, visual cutover report generation, default battle, battle
  input/orders/camera/freeze, campaign production, campaign handoff, campaign
  save/load, campaign visual snapshots, menu flow, and menu visual snapshots.
- `npm run verify:campaign-visual` delegates to `campaign-webgpu-visual` with
  WebGPU enabled, preserving compatibility while scenario ownership becomes the
  source of truth.
- Full vibe timelines either pass unchanged or are deliberately regenerated
  after reading every frame.
- Post-cutover verification has no dependency on current-renderer screenshots.
- Post-cutover additions must be WebGPU-only. Do not add a current-renderer
  scenario after release; use archived cutover captures only as historical
  evidence when explaining a comparison.
- Compatibility wrappers such as `verify-campaign-visual.mjs` must delegate to
  WebGPU scenarios after cutover; they must not become a back door for rerunning
  the old renderer screenshot suite.
- After final visual acceptance, `webgpu-visual-report` should be rerun as a
  WebGPU-only report unless the explicit purpose is to inspect the archived
  cutover comparison.

## Must Stay Green

- `snapCheck` remains the single image comparison path.
- Frozen WebGPU shader/animation time is deterministic.
- No baseline is re-blessed without visual inspection.
- Legacy screenshots are not kept as permanent parallel baselines after WebGPU
  becomes the accepted default.
- No new current-renderer screenshot baselines are created after cutover.

## Human Feedback

This is where “looks close enough” gets challenged frame by frame.
