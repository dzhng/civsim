# Slice 03B4C5B4B1A2 - close body perf envelope

## Contract

Record the accepted close-body architecture and render model's density and
performance envelope before B4B2 tunes coverage. B4B1A1, B4B1A1R, B4B1A1S,
B4B1A1T, B4B1A1U, B4B1A1V, B4B1A1W, and B4B1A1X did **not** accept a body.
This slice may only start after B4B1A1Y or a later close-body
ownership/silhouette slice accepts a visually plausible body path.
This slice owns **budget shape only**: record counts, primitive counts, bytes,
draw calls, CPU build/upload costs, and obvious LOD pressure.

Out of scope: changing body architecture, coverage tuning, strand scale, clump
rhythm, atlas colour/content, camera-relative generation, backend policy, LOD
collapse, cliffs, water, sky, fog, terrain silhouette, and final reference
compose.

## Approach

- Freeze the accepted B4B1A0 lab and the close-body representation accepted by
  the latest B4B1A1 child slice.
- Run a small low/target/high density sweep for the selected representation.
- Record records accepted/emitted, primitives submitted, triangles, draw calls,
  instance/storage bytes, texture bytes, CPU build/upload time, and frame timing
  where available.
- Keep the visual parameters within the selected architecture. Do not swap
  primitive families or use GPU-only generation as a density shortcut.
- Produce one local budget decision for B4B2-B4B5 and a warning for B4C0:
  continue with current budget, continue with a reduced target budget, or mark
  backend work as likely needed later behind the same record seam.

## Accept / Reject

Accept if B4B2 receives a clear target budget and a bounded high-water mark, and
if the selected architecture remains visually plausible at the target density.

Reject if the selected architecture only works at a count that has no credible
path to camera-relative LOD, if timing/bytes are unmeasured, or if the sweep
changes visual variables that belong to B4B2-B4B5.

## Verification

- Archive low/target/high contact sheet, stats JSON, timing notes, and budget
  decision note under
  `assets/03b4-evidence/03b4c5-close-foreground-lab/body-perf-envelope/`.
- Use `compare-screenshots` only to confirm the target-budget shot does not
  visually regress from the accepted close-body architecture and render model.
  Do not compare this slice to the final reference.
- Run unprimed `screenshot-critique` scoped to perf-sweep artifacts: popping,
  obvious sparsity, card walls, dense noise, or hidden exposed ground.
- Open the sweep sheet with `preview-shots` as a non-blocking checkpoint.
- Keep focused lab route checks, perf telemetry, and `tsc --noEmit` green.

## Next Slice

Continue with `03b4c5b4b2-close-body-coverage.md` using the accepted target
budget.
