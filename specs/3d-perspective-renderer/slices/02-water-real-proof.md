# Slice 02 — Real depth + real projection, proven on the water route (KEYSTONE)

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
