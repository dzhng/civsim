# TypeGPU preflight

Research checked 2026-09-15 against the published packages and official source.

This is an API correctness preflight, **not a battle candidate or a performance result**.
It is unrankable until it consumes the shared replay fixture and implements every
required pass. No Three renderer or shared raw rendering implementation is called.

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
effects and post passes; none are supplied by this preflight.

Native TypeGPU pipelines can bind external command encoders, render/compute
passes, indirect buffers, and timestamp writes in the pinned declarations.
These are a basis for implementing one chosen frame graph, not evidence of
battle parity. The core's camera/depth and asset data contracts can be consumed
without importing Three orchestration. Device limits, main/shadow audiences,
resource resizing and lifetimes still need fixture-driven tests. The candidate
must port shared algorithms where warranted and report their work, rather than
claim a library speedup from a different shader-authoring syntax.
