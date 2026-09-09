# Integration with production main

Main `39aa844e` and model delivery `42051695` are merged without changing the
authored assets or weakening any screenshot or performance threshold.

The steering conflict preserves main's reusable precomputation and measurement
buffers together with the model branch's per-tick observation reset. One test
helper now passes an output buffer to main's precomputation API; its assertions
are unchanged. The simulation golden hash and qualified-travel tests pass.
The model rendering follow-up remains linked under the completed simulation
archive, rather than restoring the retired active spec.

## Verification

- Vercel-mode clean WASM and web production build passes.
- TypeScript and all 404 web tests pass.
- Lint exits successfully with two warnings in pre-existing audio/test code.
- Independent Codex review found no actionable regressions. Its complete asset
  loader, animation and geometry checks passed; its later appearance fixture test
  hit a sandbox localhost-bind restriction. The remaining bake checks were then
  run outside that sandbox and pass, including appearance admission and card parity.
- The [production capture](production-close.png) uses the Vercel-mode built app,
  the real-map battle route, SwiftShader, a frozen simulation and a close camera.
  It records 15,560 soldiers with the GPU renderer ready and no page errors in
  [the captured stats](production-stats.json). The scene/map differs from the
  user's unrecorded deployed battle; the camera approximates the reported view.
  This is an integration capture, not a new claim of an exact baseline repeat.

## Browser gate limits

The ordinary `bun run verify` run reports nine failures and no page errors:

- Six changed snapshot comparisons: battle-standards-tactical (2.0687%),
  battle-standards-approach (19.8875%), battle-standards-eye (44.5605%),
  battle-initial (10.1705%), battle-banner (14.2191%), battle-manual (9.0056%).
  Each committed baseline is byte-identical on the two merge parents. Those
  images were not refreshed by the model delivery, and this merge does not
  re-bless them. This is not a fully green visual-regression suite.
- Banner-gallery and battle-selection exceed their 20-second readiness limits.
  Battle-renderer-default reaches readiness but its screenshot exceeds 30 seconds.
  The run overlaps native tests; these timings do not establish a quiet-machine
  startup or rendering budget. No timeout is raised to conceal the results.

The functional LOD visibility checks, default-renderer readiness, battle spawn,
movement and camera checks pass. The model branch's broader
[existing test-change ledger](../../30/final-test-ledger.md) retains the
feature's assertion changes. No balance stats, golden-hash pins or test
assertions are changed by conflict resolution.

## Fresh visual inspection

A fresh reviewer inspected the close captures and a
[foreground crop](production-figure-crop.png). Exposed legs, sandals, arms and
weapon grips appear attached; no clear missing geometry or detached equipment
was identified. Grass conceals much of the formation and limits inspection of
other figures. Oversized, bright grass, central banner occlusion and pale armor
patches remain visible limitations; this merge does not claim to fix them.

The separately accepted
[model rendering performance follow-up](../../../../../sim-perf/model-rendering-follow-up.md)
remains open.
