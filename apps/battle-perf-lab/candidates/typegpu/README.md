# TypeGPU candidate work

Research checked 2026-09-15 against the published packages and official source.

This contains an API preflight and a partial sky port, **not a complete battle candidate or a performance result**.
It is unrankable until it consumes the shared replay fixture and implements every
required pass. The candidate runtime calls neither Three nor a shared raw renderer;
the isolated numerical control uses Three as its reference.

The source adapts Software Mansion's [triangle](https://github.com/software-mansion/TypeGPU/blob/7591c49a0f9affe2f628111685afa6038f49d9e5/apps/typegpu-docs/src/examples/simple/triangle/index.ts)
and [compute-to-vertex-buffer boids](https://github.com/software-mansion/TypeGPU/blob/7591c49a0f9affe2f628111685afa6038f49d9e5/apps/typegpu-docs/src/examples/simulation/boids/index.ts)
patterns to three deterministic vertices. A compute pipeline writes a caller-owned
buffer, and a render pipeline reads it as vertex input. Both pipelines use the
public `.with(GPUCommandEncoder)` interface so the caller can submit their work
together. A second offset verifies that subsequent uniform writes are observed.

The [root lifetime contract](https://docs.swmansion.com/TypeGPU/apis/roots/) and
[external buffer interop](https://docs.swmansion.com/TypeGPU/integration/webgpu-interoperability/)
are verified by an additional queue write and readback after destroying borrowed
wrappers. The caller still owns the external device and buffer and must destroy
them. TypeGPU-owned buffers are explicitly released, because destroying a
borrowed root does not destroy its device. The adapted examples retain their
[MIT license](TYPEGPU-LICENSE).

Exact development dependency pins and resolved integrity values live in the
repository's normal owner, `web/package.json` and `web/bun.lock`: TypeGPU 0.12.5,
its build plugin 0.12.3, and candidate-only WebGPU type definitions 0.1.72.
`web/vite.typegpu.config.ts` adds the TypeGPU transform only to this lab build.
The candidate tsconfig opts into full WebGPU definitions rather than replacing
the production project's existing GPU declarations.

Run from the repository root:

```sh
bun install --cwd web --ignore-scripts
web/node_modules/.bin/tsc --noEmit -p apps/battle-perf-lab/candidates/typegpu/tsconfig.json
bun run --cwd web build --config vite.typegpu.config.ts
bun run --cwd web vite preview --config vite.typegpu.config.ts --host 127.0.0.1 --port 5187
# Obtain the shared GPU slot before this hardware check:
node apps/battle-perf-lab/candidates/typegpu/verify.mjs
```

The verification records validation errors, exact compute readbacks, borrowed
resource lifetime, and pixels from the actual rendered triangle. The committed
[hardware result](evidence/preflight.json) passed on the Apple Metal adapter with
no validation or page errors; [the rendered output](evidence/preflight.png) shows
the computed triangle. This is not a frame-rate or battle-parity result.

## Full fixture boundary

The prospective TypeGPU world receives the existing `BattleReplayAssets`,
`BattleReplaySettings`, and `BattleReplayFrame` contracts from `../../src/fixture.ts`.
It must preserve the physical framebuffer, recorded camera, environment, terrain,
soldier assets/playback, and cue inputs. That requires TypeGPU-owned terrain,
scenery, animation/skin/LOD, grass routing, directional shadows, sea/atmosphere,
effects and post passes; the sky port below covers only a subset of atmosphere.

Native TypeGPU pipelines can bind external command encoders, render/compute
passes, indirect buffers, and timestamp writes in the pinned declarations.
These are a basis for implementing one chosen frame graph, not evidence of
battle parity. The core's camera/depth and asset data contracts can be consumed
without importing Three orchestration. Device limits, main/shadow audiences,
resource resizing and lifetimes still need fixture-driven tests. The candidate
must port shared algorithms where warranted and report their work, rather than
claim a library speedup from a different shader-authoring syntax.

## Physical sky pass

[sky.ts](sky.ts) is the first partial backend pass. It owns the linear HDR LUT
and background pipelines through TypeGPU. The renderer-independent
[WGSL bodies](../../../../packages/battle-renderer/src/shaders/physicalSky.ts) preserve the production atmosphere
math and use the canonical physical parameter module. Equirectangular storage
uses Three's paired y-latitude conversion while scattering remains z-up; rotating
only one side would silently rotate the authored environment.

The fixture supplies unnormalized world-space camera rays, excluding translation.
Background output remains linear HDR for the eventual shared post pipeline. The
sun disc is added during sampling and stays outside the LUT, preserving the
production distinction between visible sun and environment illumination. This
pass does not implement PMREM, whole IBL, or full fixture parity.

[sky-check.html](sky-check.html) is an isolated control entry that imports Three;
the candidate runtime does not. Its checks compare all LUT texels and background
samples across the environment presets before display transforms. Start the lab
Vite development server with the candidate config, then run
`node apps/battle-perf-lab/candidates/typegpu/verify-sky.mjs` only after acquiring
the coordinated GPU slot. This diagnostic awaits readbacks; the rendering API
only encodes work. Numerical correctness is independent of performance ranking.

The [numerical hardware evidence](evidence/sky.json) compares the isolated control
before display transforms. Production NodeMaterial's final `max(output, 0)` is
part of the required output contract too: omitting it leaves nonfinite values in
a few low-sun, below-horizon LUT texels. The port preserves that operation rather
than modifying the atmosphere equations. The current comparison gate allows one
half-float step at the measured radiance range and rejects all nonfinite values.

## Post pass

[post.ts](post.ts) owns the bloom pyramid, grade uniform, bind groups and pipelines
through TypeGPU. Native candidates share pure [post shader functions](../../../../packages/battle-renderer/src/shaders/post.ts),
while each retains its own resource and encoding lifecycle. The fixture supplies
validated grade state and opaque linear HDR; the final pass applies AgX and the
sRGB transfer once, so its output target must not apply another sRGB conversion.

The [independent numerical control](../raw-post/README.md) runs the same fixture
against both native candidates and the production Three chain. Its committed
results have exact agreement at half-float output precision, including bloom
toggles and changed grading/exposure. This does not establish full renderer
parity or a performance advantage.

## Shared environment resources

`createTypegpuEnvironment` owns TypeGPU sky/PMREM preparation, the exact DFG
texture, typed view/lighting uniform and environment bind group. It exposes the
shared `shade` function with the native surface arguments plus camera eye;
geometry roughness is an explicit caller input. The environment's group index is
assigned by TypeGPU, while the canonical 192-byte camera schema lives in
`camera.ts` at index 0. This avoids the pinned library's missing-bind-group error
for anonymous gaps when forcing a sparse index 3. It changes binding assignment,
not shader math or fixture bytes. The pure environment functions remain shared
with native rendering; no native pipeline or Three runtime implements this path.

PMREM sampling functions have one TypeGPU adapter owner in `pmremSampling.ts`.
The root/device and borrowed camera buffer follow the already-tested lifetime
contract above. Every owned texture and buffer is disposed explicitly.

The [terrain component control](../terrain/README.md) now uses this environment
with actual TypeGPU ground/horizon pipelines and one- or four-sample attachments.
The shared material algorithms and production geometry are preserved. Its
single-sample ground gate passes; coplanar horizon and four-sample beauty gates
remain open, so this is not a complete or eligible benchmark backend.

## Complete scene composition

`battleScene.ts` composes the existing TypeGPU component owners with the shared
camera, crowd history, terrain preparation and grass publication policy. Crowd
updates are awaited and submit pose work even when no frame follows. UI updates
remain separate; `prepare` refreshes camera-dependent presentation, and `encode`
records grass routing, shadows, HDR world and final output into a caller-submitted
TypeGPU command encoder. Public native-encoder interop is used by TypeGPU-owned
pose, sky and post pipelines; no raw candidate performs their work.

Camera buffer and bind-group identities survive framebuffer resize. Replacement
attachments and the entire post chain are admitted before commit. Disabling post
uses the source direct AgX/sRGB output, bypassing both bloom and artistic grading.
A failed terrain staging operation preserves the old prepared scene; a failure
in a dependent owner after terrain commits closes the scene rather than exposing
mixed terrain generations. Disposal closes the scene immediately and awaits an
active operation's cleanup through that operation's promise.

A crowd reload is staged the same way and behind one GPU admission: the installed
generation keeps drawing until the replacement has allocated, carried the admitted
pose and validated, and a rejection or a disposal mid-load releases only the stage.
The pose is carried through the latest camera the scene posed the crowd through,
which is a source upload's when no preparation has completed yet — an upload admits
a drawable pose, so a reload before the first frame must reproject it rather than
retire it. An upload camera carries a pose only; the prepared camera a consumer
reads still names the last completed preparation. Nothing resurrects a scene closed
while the stage was in flight. Terrain, environment and frame attachments are never
rebuilt to reload a crowd.

What the scene has admitted is published as identity, not as a scan. The crowd
epoch, the audience's own submission counter and the committed terrain generation
form one O(1) record a consumer may take on every presented frame; a replacement
history restarts its submission counter, so the epoch is what separates two poses
that both call themselves the first. Whole-population seating is measured only when
a caller asks, through the shared crowd-audience diagnostics both worlds already
use, and refuses — rather than passing vacuously — while an operation is in flight,
with nothing admitted, or over an empty pose. Depth is reported from the frame's own
installed attachment, so a resized or released buffer is described as it is.

What this world contains is reported the same way: every count in `stats()` is one
its own owner already holds — the environment it was built from, the committed
terrain generation with its scenery, vista and water owners, and each cue layer's
own uploaded count — so reading it rescans nothing and adds no readback. A disposed
or uncommitted terrain generation says so rather than publishing zeros that read as
an empty map, and this world installs no formation-debug layer at all. The candidate
declares its own `{ substrate, projection }` in [identity.ts](identity.ts): it writes
its camera through the same shared `frameCamera` owner the raw world does, so it
names the same single projector under its own substrate rather than borrowing that
world's name. Whole-population seating, per-frame draw calls and routed blade counts
remain unmeasured here and are named as such by the facade that consumes these.

The dedicated CPU lifecycle tests cover these boundaries, including late GPU
admission errors and pose-update ordering. Complete-scene browser controls and
fresh visual review are still pending for this composition; existing component
edge/cold-frame diagnostics remain open. This checkpoint establishes neither
full-scene fidelity nor performance eligibility.

## Typed colour helpers

The soldier faction helpers are the first shared algorithm this candidate expresses as
actual typed TypeGPU functions rather than WGSL text:
[soldierFactionTyped.ts](../../../../packages/battle-renderer/src/shaders/soldierFactionTyped.ts)
carries the sRGB transfer and the faction accent as `'use gpu'` TypeScript, and the crowd,
impostor, overlay and standard pipelines import that one owner. The formulas and the
canonical palette are unchanged: the colours still come from the battle faction module, and
the untouched [WGSL bodies](../../../../packages/battle-renderer/src/shaders/soldierFaction.ts)
remain the reference for every non-TypeGPU consumer and for the numerical control below.
Production still compiles the raw bodies; nothing here cuts over.

The surface bodies that call these helpers stay WGSL and bind the typed functions through
`$uses`, so the resolved shader keeps one definition of each helper rather than a copy per
pipeline. The candidate test config now applies the same TypeGPU transform the lab build
uses, because typed bodies only resolve to WGSL once their syntax tree is attached.

```sh
web/node_modules/.bin/tsc --noEmit -p apps/battle-perf-lab/candidates/typegpu/tests/tsconfig.json
web/node_modules/.bin/vitest run --config apps/battle-perf-lab/candidates/typegpu/vitest.config.mts
```

The first command is the type gate: the test file asserts with `@ts-expect-error` that wrong
argument and return types are rejected, so it fails if the helpers stop being typed. The
second resolves the typed bodies to WGSL and pins the palette, the single-owner property and
the sRGB threshold branch.

[color-check.html](color-check.html) is the hardware numerical control. It runs the same
inputs through the typed bodies and through the raw WGSL on one device and compares every
output word bit for bit, covering the sRGB threshold to a single f32 step on both sides, both
faction step edges to a single f32 step, the actual palette entries and a representative
ramp. Start the lab development server with the candidate config, then run
`node apps/battle-perf-lab/candidates/typegpu/verify-colors.mjs` with the coordinated GPU
slot; let the server settle after an edit, or it will serve the previous module. The report
lands in `throwaway/typegpu-colors/color-check.json` unless `TYPEGPU_COLOR_REPORT` says
otherwise. This is correctness evidence for two shader functions — not parity, not timing.

## High cascade-overlap numerical gate

The single-map source comparison prices the PCF, bias and reverse-Z contract
against the production oracle, and the Menu High lifecycle proves the mode runs.
Neither can see a **layer index, an overlap weight or the terminal fade**: one
binds one map and one record, the other reads pixels nobody has a closed form
for. [shadow-check.ts](shadow-check.ts) is the gate for that gap.

The receiver path is the production one. `createTypegpuSunShadow('csm')` owns
the depth array and packs the receiver block, `createTypegpuEnvironment` binds
both through the actual `sunShadowEntries`, and the fragment calls the
environment's own `sampleSunShadow` — `sunShadowSampleBodyWgsl('csm')`, the
shared sampler's text. The fit, camera and environment are genuine
`NativeShadowFrame`, `Camera3DParams` and `CivsimEnvironment` values, not a
contrived box. Nothing here re-implements the shader.

Only the depth CONTENT is synthetic. Each array layer is cleared by its own
render pass to its own known constant, so every cascade's comparison collapses
to a known 0 or 1 and what the fragment returns is the blend weight alone.

### What the expected numbers are

[shadowOverlapFixture.ts](shadowOverlapFixture.ts) places each probe where the
shared fade collapses to a closed form, and the probe table carries that form.
Writing `b` for the internal break, `m = 0.25b²` for the margin both cascades
take there and `M = 0.25` for the last cascade's margin at the capped far:

| probe depth | weights | why |
| --- | --- | --- |
| `b/4` | `1, 0` | below the first interval's centre the nearest edge is 0, so the margin is 0 and the ratio is the 0/0 the shader guards |
| `b ± m/2` | `1,0` / `0,1` | the overlap band's own boundaries |
| `b ± m/4`, `b` | `¾,¼` / `½,½` / `¼,¾` | inside the band one cascade's distance past the low edge is the other's distance short of the high edge, so the pair sums to **exactly one** |
| `1 − Mk` | `0, k` | the last cascade fades linearly in the remaining distance, reaching 0 at the capped far |
| `< 0`, `> 1` | `0, 0` | outside every interval |

`cascadePolicy`'s `cascadeBlendWeight` is checked against these, and is labelled
in the test for what it is: the CPU **transcription** of the same shader text,
so agreement proves the closed forms were read off the right formula and nothing
more. The independent claims are the collapsed forms themselves, plus three
properties measured on hardware rather than derived again — what each cascade
removes alone equals what both remove together, the overlap band is wholly
shadowed with no seam, and unoccluded layers leave the receiver lit.

### Tolerance, fixed before hardware

`2 × 1e-6 / m`. The fragment forms its linear depth as a four-term dot against
the view row (terms of order 1e3, so ~1e-4 at f32), subtracts the near plane and
divides by the ~1.5e3 span, leaving ~2e-7; the remaining normalised operations
add a few ulp, and 1e-6 is that rounded up about threefold. The blend divides
that error by the narrowest margin in play and two cascades accumulate. At the
shipped split this is ~1.2e-4 — some 700× below the smallest gap between two
distinct expected answers, which the CPU test pins so the tolerance cannot mask
a wrong weight. It is derived from the fit, never widened to admit a reading.
Readback is `r32float`, so no requantization sits between the two sides.

### Running it

```sh
web/node_modules/.bin/tsc --noEmit -p apps/battle-perf-lab/candidates/typegpu/tsconfig.json
web/node_modules/.bin/tsc --noEmit -p apps/battle-perf-lab/candidates/typegpu/tests/tsconfig.json
web/node_modules/.bin/vitest run --config apps/battle-perf-lab/candidates/typegpu/vitest.config.mts
# Then, with the coordinated GPU slot and the lab server on the candidate config:
bun run --cwd web vite --config vite.typegpu.config.ts --host 127.0.0.1 --port 5187
node apps/battle-perf-lab/candidates/typegpu/verify-shadow.mjs
```

The runner asserts the outcome it asked for, not the outcome it got, because the
mutations below are expected to FAIL. Expected failure counts only when GPU
validation is clean, every numerical readback is finite and complete, and the
injected mutation produces a numerical mismatch. A broken GPU run cannot certify
the negative control. Reports land in
`throwaway/typegpu-shadow/` unless `TYPEGPU_SHADOW_REPORT` says otherwise; each
retains every raw sample beside both oracles. Let the server settle after an
edit or it will serve the previous module.

### Proving the gate can fail

`TYPEGPU_SHADOW_MUTATION` is opt-in and off by default, and the page refuses an
unknown request rather than silently baselining.

- `layer-swap` exchanges the two layers' cleared depths. Every probe any cascade
  weights must move: the fit puts the two cascades' biased receiver depths in
  disjoint bands and one configuration clears **between** them, which is what
  keeps the swap visible at the break itself, where the two weights are equal
  and a symmetric pair would cancel. A probe outside every interval is
  deliberately unaffected — no layer is read there at all.
- `receiver-swap` exchanges the two cascade records in the packed block, leaving
  the control vector alone: a receiver reading cascade 1's matrix, bias and
  interval as cascade 0's, which is what a mis-ordered pack would do. It has no
  hand-derived expectation and is judged only by failing to reproduce the
  correct one.

### What this does not prove

Synthetic cleared layers are not casters. This gate says nothing about caster
fitting, cascade motion under a moving camera, PCF softness (constant layers
make the five taps identical, so the filter is bypassed by construction), or
whether a shadow reads correctly on screen. It is one numerical component gate
for the receiver's layer binding, overlap blend and terminal fade.

## Camera-independent impostor state

The billboard layer publishes what a soldier _is_ — world position, facing, faction,
elevation and corpse fade, six floats — and derives the drawable record from it in the
vertex stage. The anchor rotation, the atlas tile pick and the screen-size floor are
functions of those six values and one camera, so they belong on the GPU behind a single
48-byte view block. A camera that only moved writes that block and nothing else, at any
population; a submission is the only thing that costs per-soldier bytes.

[impostorDerivation.ts](impostorDerivation.ts) is that derivation, written as actual typed
TypeGPU functions rather than shader text: the tile directions are evaluated in closed form
from the grid the layer was built for, so nothing indexes a baked table and the anchor and
span are compile-time constants of the atlas. It reads no binding — the view arrives as an
argument — which is why the same function runs in the vertex stage, in the diagnostic
compute stage, and directly in JavaScript where a test can call it.

`packImpostors` is untouched and remains the independent oracle. The layer's `update` is the
[numerical control](../../src/impostorControlBackend.ts)'s combined entry and still returns
that oracle's record for the control to pin against Three; no frame path calls it.

```sh
web/node_modules/.bin/tsc --noEmit -p apps/battle-perf-lab/candidates/typegpu/tests/tsconfig.json
web/node_modules/.bin/vitest run --config apps/battle-perf-lab/candidates/typegpu/vitest.config.mts
```

The CPU suites run the typed bodies over a dense fixture — every cell bisector and both
sides of every cell edge, a full sphere through the below-horizon fallback, degenerate
distance, field and elevation, and the corpse fade — and compare each record to the packer.
TypeGPU stores struct and vector members at f32, so that run carries the shader's storage
precision but not its arithmetic. A tile index may differ only where the two cells were
baked from the identical direction (an even grid folds its corners onto interior cells) or
where the direction is equidistant between them; the 6x4 grid has no duplicate cells at all,
so its agreement is unconditional. Separate suites pin the bytes a camera move commits
through the real layer and the real audience against a recording device.

[impostor-record-check.html](impostor-record-check.html) is the hardware control, and it is
the part this candidate still owes. A compute stage runs the same typed derivation over the
same fixture, its actual buffer is read back, and the comparison uses tolerances derived
from WGSL's sin/cos bound and f32 rounding and declared before any comparison — a
nonduplicate, non-equidistant tile disagreement fails and is reported with its dot margin. A
second dispatch writes the view block alone and requires every record to become the new
camera's. Start the lab development server with the candidate config, then run
`node apps/battle-perf-lab/candidates/typegpu/verify-impostor-records.mjs` with the
coordinated GPU slot; the report lands in
`throwaway/typegpu-impostor-records/impostor-record-check.json` unless
`TYPEGPU_IMPOSTOR_RECORD_REPORT` says otherwise. Until that runs, the shader's own
arithmetic is unmeasured. This is correctness evidence, not a timing or parity result.
