# 24 — Full-Game Performance And Fallbacks

## Contract

The full WebGPU game has measured real-hardware performance budgets, memory
ceilings, loading behavior, capability checks, and a clear fallback/error path
for unsupported browsers. The budgets are not abstract: they compare the
current game renderer and the WebGPU renderer on identical scenes, resolutions,
DPR, browser, OS, and hardware.

The WebGPU path is expected to be faster or to carry visibly more graphical
detail at the same frame time. Parity is acceptable only as a temporary release
exception with a named owner and follow-up optimization slice.

## API Seam

- `packages/game-renderer/src/perfReport.ts`
  - `makeFullGamePerfReport`, `makePerfSceneReport`, and
    `formatPerfSummary` define the shared report shape.
- `packages/webgpu-core/src/capabilities.ts`
- `/webgpu/perf` publishes a `webgpu-full-game-perf` report for the lab
  skinned-crowd benchmark.
- `web/scenes/full-game-webgpu-performance.mjs` measures normal shipped
  routes: menu shell, default 30k battle, normal campaign, and campaign battle
  handoff, then writes the canonical performance evidence JSON/HTML report.
- Transitional legacy/current renderer capture mode for identical baseline
  scenes, removed from routine gates after the cutover audit passes.

## Playable Deliverable

- `/webgpu/perf`
- Presets: battle max crowd, battle coast, campaign whole map, campaign city
  zoom, campaign-to-battle handoff loop.
- Side-by-side report comparing current renderer vs WebGPU for the same scenes.
- Exportable report JSON/Markdown for the final postmortem.

Current checkpoint:

- `VERIFY_WEBGPU=1 node scene.mjs full-game-webgpu-performance` prints a
  compact report for menu, battle max crowd, campaign whole map, and handoff.
  It is headless liveness only (`releaseBudget: not-set`).
- The same scenario writes
  `specs/webgpu-skinned-crowd/visualizations/webgpu-performance-report.html`
  and
  `specs/webgpu-skinned-crowd/visualizations/performance/full-game-webgpu-performance.json`.
  SwiftShader/headless runs are classified as `headless-liveness-only`, and real
  hardware runs remain `pending-current-renderer-baseline` unless
  `PERF_CURRENT_RENDERER_JSON` points at archived current-renderer scene metrics.
- Production battle and campaign WebGPU adapters now expose CPU-side
  `buildMs`, `uploadMs`, `drawMs`, and `frameCpuMs` timing in their renderer
  stats. The performance report records those fields per scene and requires the
  archived current-renderer baseline to include comparable CPU upload timing for
  renderer scenes before a hardware release comparison can pass.
- The performance report also records per-scene `startupMs` and browser heap
  usage when the browser exposes `performance.memory`. A hardware comparison
  fails if the archived current-renderer baseline omits matching startup or
  memory fields for scenes where WebGPU captured them; heap comparisons allow a
  narrow 10% ceiling to avoid overfitting allocator noise while still blocking
  unbounded memory growth.
- The final release audit requires startup, heap, upload, and renderer CPU frame
  timing in the generated performance report before the performance gate can
  pass.
- `CampaignLabelPass` caches the visible-label atlas and vertex upload by label
  key, DPR, text, position, size, priority, and angle. The latest headless
  report shows the controlled campaign whole-map steady-state upload sample at
  `0.06ms` instead of the earlier repeated atlas upload spike.
- The archived current-renderer baseline format is documented by
  `specs/webgpu-skinned-crowd/visualizations/performance/current-renderer-baseline.example.json`.
- `VERIFY_WEBGPU=1 node scene.mjs webgpu-lab-routes` checks `/webgpu/perf`
  publishes the shared report shape.

## Verification

- Headless CI keeps liveness gates only.
- `npm run perf:webgpu` runs the headless full-game liveness report.
- `npm run perf:webgpu:hardware` runs the same report headful through the
  installed Chrome channel for final local release evidence. Set
  `VERIFY_BROWSER_CHANNEL` to another installed Playwright Chromium channel if
  the release machine uses a different browser.
- `npm run scenario:webgpu` includes `full-game-webgpu-performance`, so the
  normal WebGPU cutover bundle regenerates the perf report beside the visual
  report.
- Current-renderer baseline is captured before tuning WebGPU budgets, then
  archived or deleted once WebGPU meets the cutover report.
- Final hardware run:
  `PERF_CURRENT_RENDERER_JSON=../specs/webgpu-skinned-crowd/visualizations/performance/<baseline>.json npm run perf:webgpu:hardware`
  from `web/`, using a non-headless browser/GPU environment that reports a real
  adapter. The underlying runner knobs are `VERIFY_HEADFUL=1`,
  `VERIFY_BROWSER_CHANNEL=<channel>`, and optional `VERIFY_SLOW_MO=<ms>`.
- Real hardware report records GPU, browser, OS, resolution, DPR, median/p95
  frame time, CPU frame time, upload time, draw calls, memory, startup, and
  thermal notes if available.
- Hardware comparison fails when WebGPU frame median/p95 regress, or when a
  renderer scene has WebGPU upload timing but the archived current-renderer
  baseline omits upload timing.
- Report calls out where WebGPU beats the current renderer, where it only
  matches, and where it still regresses.
- Unsupported WebGPU fixture shows useful failure UI.
  - Current fixture: `VERIFY_WEBGPU=1 node scene.mjs menu-webgpu-shell`
    opens `/?webgpu=off` and proves the menu blocks renderer launches while
    keeping non-renderer surfaces usable.

## Must Stay Green

- Correctness and screenshots run before perf tuning.
- No benchmark threshold is accepted without hardware context.
- No slower default cutover without an explicit release exception, owner, and
  follow-up test.
- Fallback UX does not silently launch a mismatched legacy renderer.

## Human Feedback

Use this to decide whether the WebGPU architecture is ready to replace the old
game path, needs another optimization slice, or needs a graphics/detail tradeoff
before release.
