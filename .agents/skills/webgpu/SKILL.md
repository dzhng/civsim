---
name: webgpu
description: Build, debug, or review WebGPU/WGSL renderer and compute work. Use when changing WebGPU passes, bind groups, buffers, shaders, frame orchestration, GPU performance, capability handling, or screenshot-gated WebGPU visuals.
---

# WebGPU

Use this for WebGPU implementation work where the hard part is GPU resource
layout, pass orchestration, WGSL correctness, or visual/performance validation.

## Workflow

1. Inspect the existing WebGPU shell, pass graph, bind group layouts, and shader
   contracts before adding a new pipeline.
2. Define the resource layout first: buffers, textures, uniforms, bind groups,
   ownership, update frequency, and read/write pass boundaries.
3. Choose render vs. compute deliberately. Use compute for parallel simulation,
   preparation, reductions, or texture/buffer transforms; use render pipelines
   when rasterization is the work.
4. Keep pipelines composable: stable bind group layouts, explicit pass order,
   ping-pong resources for iterative effects, and no read/write hazards.
5. Validate in a browser, not just TypeScript. Run the smallest WebGPU scenario,
   inspect the produced PNG, and use `compare-screenshots` for parity work.

## Repo Rules

- Prefer the existing `RawFrameShell`, camera uniform, render passes, scenarios,
  and screenshot artifacts. Do not create a second WebGPU device/context path
  unless the current shell cannot support the feature.
- WGSL uniforms and storage structs must respect 16-byte alignment. Pack small
  scalar uniforms into vec4 slots when it keeps offsets obvious.
- All pipelines inside one render pass must be compatible with the pass
  attachments. Adding a depth attachment is not a local change: either update
  every pipeline used in that pass, split the pass, or keep depth off. A green
  scenario route is not enough; open the screenshot and reject black frames or
  flattened/incorrect occlusion.
- Use instancing, batching, storage buffers, and GPU-side phase passes for scale.
  Avoid CPU readbacks in hot paths; debug readbacks must be bounded and named.
- For iterative effects or simulations, separate phases such as `state`,
  `apply`, `integrate`, `constrain`, and `correct`. Use ping-pong buffers or
  textures whenever a pass reads the previous state and writes the next state.
- For neighbor queries or crowd/particle work, prefer spatial grids, tiles, or
  compacted work lists over O(n^2) scans.
- Expose performance knobs that matter: workgroup size, instance count caps,
  tile/grid size, LOD thresholds, and readback limits.
- Capability handling must match the product surface. In this repo, WebGPU is
  the production renderer target; unsupported-device UI is allowed, but visual
  parity must not be achieved by silently falling back to the retired renderer.

## Validation

- Static checks: `cd web && ./node_modules/.bin/tsc --noEmit` and
  `cd web && ./node_modules/.bin/vite build`.
- Browser checks: run the narrowest `VERIFY_WEBGPU=1 node scenario.mjs ...`
  route that exercises the changed pass.
- Visual checks: open the generated PNGs yourself. For parity, run the
  `compare-screenshots` helper and report the score movement.
- If a disputed visual change remains, run `screenshot-critique` with a fresh
  unprimed sub-agent before accepting it.
