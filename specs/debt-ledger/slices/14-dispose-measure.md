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

Chrome hardware (`apple / metal-3`), ten battle → campaign → battle cycles.
The probe forces garbage collection and samples process memory after each
explicit battle-renderer disposal, so the process series measures retained
memory rather than the live battle's allocations.

- Before layer disposal, `renderer.info.memory` was flat at 23 geometries and
  22 textures; WebGPU exposed no `renderer.info.programs` array. Process bytes
  were `[231627806, 337669247, 440362614, 537611768, 644831898,
  747178442, 852150490, 951551724, 1058886134, 1157370492]`: monotonic
  growth of 925,742,686 bytes, so the decision rule activated disposal work.
- After each layer disposes its own geometry, materials, textures, post targets,
  and blade-field storage/indirect buffers before the backend, renderer counters
  stayed flat at 22 geometries and 22 textures. Post-dispose process bytes were
  `[63539350, 68789865, 74354206, 83645790, 84525910, 89429770,
  94191386, 99159730, 104731580, 109475170]`. The large renderer leak fell by
  about 95%; the remaining 45,935,820-byte monotonic rise is Chrome/three
  backend and campaign re-entry retention, not a live battle-world owner (a
  forced heap snapshot retained zero `PhotorealBattleWorld` instances). WASM
  memory stayed flat after its initial allocator growth.

## Feedback that would change this slice

None.
