---
name: webgpu
description: Build, debug, or review WebGPU/WGSL renderer and compute work. Use when changing GPU resource layouts, render or compute passes, bind groups, buffers, shaders, frame orchestration, depth/overlay composition, capability handling, performance, or browser-verified WebGPU visuals.
---

# WebGPU

Use this for WebGPU work where correctness depends on GPU resource ownership,
pass orchestration, WGSL layout, depth semantics, or browser-verified output.

## Workflow

1. Inspect the existing device/shell, pass graph, bind group layouts, shader
   contracts, and validation routes before adding a pipeline or buffer.
2. Define resources first: buffers, textures, uniforms, storage layouts, bind
   groups, ownership, update frequency, read/write access, and lifetime.
3. Choose the phase deliberately:
   - Use compute for parallel preparation, simulation, reductions, texture or
     buffer transforms, and work-list construction.
   - Use render passes for rasterized output.
   - Use separate background, depth-tested world, transparent/effect, and UI
     overlay phases when visibility semantics differ.
4. Single-source shared contracts. Camera layouts, projection helpers, depth
   modes, frame phases, semantic roles, vertex strides, and bind group schemas
   should live in one canonical module/source and be imported by renderers,
   shaders, and verifiers.
5. Validate in the browser. Run the narrowest scenario that exercises the
   changed pass, open the produced PNG, and use `compare-screenshots` when a
   visual before/after needs telemetry.

## Rules

- WGSL uniforms and storage structs must respect alignment. Pack scalar fields
  into obvious 16-byte slots when it reduces layout ambiguity.
- Treat depth as an access contract, not a boolean. Use explicit modes such as
  `read`, `read-write`, and `write`; make renderer stats and GPU pipeline state
  speak the same language.
- All pipelines in one render pass must be compatible with its attachments.
  Adding a depth attachment is a pass-wide change: update every pipeline in the
  pass, split the pass, or keep the pass depthless.
- Type buckets are batching details, not visibility policy. Sorting by mesh
  class, prop type, material, or instance bucket is valid only when the pass has
  the correct depth semantics for the world it draws.
- Do not mix alpha blending into depth-writing opaque geometry. Opaque/cutout
  world objects can write depth; translucent decals, shadows, selection rings,
  roads, and UI overlays need separate read-only depth or overlay phases.
- World-space ground cues are not HUD overlays. If a marker belongs on terrain,
  submit it through the world camera and let real geometry occlude it; reserve
  screen overlays for labels, HUD, minimaps, debug UI, and deliberately
  non-world effects.
- Nested objects must be proven with hostile-order fixtures. Submit an occluder
  first, submit the nested/rear object later, then sample or crop pixels that
  prove depth, not painter order, owns visibility.
- Browser checks can pass while the canvas is visually wrong. Inspect actual
  PNGs after WGSL, pipeline, camera, pass-order, depth, or blend changes, and
  reject black frames, transparent canvases, flattened occlusion, or UI layered
  over world geometry by accident.
- Keep scenario assertions derived from the same contracts as renderer code.
  Hard-coded verifier copies of depth formats, phase names, role maps, or vertex
  strides drift into false confidence.
- Capability handling must match the product. An unsupported-WebGPU path may
  show a clear failure/fallback UI, but it must not silently route production
  visuals through an unrelated renderer to hide missing WebGPU behavior.

## Performance

- Prefer instancing, batching, storage buffers, indirect draws where useful, and
  GPU-side phase preparation for scale.
- Avoid CPU readbacks in hot paths. Debug readbacks must be bounded, named, and
  removable.
- For iterative compute or simulation, split phases such as `state`, `apply`,
  `integrate`, `constrain`, and `correct`; use ping-pong buffers/textures when
  a pass reads previous state and writes next state.
- For neighbor queries, crowds, particles, or tiled effects, prefer spatial
  grids, tiles, or compacted work lists over O(n^2) scans.
- Expose meaningful knobs and stats: workgroup size, instance counts, draw
  counts, tile sizes, LOD thresholds, pass timings, and readback limits.

## Visual Validation

- Use the smallest route that exercises the changed visual surface, then open
  the generated PNG yourself.
- Crop and upscale suspect regions before diagnosing small geometry, labels,
  sprites, flags, depth overlaps, or LOD artifacts.
- Use metrics as telemetry: pixel diffs, grayscale, edge maps, luminance, and
  content counts can explain movement, but acceptance depends on named visual
  requirements and human readability.
- If a visual change is disputed or subtle, run `screenshot-critique` with an
  unprimed second pass before accepting it.

## Common Failure Smells

- A pass reports one semantic role while its pipeline uses another depth or
  blend state.
- A background or overlay pass draws true 3D objects.
- A private shader camera/projection helper appears beside a shared one.
- A verifier repeats renderer constants by hand.
- A green scenario has no screenshot inspection.
- A type bucket appears in top-level frame or graph ordering where a semantic
  phase should be.
- A visual fix changes camera, lighting, model geometry, and pass order at once,
  leaving no clear cause for the result.
