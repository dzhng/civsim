# TypeGPU production acceptance

This is the final production route, not a backend-selected lab facade. The
published soldier mesh catalog is unchanged; the promising two-thousand-triangle
intermediate experiment was not enabled.

## Live benchmark

The actual Menu benchmark completed its full 300-second measured window with live
simulation, default single shadows, standard grass and bloom. It recorded 7,287
valid intervals and no invalid intervals, starting at canonical tick 9000/hash
9928381812590497427 and ending at 16,426. It visited close, wide and horizon views
and all six camera phases. Every recorded callback submitted a new primary frame.
The result controls fit the viewport and JSON export retained the full recording.

| Metric | Result |
| --- | ---: |
| Average FPS | 24.29 |
| 1% low FPS | 9.58 |
| 0.1% low FPS | 7.16 |
| Minimum / maximum single-frame FPS | 6.67 / 60.02 |
| p95 / p99 frame time | 66.66 / 83.33 ms |
| Longest frame | 149.99 ms |

Hardware: Apple Metal 3, Chrome 153, 1440×900 CSS at DPR 2 (2880×1800 framebuffer).
Preparation took 65.9 seconds and is outside measured time. This is an observed
production run, not a matched live-FPS comparison or proof of smooth 60 FPS.
Remaining stalls are substantial. The recorded CPU replay and image-memory gains
have their own controlled evidence; they are not inferred from this FPS number.

[Summary](production-benchmark-summary.json), [compressed raw recording](production-benchmark.json.gz),
[run checks](benchmark-final.log), and [compiled-file hashes](build-manifest.json)
preserve the result. Later fixes affect input drag handling and report metadata
for non-default query flags, not this default measured workload. A separate
[override check](benchmark-settings.log) verifies the effective settings.

## Functional and resource evidence

- [833 web tests](unit-reviewed.log), TypeScript and the production build pass.
  Lab replay/mip/TypeGPU builds and TypeGPU/vgpu checks also passed during cleanup.
- [Core game flows](core-flows.log) cover default world/depth/full admitted crowd,
  explicit far impostors, click/box/order input, camera/wheel behavior, minimap,
  effects, menu settings, campaign handoff, and partial benchmark cancellation/export.
- [Ten lifecycle cycles](lifecycle.log) retain flat world resources and return every
  tracked battle buffer/texture to zero on disposal. These are requested logical
  bytes, not physical VRAM. Telemetry's own variable ring is measured separately.
- [Frozen input checks](battle-input-freeze-fixed.log) pass strict zero framebuffer
  differences at DPR 1/2. [The diagnosis](freeze-resolution.json) distinguishes the
  renderer from overlapping DOM SVG rerasterization.
- [Workbench, replay and disposal](model-accepted.log) pass all semantic checks and
  accepted SwiftShader baselines, including exact-pixel failed reload/reindex cases.

[Review findings and fixes](review-resolution.md), [test changes](test-changes.md),
and [the retired old-clock oracle](legacy-clock-audit.md) state the scope explicitly.
The old-clock failed attempt is retained in [its log](legacy-clock-attempt.log.gz);
it was not relabelled a passing visual gate. Existing CPU checks do not replace
its full historical temporal screenshot coverage.

## Visual evidence

[Default tactical view](tactical/default.png) and [shadows disabled](tactical/off.png)
approximate the user's supplied framing. Front/middle enlarged crops accompany
both. [Independent review](final-visual-audit.md) found readable default shadows,
retained formations and stronger grounding, with repeated rank shadow bands and
busy ground texture remaining visible limitations.

The initial snapshot comparison used much older placeholder imagery and flagged
forest crowns. Matched [current Three](forest/source.png) and
[TypeGPU](forest/typegpu.png) controls, including enlarged crowns, show the same
canopy limitation. This is parity evidence, not a claim that forest quality is ideal.

[Model review](model-visual-review.md) found no lost geometry/equipment/poses/UI.
The [current-source heavy model](current-source-heavy.png) matches the candidate's
more directional shadow and weak close contact; the historical snapshot had a
softer footprint. Close contact shading remains a limitation. Prior baselines are
preserved in `previous-baselines/` and `previous-model-baselines/`; accepted images
are in `accepted-battle/` and `accepted-models/` as well as the executable snapshot tree.

[Overlay review](overlay-visual-review.md) confirms visible ground-related circles,
order paths and intact HUD/layering at physical-distance framings. Dense marker
clutter and abbreviated labels remain style limits. These screenshots use the
real generated terrain and selected formation, not an empty verification scene.
