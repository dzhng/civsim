# Workbench acceptance evidence

The target for this slice is a readable, controllable view of actual production soldier rendering. Current box geometry and old motion are deliberately unchanged. This is harness acceptance, not acceptance of model quality against Rome II.

## Verification

- `cd web && bun install --frozen-lockfile` and `bun run typecheck` pass. Current-base WASM was rebuilt with `bun run build:wasm`.
- `VERIFY_GPU=1 VERIFY_URL=http://localhost:5174 node scene.mjs battle-model-workbench asset-workbench battle-renderer-default` passes: [final report](final-checks.json). All five workbench snapshots have zero differing pixels, including both production submission paths. Repeated standalone runs also passed after frame-boundary synchronization.
- Reload preserves identical pixels; malformed JSON and missing selected appearance are visible failures. Two malformed VAT retries leave scene mesh count unchanged, proving partial constructor allocations do not accumulate.
- Existing hardware `perf:30k` gate passes: [report](perf-30k.json). This is the paused benchmark, not the live animated budget promised by slice07.

## Comparison verdict

The earlier phalanx view was too small and nearly edge-on. The candidate changes only review bearing/scale, improving visible limb separation while keeping the entire pike in frame. Its image distance is 0.02866 and edge-energy ratio is 1.0837; these locate the framing change, not an art-quality improvement. Numeric slider readouts make poses reproducible. Heavy, formation and submission-parity images remain unchanged. [Comparison telemetry](comparison/visual-parity-diff.json) and [current captures](current/) preserve the evidence.

Verdict: the candidate harness is less wrong for close inspection. It does not claim to match the Rome II reference, which remains the later anatomy/equipment/material target.

## Unprimed critique

A fresh reviewer inspected four full images and two enlarged crops. Complete bodies/weapons were visible, including the phalanx spear tip; controls were readable and unobstructed, and all sixteen formation figures identifiable. The reviewer caught a singular/plural status error, corrected and re-inspected in the final controls shot.

Remaining findings: striped shadows (high confidence) and weak foot contact shading (medium confidence). Preserve these as production evidence for slices15/16 and29; do not hide them with workbench-only lighting. The inherited horizontally scrolling lab navigation clips its last visible label at the viewport edge; this is not a new model-control obstruction and is outside the asset harness change. No missing model or major clipping remains in the new review surface.

## Code and ownership review

Production battle observations and explicit fixture instances share one submission method, camera, crowd and environment. Asset reload reuses the existing loader; no second shader/importer is introduced. Independent Codex review identified missing active-pose validation and partial-allocation cleanup on failed reload; both are fixed and covered by the browser failure cases. Main shape/diff/docs review found no remaining slice01 blocker. No existing test expectation or sim behavior changed; the new scene adds coverage, and only its own new controls baseline was refreshed for the corrected status text.

Preview opened at 01:04 UTC on 2026-09-06 for a non-blocking review window while independent source-fixture work proceeded, then closed after six minutes without feedback. Proceed on the technical and visual evidence above. Human feedback can reopen the reversible harness framing; silence is not approval of the current model art.
