# Slice 1 — Technique bake-off spike (REQUIRED FIRST)

**This is the gate to everything after it.** It builds *both* candidate techniques behind
one seam, picks a winner on visual + perf evidence, and freezes the seam + the clock that
every later slice rides. No production pass is touched.

## Contract unlocked
- A chosen technique (Gerstner **or** IFFT) with a written, evidence-backed decision.
- A frozen `WaterFieldSource` seam (see README) both candidates satisfy.
- The animation **clock** plumbing decided and landed (known unknown #1).
- `capabilities.computeOceanSupported` exists and the IFFT route degrades to Gerstner when
  it is false.

## API seam (module / functions / data / ownership)
- `packages/game-renderer/src/water/waterField.ts` — the `WaterFieldSource` interface +
  factory. `WaterSample = { height: f32, normal: vec3f, foam: f32 }`. Owner: game-renderer.
- `packages/game-renderer/src/water/gerstnerField.ts` — candidate A (analytic WGSL,
  `bindGroupLayout()` returns null, `ensureFrame` is a no-op).
- `packages/game-renderer/src/water/ifftField/` — candidate B (JONSWAP spectrum init + IFFT
  butterfly compute passes writing a displacement/normal/foam texture bound at `@group(2)`).
- `packages/renderer-core/src/capabilities.ts` — add `computeOceanSupported` (compute +
  `maxStorageBufferBindingSize` probe via existing `assertStorageBufferFits`).
- `packages/renderer-core/src/frameShell.ts` — optional pre-render compute-dispatch hook
  (B only; slot it before the background pass inside the single command encoder) + write the
  clock uniform.
- **Clock (known unknown #1):** recommended default — add `time` to a free Camera-uniform
  pad and widen the camera bind group to `VERTEX | FRAGMENT` (`frameShell.ts:488-491` is
  VERTEX-only today). Alternative — the contract-blessed `frameConstants` resource
  (`renderGraph.ts:49-53`). Pick one in the decision artifact; **prove it moves zero
  existing pixels.**
- `packages/game-renderer/src/water/waterPlanePass.ts` — throwaway-for-now candidate-agnostic
  pass driving one tessellated open-sea plane at the battle horizon camera. It only calls
  `wgslSample()` and binds `bindGroup()`.

## What the human can run / see
`/renderer/water-bakeoff?tech=gerstner|ifft&preset=dusk|golden&t=<fixed>&compare=1` — one
open-sea plane (battle horizon camera, neutral grey albedo), frozen-`t` for snaps and
free-running for the eye, `compare=1` rendering both techs side by side. Publishes
`window.__rendererLabStats = { tech, gpuTimeMs, computeSupported, fieldResolution, fallbackTriggered }`.

## Verification gates
- **Perf gate:** `enableGpuTimer` + `timestamp-query` → `gpuTimeMs` for both techniques at
  the **battle and campaign cameras**, on the real target GPU(s) (`VERIFY_GPU=1`). Record a
  hard budget in the artifact and the explicit weak-GPU number.
- **Capability gate:** assert the IFFT route falls back to Gerstner when
  `computeOceanSupported === false` (force-unsupported path, mirroring the
  `forceNoDepth24`/`forceUnsupported` style in the capabilities route).
- **Visual:** run the `compare-screenshots` skill on each technique's frozen frame vs
  `assets/reference-ifft-ocean-dusk.png` — judged on **wave geometry + whitecap distribution
  + glint streak only**, not mood/albedo (the reference is dusk; our albedo is neutral).
- **Last check:** run the `screenshot-critique` skill on the bake-off montage — an unprimed
  second opinion on "which technique's open ocean reads more like a real choppy sea."
- **Decision artifact:** write `slices/01-bakeoff-decision.md` — winner, perf table
  (gpuMs / computeMs / storageBytes / weak-GPU viability per tech), capability matrix, the
  two reference-compare montages, the frozen seam signature, and the clock choice.

## Slice variable & crop
**Variable:** the technique itself (and the seam/clock it needs). **Crop:** full-frame
open-water plane, both techniques at identical camera + preset.

**Out of scope (explicitly):** final color grade, shore foam, campaign subtlety, any of the
three real surfaces, polished tuning. Judge geometry + foam + glint **fidelity-per-millisecond**.

## What must stay green
All existing battle/campaign snapshots (no production pass touched); `assertFrameGraphPasses`;
`fullGameRenderGraphReport().ok`; the capabilities scene.

## Human review checkpoint (NON-BLOCKING)
Open the side-by-side `?compare=1` route and the two reference-compare crops with the
`preview-shots` skill; give the user ~5 min. If they stay silent, the recorded
perf/fidelity rule auto-selects the winner; record the decision + rationale in the artifact,
close the previews, and proceed. The pick is reversible — every later slice is
technique-pluggable through the seam, so the user can override at any later slice.

## Feedback that would change this slice
"IFFT looks dramatically better and the perf is fine" → keep IFFT + retain Gerstner as
fallback. "Both look the same at this camera" → take Gerstner, delete IFFT in S11. A change
to the target-GPU floor → re-run the perf gate.
