# Slice 02 — Real depth + real projection, proven on the water route (KEYSTONE)

## STATUS: DONE (committed 2026-07-02, `6a5b5c0d`)

The keystone landed: the water route runs on the real 3D perspective camera + a
reverse-Z `depth32float` buffer, and the **dome/streak wedge is GONE** —
`/renderer/water-bakeoff` reads as a flat sea meeting a straight, level true
horizon (screenshot-critique: "straight and flat, not domed, waves recede
correctly"; compare-screenshots old-dome vs new: new decisively less wrong).
Reverse-Z + `depth32float` render **non-blank on SwiftShader** (risk retired). New
gate scene `web/scenes/system/water-horizon-real.mjs` (depth-format + level-horizon
asserts). Unit gate `web/tests/cameraUniform.test.ts` (4 tests): packed
`viewProj`/`invViewProj`/`eye` equal `camera3d`, 52-float/208-byte layout, and the
12 legacy scalars byte-identical with/without the real camera. All
`web/shots/misc/water/**` deliberately re-blessed (geometry moved under the real
projection). Non-water frozen scenes verified byte-identical
(`battle-terrain-elevation` seating tripwire `match=true`).

**Decisions recorded this slice:**

- **How the shell receives the real camera:** additive optional field
  `CameraSnapshot.camera3d?: Camera3DParams`. When set, `cameraUniformData` resolves
  `viewProj`/`invViewProj`/`eye`/`znear`/`zfar` via `camera3d` and packs them after
  the 12 legacy scalars (offsets: float 12 / 28 / 44 / 47 / 48; struct = 52 floats /
  208 B). **`aspect` is overridden by the live width/height** so the projection
  follows resize with a single owner. Legacy passes read only floats 0..11 →
  byte-identical.
- **Uniform is a superset, not a replacement:** `CAMERA_UNIFORM_WGSL` `struct Camera`
  appends `viewProj`/`invViewProj`/`eye`/`znear`/`zfar`; `projectReal(world)` is the
  new real projector. All legacy fns (`projectGround`/`projectWorld3d`/`worldDepth3d`/
  `civsim*WorldDepth3d`) were untouched — the short-lived migration seam collapsed at
  `04`/`05`.
- **Reverse-Z is opt-in per shell:** `FrameShellOptions.reverseZ` → `depth32float`,
  clear `0`; `depthContract` adds `GPU_DEPTH_FORMAT_REVERSE` + clear consts;
  `pipelineContracts` adds `gpuReverseZDepthStencil(mode)` (compare `greater` /
  `greater-equal`). Battle/campaign shells stayed on legacy `depth24plus` painter
  until `04a`/`05a`.
- **`WaterPlanePass` real path is opt-in (`opts.real`)** because battle's
  `horizonPass` ocean edge shares that class on the legacy `depth24plus` shell — the
  flag kept that byte-identical while only the bake-off route flipped to
  `projectReal` + `gpuReverseZDepthStencil('read-write')`.
- **Water framing:** an oblique out-to-sea camera (`yaw = −π/2`, infinite far →
  true-horizon vanishing line). Battle default `target[0,140,0]/dist 190/pitch 0.22/
  fov 0.78`; campaign (`?cam=campaign`) `target[0,200,0]/dist 240/pitch 0.38/fov 0.70`.
  URL-tunable (`pitch/dist/fov/targetY`). Two water look-scenes (`foam`, `albedo`)
  were re-based to sample the **near sea** (below the honest horizon-haze band) —
  the real camera reveals a real hazed horizon the fake projection compressed away,
  so the old fixed bands were reading haze as whitecaps / averaging albedo through
  aerial haze (haze is gated separately by `water-haze`). Dusk's mean is warm by
  design; blue-dominance is asserted for the daytime presets, dusk only stays off
  neon-green. No thresholds were loosened to hide a look.

**Known non-blocking reds at landing (pre-existing on HEAD, not this slice):** the
format gate (single/double quotes) red on committed HEAD; several water/coastal
battle snapshot baselines stale (identical diff counts before/after this slice);
the `water-silhouette` 8ms budget check fails only on the **SwiftShader software
rasterizer** (perf gates are hardware-only per the README).

## Contract unlocked

The finite water quad renders to a straight, flat **true horizon** — the "dome +
radial streaks" wedge is gone — using real view/projection matrices and a real
**reverse-Z `depth32float`** buffer, on **one isolated surface**. This de-risks the
entire rebuild (matrix pipeline + depth convention) before any shared-seam fan-out,
and it directly kills the motivating symptom. This is the **go/no-go** for the whole
approach.

## API seam

**Packages:** `renderer-core` (uniform, WGSL, depth contract, frameShell) +
`game-renderer/water` (the one consumer flipped) + `apps/renderer-lab` (route).

1. **Uniform, additive** (do NOT disturb the 12 legacy scalars — un-migrated passes
   must stay byte-identical): in `cameraWgsl.ts`, extend `struct Camera` with
   `viewProj: mat4x4<f32>`, `invViewProj: mat4x4<f32>`, `eye: vec3<f32>`,
   `znear: f32`, `zfar: f32`. Add `fn projectReal(world: vec3f) -> vec4f { return
   cam.viewProj * vec4f(world, 1.0); }`. Keep all legacy fns intact. In
   `cameraUniform.ts`, extend `cameraUniformData` to also pack the matrices
   (computed via `camera3d` from `01`); grow `frameShell.ts` `cameraBuffer` size +
   `writeCamera`. Bind group layout/visibility unchanged.
2. **Reverse-Z depth, centralized but opt-in per shell:** in `depthContract.ts` add
   `GPU_DEPTH_FORMAT_REVERSE = 'depth32float'` and a `reverseZ` notion; in
   `pipelineContracts.ts` add `gpuReverseZDepthStencil(mode)` (compare `greater` /
   `greater-equal`, write per mode); in `frameShell.ts` a per-shell `reverseZ`
   option → depth clear `0` + `depth32float`. **Battle/campaign shells keep the old
   painter path this slice** (separate routes/frames) so nothing else moves.
3. **Convert only** `water/waterPlanePass.ts`: `out.pos = projectReal(vec3f(world,
   baseZ + s.height))`, drop `civsimBattleWorldDepth3d`, use
   `gpuReverseZDepthStencil('read-write')`.

**Synthesis note (drafts disagreed):** adopt reverse-Z here (drafts B/C) rather than
deferring it (draft A). The `y1:1100` plane viewed from a near camera needs the
precision immediately and it's a single isolated contract flip. **Fallback** if
reverse-Z misbehaves on SwiftShader or costs too much: ship plain real-Z
(`depth24plus`, clear 1, compare `less`) and add reverse-Z later only if
depth-fighting appears — record the decision here.

## What the human can run / see

`/renderer/water-bakeoff` (existing `routeWaterBakeoff`, plane
`DEFAULT_WATER_PLANE={x0:-420,y0:-160,x1:420,y1:1100,res:340}`) now on a real
camera — the sea meets a real horizon at any window size. Keep the campaign-cam
variant (`?cam=campaign`).

## Verification

- **Unit:** `cameraUniform.test.ts` — packed `viewProj` equals
  `camera3d.viewProjMatrix` for a fixture camera; camera-buffer size/layout
  assertion; the 12 legacy scalar bytes are **byte-identical** to today (proves the
  superset didn't disturb legacy passes).
- **Visual variable = horizon straightness / absence of radial dome+streaks.**
  Crop/mask = the horizon band (top third of the water route). New scene
  `web/scenes/system/water-horizon-real.mjs`.
  - `screenshot-critique` (unprimed): "is this a flat sea meeting a straight
    horizon — no dome, no radial streak?" — **required last check**.
  - `compare-screenshots`: old dome baseline vs new → new must be judged **less
    wrong**. (The old dome shot is the candidate-vs-target target here.)
- **Depth-precision probe:** render two near-coplanar water sheets across the
  1100-unit span; confirm no z-fighting (validates the reverse-Z choice).
- **SwiftShader risk check:** confirm `depth32float` + reverse-Z render **non-blank**
  under `VERIFY_GPU=1` before trusting the gate.
- **Re-bless** `web/shots/misc/water/**` deliberately (geometry moves under real
  projection) — diff each, never blanket-overwrite.
- **Perf** (hardware only): frame time within budget (a matmul/vertex is cheaper
  than the per-vertex divide it replaces — a regression here means a bug).

## Must stay green

- Every **non-water** frozen scene stays byte-identical this slice (all other passes
  still call legacy fns). Prove it: run the full `scene.mjs` suite, expect zero diffs
  outside water.
- `cargo test --workspace` untouched.

## Human feedback that would change this slice

The horizon/framing sanity — this is the whole rebuild's gate. **Non-blocking**
checkpoint: open the before/after with `preview-shots`, ~5 min; if silent, decide on
the critique+compare evidence, record the go/no-go here, close the shots, proceed.
Reverse-Z vs plain real-Z is the other live knob, resolved by the precision probe.
