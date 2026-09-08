# Readback reference directions and semantic capture inventory

The production authored replay exposed 18 CPU-preposed raster parity failures and
two inventory failures. Actual GPU palettes matched the independent CPU bound,
and repeated event frames stayed exact. Maximum image-channel differences reached
27; these are retained failures, not excused by the accepted art quality.

## Bounded reference correction

The readback reference already used column-first Float32 positions, but borrowed
normalized double-precision normals/tangents from `poseSoldierMesh`. The production
material then normalized those directions again. Actual skinning instead weights
matrix columns in Float32, transforms raw directions, and normalizes in the shader
(including the tangent's scaled normalization). The reference now supplies raw
column-first Float32 directions and preserves tangent handedness, leaving that
normalization to the unchanged material. Independent source evaluation still uses
the original CPU owner. Production shaders, asset bakes and tolerances are untouched.

The new CPU tracer failed before the correction: normalized normal
`[.31622776,.94868332,0]` instead of raw `[.25,.75,0]`. It now requires that exact raw
normal and tangent `[-.75,.25,0,-1]`. Existing source-oracle preservation controls
remain exact. This proves the input arithmetic, not the final pixel outcome.

## Inventory correction

The scene's declaration encoded old placeholder release/death ticks, while the
actual replay recipe correctly derives those times from the authored clips.
One 13-sample semantic inventory now supplies both names and capture scheduling:
motion samples, release interruptions/exit, death and terminal hold. Runtime
recipe events still own actual tick values, which are included in the report.
No durations, sample counts, interruption checks or pixel thresholds changed.
Old baselines are deliberately retained for parent review; no images are blessed.

The inventory test varies exit/death/terminal timing (24/35/72 → 43/54/106),
requires the same 39 distinct semantic names across the three appearances, exact
derived offsets and explicit failure when a required event anchor is absent.

`vitest run tests/mountedTemporalFixture.test.ts temporal-replay.test.mjs
tests/soldierSkin.test.ts`: 3 files, 10 tests, exit 0. Web `tsc --noEmit`: exit 0.
Independent Codex review completed clean; input arithmetic, handedness, independent
CPU ownership and semantic scheduling had no concrete findings. Vite's test import
prints warnings for existing page-only dynamic `/@fs` imports; those callbacks are
not executed by the CPU inventory test.

GPU causality and the existing ≤1-channel raster gate remain pending parent
verification. No GPU capture or production-source change occurred in this pass.
