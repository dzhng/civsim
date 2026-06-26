# 25 — Production Cutover And Renderer Retirement

## Contract

The shipped default game route is raw WebGPU from menu to campaign to battle and
back. Obsolete Babylon/WebGL production code is deleted or quarantined with a
named reason, and docs/tests point at the new path.

Cutover only happens after the WebGPU route reaches current-game parity and
passes the improvement gates: graphics are equal or better on every shipped
surface, the intended battle/campaign surfaces are visibly better, and
real-hardware performance is equal or better with more crowd/detail headroom.

## API Seam

- `web/src/main.ts`
- `web/src/battle/scene.ts`
- `web/src/campaign/scene.ts`
- package imports under `packages/game-renderer`,
  `packages/webgpu-core`, `packages/crowd-runtime`, and `packages/soldier-assets`.
- Dependency audit confirming `@babylonjs/core` is absent from web package
  dependencies and production source imports.

## Playable Deliverable

- `/` is the WebGPU game.
- `/webgpu/cutover` report lists renderer status, retained legacy code, removed
  code, dependencies, scenario coverage, known limitations, parity status, visual
  improvement status, screenshot lifecycle status, and performance comparison
  status.
- `npm run cutover:webgpu` writes the machine-readable cutover/parity report at
  `specs/webgpu-skinned-crowd/visualizations/cutover/webgpu-cutover-report.json`
  and the human-readable report at
  `specs/webgpu-skinned-crowd/visualizations/webgpu-cutover-report.html`.

Current checkpoint:

- `/webgpu/cutover` publishes `webgpu-cutover-report` with battle/campaign
  WebGPU default status, removed renderer/dependency status, retired route
  switches, WebGPU-only screenshot policy, and known release blockers.
- `npm run cutover:webgpu` now audits the local full-game parity matrix,
  WebGPU scenario coverage, removed renderer files, package dependencies,
  WebGPU production package entry points, and required visual/perf artifacts.
  It also reads the latest generated WebGPU scenario-run reports so coverage is
  tied to actual passing browser runs, not only to package-script wiring. It
  exits cleanly while pending release evidence is still allowed, but
  `release:webgpu` will not pass without clean scenario-run artifacts plus the
  final visual-improvement and hardware-perf evidence.
- Campaign labels now report as complete through the raw-WebGPU glyph atlas
  pass; label DOM spans are no longer part of the campaign map path.
- The WebGPU visual cutover report is generated at
  `specs/webgpu-skinned-crowd/visualizations/webgpu-visual-report.html`.
- `npm run archive:current-renderer` captures the sibling/current-renderer
  review surfaces from `CURRENT_RENDERER_URL` into
  `specs/webgpu-skinned-crowd/visualizations/current-renderer/`, writes a
  pending comparison manifest, and records a generated current-renderer
  performance baseline candidate. Those visual comparisons remain pending until
  the side-by-side report is reviewed and accepted with attached archive images.
- The WebGPU performance evidence report is generated at
  `specs/webgpu-skinned-crowd/visualizations/webgpu-performance-report.html`;
  headless SwiftShader output is kept as liveness evidence only, not a release
  budget.
- The report deliberately keeps `releaseReady: false` until the named-hardware
  performance comparison and final side-by-side visual improvement report are
  attached.
- `npm run scenario:webgpu` includes `webgpu-lab-routes`, which checks the
  cutover report contract alongside the production battle/campaign/menu routes.
- `npm run scenario:webgpu` writes
  `specs/webgpu-skinned-crowd/visualizations/scenario-runs/webgpu-latest.json`;
  `npm run scenario:webgpu:campaign` writes
  `specs/webgpu-skinned-crowd/visualizations/scenario-runs/webgpu-campaign-latest.json`.

## Verification

- Full web build passes.
- Battle, campaign, menu, handoff, conquest/auto-resolve, reinforcement,
  save/load, visual, and perf scenarios pass.
- The cutover report marks `scenario-run-webgpu` and
  `scenario-run-campaign` complete only when those JSON reports exist, are
  WebGPU runs, include the required scenario names, and contain no failures or
  page errors.
- Parity matrix covers every normal current-game player flow and marks each as
  matched, improved, retired by decision, or blocked. Current machine gate:
  `npm run cutover:webgpu`.
- Side-by-side screenshot review confirms the WebGPU game is not visually worse
  than the current game on any shipped surface.
- Final performance report compares current renderer vs WebGPU on named
  hardware and records the improvement or accepted exception.
- `npm run release:webgpu` passes. Until archived visual comparisons and
  named-hardware performance evidence are accepted, this command is expected to
  fail and write
  `specs/webgpu-skinned-crowd/visualizations/webgpu-release-audit.html`.
- Screenshot/vibe/visual harness audit confirms routine post-cutover baselines
  target WebGPU only; legacy captures are archived or deleted as migration
  evidence rather than kept as a permanent second renderer suite.
- The release audit is the last planned gate that may reference current-renderer
  screenshots. After it passes, future visual regression work creates WebGPU
  baselines for the shipped game instead of reviving current-renderer captures.
- Bundle audit confirms Babylon, legacy battle renderer, and legacy campaign
  renderer are absent from the production path.
- Final postmortem records measured operating points and remaining follow-up.

## Must Stay Green

- Save/load works.
- Campaign-to-battle handoff works.
- Sim/campaign Rust tests remain green.
- Unsupported-browser failure UX is clear.
- No readability, input, screenshot, or performance regression ships without a
  named release exception.

## Human Feedback

This is the release review. If any old renderer remains, the report must say
why, who owns its removal, and what test proves it is not accidentally default.
If any WebGPU surface is merely equal rather than better, the report must say
why that is acceptable and where the next graphics or performance gain will
come from.
