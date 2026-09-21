# Native post numerical control

This isolated harness compares raw WebGPU, TypeGPU and vgpu post factories with the
actual production `BattlePostChain`. All receive identical half-float HDR texels. The input covers
color ramps, an emissive patch, values around the bloom threshold, and dark
values; the control exercises preset policy, changed grade/exposure, and bloom
toggling on an odd framebuffer. It measures encoded sRGB output stored in
RGBA16F before display quantization, rather than comparing duplicate CPU math.

The [recorded hardware result](evidence/post.json) has exact agreement for every
compared component. The raw implementation needs the same final alpha clamp as
Three's `RenderOutputNode`: bloom can raise alpha above one even with an opaque
scene. This check does not establish premultiplied-transparency behavior, battle
visual parity, or a performance advantage. Parameters come from the control's
validated grade state, as they do from a recorded battle fixture.

Odd dimensions matter to both the five-level bloom pyramid and the test itself:
Three's public readback returns GPU-aligned rows, which the harness strips before
comparison. Recreating the pass across presets reuses the same borrowed input,
checking that disposal preserves caller-owned resources.

The [native frame lifecycle extension](../../../../specs/done/battle-performance/assets/02-raw/frame-lifecycle/README.md)
adds direct-render bypass checks with fractional alpha while retaining these opaque
post-chain cases. Its verifier records new evidence under the spec assets; the
older result above remains historical.

From the repository root, start `web/node_modules/.bin/vite --config
apps/battle-perf-lab/candidates/raw-post/post.vite.config.mts --host 127.0.0.1 --port 5188`, then obtain the coordinated
GPU slot before running `node apps/battle-perf-lab/candidates/raw-post/verify.mjs`.
The factory adapter keeps one fixture/control owner for all three runtimes; the shared
shader source is used only by candidates, leaving Three independent. The standalone
config and Three control remain lab-only. The verifier closes its
browser even when an assertion fails.

The adapter returns a completed candidate output texture for shared readback. Each
backend owns its output and submission API: vgpu uses its public frame/target
encoding while raw and TypeGPU use their native-encoder contracts. All candidates
retain the same five bloom levels and shared shader algorithms. This adapter is
only a numerical-control seam; it does not force a common production runtime.

The [post timing diagnostic](timing.html) runs the unchanged numerical control
first, then measures a fixed HDR field at the physical battle framebuffer size
with bloom on and off. Ordered per-pass timestamps distinguish the blur pyramid,
composite, and final output without changing command batching. Only this
diagnostic opts into detailed telemetry; ordinary exports retain aggregate stages.
The [driver](time.mjs) writes a durable report even when the page fails. With the
server above running and exclusive GPU access granted, run
`node apps/battle-perf-lab/candidates/raw-post/time.mjs typegpu throwaway/post-timing-typegpu`
(substitute `raw` or `vgpu` for another candidate). Partial or missing query data
fails the diagnostic; it never becomes zero-cost work. This isolates post workload
and cannot rank complete battle renderers.
