# Merged local-palette transport

The assembled staging tree is separate from the verified main workbench until
producer, assets and every consumer can be installed together. No old-format
fallback was retained. These checks accept transport, not detailed art, temporal
continuity or the later live animated budget.

## Source and CPU

At2f8b0fe7 plus the reviewed integration cleanup, `bun run typecheck` and
`bun run test` from `web` pass:274 tests in55 files after timing cleanup. `bun run bake:test` also
passes, including every source/decoder oracle, deterministic placeholder and
diagnostic rebakes, bounds and committed card synchronization. No Rust source
changed in this pass; staging uses a local copy of main's verified WASM build.

## Browser

Commands use `VERIFY_GPU=1`, explicit `VERIFY_URL=http://127.0.0.1:5197`, bundled
Chromium/SwiftShader, and absolute `SCENARIO_REPORT_JSON` paths. No threshold or
viewport was relaxed.

- [Initial assembled run](merged-initial.json) exercises `pose-palette`,
  `raw-pose-palette`, `battle-model-palette`, workbench, replay, swatches and
  reload-disposal. Its numerical/actual consumer checks pass; its real lifetime
  and warning failures, stale semantic fixtures and deliberate image changes
  were investigated rather than accepted.
- [Strict expanded repeat](merged-strict.json) passes314 checks across replay,
  far admission/bundles/properties, image properties, swatches, normals and
  workbench. Every reviewed baseline compares at0 pixels. Two other scenes
  failed setup: an external WASM symlink was outside Vite's allowlist, and root's
  integration edit triggered hot reload during grounding. The overall report
  deliberately retains those failures.
- [Grounding repeat](merged-grounding.json) passes all31 grounding checks and
  zero-tolerance images; default battle still had Vite's cached external WASM
  resolution. Replacing the symlink with an ignored local build copy and
  restarting Vite fixes the actual path without widening filesystem access.
- [Final default battle](merged-default.json) passes all7 production checks and
  the runner's no-page-errors check after that restart.
- [Merged reload/disposal](merged-lifetime.json) passes all16 lifecycle checks
  and no page errors, including real palette/atlas waits and exact resource
  retirement.

The [visual verdict and changed-test ledger](merged-comparison/review.md) cover
the four re-blessed image files. Their repeated candidate PNGs are byte-identical;
idle model geometry, fixed framing, material identity and ordinary scene content
remain unchanged. The corrected shared kernel's independent raw repeat is in
[raw evidence](raw-palette-cutover.md); the same64-case oracle also runs through
the assembled scene above.

## Long hardware run

The first uninterrupted Apple/Metal3,1280×800 run at30,560 soldiers meets the
unchanged33ms timing gates, but is not accepted: Three reports its compute timing
query pool is exhausted because the world only drains render queries. The
[query-lifetime correction](timestamp-query-lifetime.md) fixes that resource
lifecycle and adds browser-warning enforcement to the existing standing scene.
The [final hardware repeat](merged-perf.json) passes: render GPU median12.18ms
mid and11.83ms vista; camera pan/zoom/wheel rAF p95 are19.97/23.88/20.71ms.
All existing close-grass, crowd and33ms gates pass. There are no renderer warnings
or console errors;16 exact Chrome audio-autoplay policy warnings are counted
separately. Render-only timings remain distinct from07's required compute-inclusive,
frame-correlated measurements.

## Review boundaries

Producer and individual adapters received their recorded independent reviews.
The assembled reload fix and integration cleanup additionally received separate
read-only reviews with no actionable findings; main-agent diff and ownership
review agree. The later CLI attempt is unavailable due a server400 requiring a
newer CLI, so it is not represented as a successful CLI review. No installation
or model-setting change was made. The independent fallback and exact scope are
recorded in the corresponding evidence leaves.

Before committing: retain only source, actual regression baselines and curated
evidence; omit dependency links, scratch scripts, logs and intermediate image
derivatives. Then install the complete coherent cutover, not just its producer.

## Installed checkpoint

The complete tree fast-forwarded the main feature worktree to4d75b7cd. Its
[post-install repeat](installed-browser.json) passes all selected numerical,
raw/Three consumer, workbench, replay, reload/disposal and swatch checks with no
page errors. Typecheck and274 tests pass there too.06a/b transport is installed;
06c temporal acceptance remains open, followed by07 budgets and detailed art.
