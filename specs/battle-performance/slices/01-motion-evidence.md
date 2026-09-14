# Production camera-motion evidence

Status: implemented and verified for baseline acquisition. The [evidence record](../assets/01-benchmark/README.md) owns full-menu checks, camera captures, raw timing and limitations. The baseline is slow; completing this measurement slice does not pass the final performance contract.


## Contract and question

Can the actual complaint be reproduced and attributed without changing rendering? This is the first runnable checkpoint and prerequisite to every comparison.

## API seam and ownership

Extend the existing `web/scene.mjs` infrastructure with a proposed `web/scenes/battle/battle-camera-performance.mjs` case and trace collector under the existing web verification helpers. Do not build a second browser runner. A `BattleMotionTrace` contains workload identity, timestamped input commands and expected camera checkpoints; `BattleFrameSample` contains the fields in [measurement](../measurement.md). `BattleRenderer` owns frame identity; `PhotorealWorld` owns GPU query coverage. Expose narrowly typed optional diagnostic stats through existing `window.__game.stats()`; no telemetry DOM work per soldier.

Follow `web/src/battle/scene.ts` through its observation/render scheduling before interpreting repeated work. Instrument `battleWorld.ts`, `battleGrassField.ts`, `bladeFieldLayer.ts`, `crowdLayer.ts`, `posePalette.ts` and `world.ts` only at their ownership boundaries. Freeze hardware-specific work/memory budgets in the report before optimizing. Distinguish existing bounded expensive work from unbounded backlog.

## Runnable artifact and verdict

Proposed invocation after implementation: `VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome bun run --cwd web scene battle-camera-performance`. Reuse current default battle launch and camera controls; add a replay/report surface in `apps/renderer-lab` only if the existing production hooks cannot present the trace. A report must link a playable production URL and the exact trace file. Existing commands are recorded in research.md; the proposed scene does not exist yet.

Run the shorter attribution traces and existing normal/stress checks in measurement.md. The menu-launched 300-second benchmark depends on 01a–01c and is deliberately NOT an exit dependency of 01; capture its original-renderer baseline after 01c and before 02. Save baseline raw JSON, camera poses, content counts and synchronized screenshots. Add controlled grass/shadow/animation ablations and separate first-traversal vs repeat. Verify input changes camera before any pending grass build finishes. Prove frame/query correlation or explicitly report its absence. Evidence, including a non-reproduction, is the exit result; this slice does not promise a fix.

Visual variable: reproduction/framing only. Compare the full battlefield above the HUD and the foreground formation against `assets/user-tactical-reference.png`; record inferred framing and do not pretend the original seed is known. Shadow weakness, speckled grass and existing art defects stay unchanged.

Delegated: trace serialization details, diagnostic layout and exact acquisition method; provisional 60 fps remains as stated unless the user changes it. Human correction of hardware, framing, army size or target updates the frozen workload before 02.

## Inherited verification and review

Keep existing camera, crowd LOD, animation/pose, grass sampling, depth, default-renderer and lifecycle checks green; run the narrow affected checks plus the standing hardware `battle-perf-30k` gate for renderer changes. Preserve its thresholds. Record pre-existing reds separately; do not re-bless unrelated failures. Simulation semantics and campaign consumers must remain unchanged.

For every visual artifact, inspect the actual candidate; use [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md) against the matched baseline/reference, then run an unprimed [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the **last visual acceptance check**. Use screenshot-regression/snapCheck for captures. Motion claims need a frame sequence/video as well as stills. Store evidence under this spec. Open review shots via preview-shots, allow about five minutes while doing other work, then record an evidence-based decision if no reply arrives and close the shots. Human feedback is non-blocking; failed acceptance is not.
