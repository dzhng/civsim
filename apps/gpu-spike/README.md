# TypeGPU / vgpu rendering spike

> **Production integration in progress.** The results below are the initial
> fixture study. Its recommendation is provisional until the actual battle and
> campaign skinning paths and full-game workloads have been compared.

**Recommendation: trial TypeGPU for shared shader functions and typed GPU contracts;
keep battle's Three.js orchestration and campaign's raw frame shell.** Both libraries
can share pure shader logic across those substrates. vgpu's function bridge works,
but its broader rendering/compute API has a reproduced shared-uniform cache defect
in the pinned release.

This is an isolated experiment, based on `1313a78f`, not a renderer migration.
The [evidence gallery](gallery.html) shows the actual captured comparisons.
Recorded machine-readable results live in [evidence](evidence/).

## What is actually shared today

[BattleRenderer](../../web/src/battle/renderer.ts) uses
[PhotorealBattleWorld](../../packages/photoreal-renderer/src/battle/battleWorld.ts),
which owns Three.js/TSL materials, crowd rendering, sun shadows, grass, water and
post-processing. [CampaignRenderer](../../web/src/campaign/renderer.ts) uses the
raw WebGPU frame shell and explicit WGSL passes. They share camera math, the
reverse-Z convention, asset/data contracts and environment vocabulary. They do
**not** currently share the same frame shell or crowd GPU pipeline.

A renderer-wide unification would therefore be a substantial architectural choice.
Neither library supplies an automatic replacement for the battle world's scene,
material, shadow and post-processing responsibilities.

## Experiments and findings

### Campaign-style raw rendering

The comparison uses the production soldier-shadow WGSL and frame shell, with
camera motion, resize, zero/partial/restored instance counts and hostile draw
ordering. Blocks are submitted before the ground; shadows render afterward and
must not paint over the blocks. Six extra shadow stamps deliberately have no box:
they provide unobstructed samples of the shader's radial profile.

The one-sample case matches campaign's attachment configuration. The four-sample
case is an additional compatibility stress test, **not the current battle renderer**.
All three implementations use the same geometry and depth/blend behavior.

- TypeGPU's TypeScript vertex/fragment functions draw into the existing raw render
  pass. Its schema packs the full camera byte-for-byte like the production packer.
- vgpu reflects the existing WGSL and packs the same camera correctly, verified
  through GPU readback. Its public render-bundle handle can execute inside the
  existing pass. A changing instance count requires recording a new bundle;
  replacing a bound buffer would also require recording again. This experiment
  keeps buffer identity stable.
- Both paths pass image comparison, visible-shadow and occlusion assertions,
  camera updates, resize and count changes. Disposing their imported-device
  wrappers leaves the host device usable.

### Actual battle substrate: Three.js

The second experiment uses the production `PhotorealWorld` and camera bridge,
with the same pinned Three.js version as the game. A diagnostic cloth panel
exercises the flag-wave formula already present in CPU code, campaign WGSL and
battle TSL. Its exaggerated wind amplitude makes differences easier to see.

Each candidate defines that function once and reuses it in both raw GPU compute
and a Three.js node material: TypeGPU through `@typegpu/three`, vgpu through
`vgpu/three` and WGSL module imports. Three animation times match native TSL, and
returning to the original time reproduces the original pixels.

Both GPU implementations agree with the production CPU reference across 512
samples to within **3.48e-7 world units** (the tolerance is 1e-5). TypeGPU can also
execute its same shader function on the CPU; that path passes the reference check.
The checks include zero weight, zero strength, both wave lobes, and varied positions,
phases and times. This establishes a useful sharing seam without replacing either
renderer.

This is representative shader integration, not a full battle/campaign visual or
performance certification. Skinning, terrain, water, shadows and the battle post
chain have not been migrated or benchmarked here.

### Type safety and a vgpu defect

The deliberate binding-name typo in [checks](checks/) is rejected at compile time
by TypeGPU. vgpu accepts it at compile time and rejects it at runtime. vgpu's
`uniforms()` still infers a useful type from its initial values; the missing static
check here is agreement between shader binding names and `draw(..., {set: ...})`.
Both Three.js bridges erase the scalar return type at their boundary, requiring one
narrow return-type assertion in this spike.

[The minimal vgpu reproduction](src/vgpu-repro.ts) uses only public APIs: one shared
uniform is read by a compute pipeline, then by a draw. The second operation gets
an incompatible compute-stage bind group and WebGPU rejects the frame. A control
with separate uniform objects passes. The installed source has independent draw
and compute ID counters starting at 1, while a shared cache keys on the numeric
ID, group and resource identity, without the pipeline layout. This explains the
observed collision.

The positive raw-rendering comparison gives its packing-only compute probe a
separate uniform to avoid this defect; it does not patch the dependency. The
`verify:known-issue` check deliberately passes when it reproduces the pinned
release's failure and its healthy control. This is a release-specific finding,
not a claim that all vgpu integrations fail. No upstream issue has been posted.

## What unification makes sense

A small shared shader library is justified: start with flag motion, then consider
noise, water functions or material math only where both consumers want identical
semantics. TypeGPU can make one function callable from CPU code, raw WebGPU and
Three.js. vgpu offers a similar GPU-only sharing path while retaining WGSL.
Keep renderer-specific state/resource binding and frame scheduling in their
current owners. Do not invent a generic world renderer just to hide the difference.

Typed GPU data contracts are another useful seam, especially on the campaign
side. The application's [ambient GPU declarations](../../web/src/renderer-globals.d.ts)
still use many `unknown` aliases and loose descriptors. Replacing those with the
official WebGPU types should precede a production TypeGPU integration; otherwise
much of the intended checking is lost. This app uses official types independently.

The reason to prefer TypeGPU here is shared logic and stronger contracts, not an
observed FPS improvement. vgpu is attractive for WGSL authoring, but I would keep
its frame/compute machinery out of the shared engine until the reproduced defect
is resolved and re-tested.

## Measurements and limits

The [hardware benchmark](evidence/benchmark.json) uses 30,000 **shadow quads**, a
simple ground/occluder fixture and one-sample rendering on an Apple Metal GPU.
Three rounds rotate backend order, with warm-up before each measured interval.
CPU timing covers camera updates and frame submission; GPU timing comes from the
existing shell's asynchronous timestamps. Each library candidate maintains its
own typed/reflected camera alongside the fixture's host camera, so this is not an
optimized production integration.

| Implementation | Steady CPU median range | Changing-count CPU median range |
| --- | ---: | ---: |
| Raw WebGPU | 0.075–0.270 ms | 0.100–0.295 ms |
| TypeGPU | 0.110–0.175 ms | 0.120–0.275 ms |
| vgpu | 0.105–0.290 ms | 0.140–0.460 ms |

The vgpu count-change path records a bundle; the others issue a different draw
count. Steady GPU medians across all backends and rounds are 0.244–0.271 ms.
CPU measurements vary noticeably with the round; the evidence does not establish
a meaningful GPU-speed ranking or an automatic performance win from adopting a
library. The preserved benchmark and correctness checks both use the production
build. Bundle sizes in the evidence describe this diagnostic app, including its
compute probes, not the incremental cost of a carefully scoped game migration.

An unprimed screenshot review found no confirmed missing geometry or depth
failure. It noted a clipped corner of the diagnostic ground plane and aliasing at
strong cloth folds. The named test subjects remain visible, and the fold artifacts
also occur in the identical native-TSL reference. These captures establish
implementation equivalence; they are not an art-quality approval.

## Running and reviewing

From this directory, run `npm ci`, then `npm run dev`. The root page compares the
raw shell; `three.html` exercises the production battle substrate. `gallery.html`
shows saved evidence. The scripts in [package.json](package.json) own the checks:
`npm run verify` runs type and browser correctness checks plus the known-issue
reproduction; `npm run benchmark` runs the separate hardware experiment. A Chrome
installation with WebGPU is required. `SPIKE_URL` can point checks at a built
preview server. Generated runs go to the ignored `artifacts/` directory;
`evidence/` preserves this reviewed run.

Only two production-source lines changed to support the experiment: the existing
shadow shader is exported, and the shell's command-buffer variable keeps its
inferred encoder return type instead of widening to `unknown`. All dependency
changes and alternative implementations belong to this standalone app.

The library documentation used for the experiment is
[TypeGPU interoperability](https://docs.swmansion.com/TypeGPU/integration/webgpu-interoperability/),
[TypeGPU's Three.js bridge](https://docs.swmansion.com/TypeGPU/ecosystem/typegpu-three/),
and the [vgpu source and documentation](https://github.com/vercel-labs/vgpu).
Exact dependency versions are pinned by this app's manifest and lockfile.
