# 14 — dispose-measure

**Contract unlocked:** we know whether layers leak across battle↔campaign
handoff. Dispose code is written only if they do.

Refactor-clean's rule: no cleanup path until the failure it guards changes a
real outcome.

## Seam

- The battle renderer is page-global and `BattleScene.exit()` never disposes
  it (`web/src/battle/scene.ts:231, 251`), so `campaign-handoff` does not
  naturally exercise disposal. Add an explicit dispose path for the probe:
  `__game.disposeRenderer()` that calls `PhotorealBattleWorld.dispose()` and
  drops the shared instance.
- Probe scene `web/scenes/system/renderer-lifecycle.mjs`: boot
  `?campaign=handoff`, loop battle → campaign → battle ×10 with the explicit
  dispose, sample per cycle `renderer.info.memory` (geometries, textures),
  `renderer.info.programs.length`, and
  `performance.measureUserAgentSpecificMemory()` where available. Publish the
  series in the scenario report JSON.
- Write the numbers into this file under "Measured".

## Decision rule

Monotonic growth in any counter across cycles → slice 14b: per-layer
`dispose()` for the 15 layers without one, explicit `instancedArray` /
`IndirectStorageBufferAttribute` frees, one owner per layer, gated by the same
loop staying flat. Flat → no code; record the verdict and delete the probe's
dispose hook if nothing else needs it.

## Delegated to the implementer

Cycle count; which counters are available on the current three.js WebGPU
backend.

## Verification

- G0; the probe scene runs under `VERIFY_GPU=1` on hardware
  (`VERIFY_GPU_ADAPTER=hardware`), not SwiftShader.
- `campaign-handoff` byte-identical.

## Measured

_(fill in)_

## Feedback that would change this slice

None.
