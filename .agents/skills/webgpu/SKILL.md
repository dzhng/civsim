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
- Treat read-only world decals as a one-way boundary inside a frame. Once
  ground cues, shadows, roads, or other `depth=read` world decals begin, no
  later world pass should write depth; otherwise the frame is relying on
  painter-order color overwrites instead of the depth buffer.
- World-space ground cues are not HUD overlays. If a marker belongs on terrain,
  submit it through the world camera and let real geometry occlude it; reserve
  screen overlays for labels, HUD, minimaps, debug UI, and deliberately
  non-world effects.
- Selection, order, targeting, and path cues should be verified by their
  semantic ground-cue/effect pass, not by an incidental terrain or mesh bucket.
  A correct cue can be a read-only world decal or tactical line without being
  part of the terrain geometry count.
- Ground decals on raised or tilted terrain need the same surface height as the
  world objects they mark. A selection ring, shadow, road, or footprint that
  assumes flat `z=0` can disappear under the terrain or drift away from the
  model even when its x/y coordinates are correct.
- Continuous world paths should be continuous geometry. Do not create road,
  rail, river, or path continuity by cutting endpoint gaps around occluders;
  resample the path onto the canonical surface and let depth-tested world
  objects occlude it.
- Instanced world props need a base-elevation field when they live on raised
  terrain. An instance layout that carries only x/y/scale can look fine on a
  flat fixture while trees, rocks, crowds, or buildings float, sink, or lose
  depth ordering on the real map.
- Tilted world scenes need one canonical surface. If terrain, water, roads,
  labels, props, or hit tests must stay geographically aligned while the camera
  moves, project and draw them from the same 3D surface/height contract. A flat
  textured underlay plus separate raised world objects will drift under
  perspective even when the source coordinates are correct.
- Geographic effects need a canonical mask/projection owner. Water glints,
  coast foam, fog reveal, biome tints, and terrain overlays must sample or be
  generated from the same world-space mask that owns the gameplay geography;
  unmasked decorative quads/ellipses are only valid for non-geographic
  atmosphere and must not independently decide where land or water exists.
- Secondary world views need the same contract as the primary view. Minimap,
  overview, reflection, shadow, and debug views should expose or consume
  canonical world-space anchors instead of carrying private scale/offset math;
  verifier tolerances should match the source grid resolution.
- Nested objects must be proven with hostile-order fixtures. Submit an occluder
  first, submit the nested/rear object later, then sample or crop pixels that
  prove depth, not painter order, owns visibility.
- Browser checks can pass while the canvas is visually wrong. Inspect actual
  PNGs after WGSL, pipeline, camera, pass-order, depth, or blend changes, and
  reject black frames, transparent canvases, flattened occlusion, or UI layered
  over world geometry by accident.
- Treat WebGPU validation warnings as failed renders. A bad pipeline can leave
  route stats and app hooks alive while command buffers are invalid and the
  canvas is black. Capture console warnings and fix the root contract, commonly
  vertex stride/attribute offsets, bind-group layout drift, attachment mismatch,
  or a depth mode that no longer matches the pass.
- Expose pass-level stats for render-affecting modes and resource contracts.
  If a shader path depends on a texture, mask, depth mode, or feature toggle,
  the route stats should say which path is active and what resource dimensions
  it consumed.
- Keep scenario assertions derived from the same contracts as renderer code.
  Hard-coded verifier copies of depth formats, phase names, role maps, or vertex
  strides drift into false confidence.
- Capability handling must match the product. An unsupported-WebGPU path may
  show a clear failure/fallback UI, but it must not silently route production
  visuals through an unrelated renderer to hide missing WebGPU behavior.
- Spatial budgets must not erase geography. If a map renderer caps mountains,
  forests, props, particles, or decals, reserve by canonical region/tile or
  connected feature before global sorting; batching and top-N selection are
  performance details, not permission to drop whole visible landforms.
- Stats that count submitted instances are not proof that the GPU rendered
  content. NaN instance fields, zero coverage, bad projection, or invalid
  shader state can leave counts healthy while pixels are blank; pair stats with
  crop/content probes for each visual class.

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
- When a snapshot fails, inspect the actual candidate artifact, not the blessed
  baseline path. Baselines prove what was accepted before; actual captures prove
  what the current GPU code rendered.
- When a projection-sensitive scene is disputed, add a tiny synthetic alignment
  fixture with known land/water/prop points and sample both semantic state and
  rendered pixels across multiple cameras before debugging the full production
  map or scene.
- Frozen-frame caches must key every render-affecting snapshot toggle. If a
  verifier intentionally preserves transient effects while the default freeze
  hides them, compare same-tick hidden-vs-visible pixels so the cache cannot
  silently reuse the wrong frame.
- Crop and upscale suspect regions before diagnosing small geometry, labels,
  sprites, flags, depth overlaps, or LOD artifacts.
- For GPU-backed screen overlays, expose semantic anchors such as center, edge,
  or baseline; do not tune visible spacing against the center of an atlas quad
  when the requirement is about an icon edge, marker edge, or text baseline.
- Screen-space text/icon arbitration belongs where measured overlay bounds
  exist. If a WebGPU label atlas pass owns text measurement, use that pass for
  collision/culling policy and expose cull stats; do not scatter per-entity
  offsets to paper over overlapping labels.
- Use metrics as telemetry: pixel diffs, grayscale, edge maps, luminance, and
  content counts can explain movement, but acceptance depends on named visual
  requirements and human readability.
- If a visual change is disputed or subtle, run `screenshot-critique` with an
  unprimed second pass before accepting it.

## Common Failure Smells

- A pass reports one semantic role while its pipeline uses another depth or
  blend state.
- A background or overlay pass draws true 3D objects.
- A flat background/underlay is expected to line up with 3D objects after camera
  tilt, zoom, or perspective changes.
- Route stats report healthy passes while console validation warns about an
  invalid pipeline or command buffer.
- A private shader camera/projection helper appears beside a shared one.
- A verifier repeats renderer constants by hand.
- A green scenario has no screenshot inspection.
- A type bucket appears in top-level frame or graph ordering where a semantic
  phase should be.
- A visual fix changes camera, lighting, model geometry, and pass order at once,
  leaving no clear cause for the result.
