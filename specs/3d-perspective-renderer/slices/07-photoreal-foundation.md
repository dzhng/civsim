# Slice 07 — Photoreal foundation: `packages/photoreal-renderer` + harness re-tooling

## STATUS: DONE (2026-07-02, this branch)

Built as specified; decisions + evidence:

- **Package name `photoreal-renderer`** (purpose-over-tech, recorded
  recommendation; David silent on the flag). **60k stress mode kept** on
  `/renderer/photoreal-crowd?count=` (verified publishing 60,000).
- **Reverse-Z carries over:** three@0.185's `WebGPURenderer({ reversedDepthBuffer:
  true })` builds the exact `perspectiveReverseZ` matrix (near→1, far→0), so the
  substrate shares the engine depth direction. `applyCamera3d` sets the
  renderer-managed `_reversedDepth` backing field so CPU-side matrices match
  before first render (version-pinned; the unit test pins it). three has no
  infinite-far branch (NaNs at `far=Infinity`) — omitted far becomes
  `PHOTOREAL_FAR_FALLBACK = 1e7`, converging on the infinite-limit matrix.
- **Environment owner grew photoreal fields** (`skyZenithColor`,
  `skyHorizonColor`, `groundBounceColor`) on `CIVSIM_ENVIRONMENTS` — golden takes
  the spike's verdict-grade values; dusk/overcast authored, exercised only by the
  unit test until a route uses them.
- **Resolution plumbing (new, deliberate):** `packages/*`/`apps/*` sit outside
  the vite root, so bare `three` imports resolve nowhere by walk-up. Wired in all
  three resolvers: vite `resolve.alias` (exact-match regexes → pinned builds),
  tsconfig `paths` (→ `@types/three`, dev-only, which covers `three/webgpu` +
  `three/tsl` fine — no local d.ts needed), and the node test loader retries bare
  specifiers anchored at `web/` (`web/tests/ts-extension-loader.mjs`).
- **TSL hazard beyond the 06 list:** `@types/three`'s `attribute<TNodeType>()`
  widens an inferred string literal to `string`, silently dropping the whole
  swizzle/operator surface — explicit generics required
  (`attribute<'vec4'>('iPose', 'vec4')`).
- **SwiftShader reality check:** one full-scale crowd frame ≈ 30 s of software
  rasterization; the gate scene uses clipped `page.screenshot` (no
  element-stability wait) + 120 s screenshot timeouts. Byte-determinism holds
  (identical buffers on every pair).
- **Frame-time ledger opened (hardware, apple/metal-3, chrome, 1100×700):**
  `/renderer/photoreal-crowd` mid, 30,400 soldiers + 200k grass + 3k trees =
  **GPU 5.29 ms, median rAF 8.33 ms (vsync-pinned @120 Hz), p95 9.91 ms**
  (budget ≤ 33 ms; 06 baseline ~6 ms GPU). Byte-determinism also holds on the
  hardware adapter.
- Verification: `photorealCamera` (4 tests) + `photorealEnvironment` (2 tests) →
  `test:unit` 45/45; `photoreal-substrate` scene ALL PASS under SwiftShader
  (identity fields, count floors, non-blank, byte-determinism, snaps
  `shots/misc/photoreal-{pbr,crowd-mid}.png`); spike fully deleted (nothing
  spike-shaped survives — grep-verified, including the banned TSL `time` node).
- **screenshot-critique (unprimed, on the promoted PBR grid): "needs another
  pass"** — parity with the 06 evidence shot is confirmed side-by-side (this
  slice's contract: promote at parity, no new visual variable), and every
  finding maps to already-scheduled ladder work: (1) featureless flat-gradient
  IBL collapses both material axes → the procedural-equirect scaffold row,
  deleted by `10a` (physical sky feeds the IBL); (2) no shadows / contact
  grounding → `11` (CSM); (3) near-row specular clipping + silhouette aliasing +
  background banding → re-judge under the `10a` environment before treating as
  material-system bugs. Nothing here is a promotion regression.

## Contract unlocked

The 06 verdict's 5-point harness re-tooling plan is **implemented**: a production-grade
three.js WebGPU + TSL substrate module exists that the battle world can adopt (`08`),
the spike is promoted-or-deleted (nothing spike-shaped survives), and the verification
harness provably works against it. Lab-only — no production surface changes. This slice
can start immediately, in parallel with `04f`/`05b` (own worktree).

## API seam

**New package `packages/photoreal-renderer/`** — source-only directory, per repo
convention (deps stay in `web/package.json`, where `three@0.185.1` already lives,
**pinned** until the ladder closes; WebGPU internals churn between minors, so upgrades
are their own reviewed change, never a ride-along).

```
packages/photoreal-renderer/src/
  world.ts          PhotorealWorld — owns THREE.WebGPURenderer ({ canvas,
                    trackTimestamp: true }) + one Scene; manual rAF (never
                    setAnimationLoop); setTime(seconds) drives an OWNED uTime
                    uniform node; resize(); stats(); dispose();
                    settlePresentedFrame() via renderer.backend.device.queue
  cameraBridge.ts   applyCamera3d(threeCam: PerspectiveCamera, p: Camera3DParams)
                    — z-up (camera.up = (0,0,1), the spike's createOrbitCamera
                    generalized). The ONLY way a three camera gets posed; no
                    route hand-rolls orbit math.
  environment.ts    applyCivsimEnvironment(world, env) — maps CIVSIM_ENVIRONMENTS/
                    BATTLE_ENVIRONMENTS (packages/game-renderer/src/environment/
                    environment.ts, the ONE preset owner) to sun DirectionalLight,
                    IBL env, fog, toneMappingExposure. New physical fields are
                    ADDED to that owner, never forked into a parallel table.
  stats.ts          publishes the __rendererLabStats shape backed by renderer.info
                    (draw calls/triangles) + trackTimestamp/resolveTimestampsAsync
                    GPU ms (the spike's __probeStats is the template), plus
                    ownership identity fields { substrate, projection: 'camera3d',
                    environment: <preset id> } so scenes can assert single owners.
```

**Determinism rule (encode it here, enforce it forever):** the TSL `time` node is
**banned in package code** — all animation keys off `PhotorealWorld.setTime` + seeded
RNG, or `snapCheck` baselines can never be byte-stable. Grep promoted code for it.

**Types:** add `@types/three` (dev-only) to `web/package.json`; delete
`web/src/three-probe/three-shims.d.ts` and every `any`-alias. Whole package typechecks.

**Promote the spike, then delete it:**
- `/renderer/photoreal-pbr` (lab route in `apps/renderer-lab/src/router.ts`): the
  sphere grid + real PMREM IBL from `web/src/three-probe/pbr.ts`, re-authored on
  `PhotorealWorld`.
- `/renderer/photoreal-crowd`: the 30,400-soldier VAT crowd + 200k grass + 3k trees
  from `web/src/three-probe/crowd.ts` (`?cam=mid|vista`). Keep the spike's proven
  patterns: plain `Mesh` + `InstancedBufferGeometry` (a custom `positionNode` silently
  discards `instanceMatrix` — document the trap in a comment), `transformNormalToView`
  + `varying()` for the view-space `normalNode`.
- **Delete:** `web/three-water.html`, `web/three-pbr.html`, `web/three-crowd.html`,
  `web/src/three-probe/*`, `apps/renderer-lab/src/bakeoffProbes.ts` + its three routes
  (`/renderer/pbr-probe`, `/renderer/water-pbr`, `/renderer/crowd-perf`),
  `web/bakeoff-shot.mjs`, `web/shots-bakeoff/`. Read the spike files before deleting —
  they are the primary reference. Evidence lives in the 06 slice file.

## What the human can run / see

`/renderer/photoreal-pbr` (metal×roughness grid under real IBL),
`/renderer/photoreal-crowd?cam=mid|vista` (the 30k crowd + foliage at spike parity).

## Verification

- **NEW unit `web/tests/photorealCamera.test.ts`** (node, no GPU — three's math runs
  fine in node): `applyCamera3d` produces a three `projectionMatrix × matrixWorldInverse`
  that matches `camera3d.viewProjMatrix` within epsilon across zoom stops + z-up axis
  checks. This is the spine-fidelity pin for the whole ladder.
- **NEW unit `web/tests/photorealEnvironment.test.ts`**: every `CIVSIM_ENVIRONMENTS` id
  maps, no preset invented, output is a pure function of the preset.
- **NEW scene `web/scenes/system/photoreal-substrate.mjs`** (SwiftShader): both routes
  non-blank, `__rendererLabStats` shape + identity fields asserted, count floors, and
  the **fixed-`setTime` byte-determinism check** — two snaps at the same `setTime` are
  byte-identical.
- Re-derive the `renderer-lab-routes` registry scene (routes added/deleted).
- Perf: `/renderer/photoreal-crowd` on hardware (`VERIFY_GPU_ADAPTER=hardware
  VERIFY_BROWSER_CHANNEL=chrome`) ≤ 33 ms — expect ~6 ms, the 06 baseline. Record it:
  this number opens the ladder's frame-time ledger.
- **Visual variable: none new** — this slice promotes verdict-grade visuals at parity;
  snapshots pin them. Run `screenshot-critique` on the promoted PBR-grid shot as the
  last check anyway.

## Must stay green

Everything — this slice is additive + spike deletion. `cargo test --workspace`,
`bun run --cwd web test:unit`, full battle + campaign scene suites byte-identical,
`bun run check`. Keep `trackTimestamp` failure-tolerant (the spike's `timestampBroken`
guard) so SwiftShader stays green.

## Research

- TSL wiki: <https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language>
- three.js manual, `WebGPURenderer` + `examples/?q=webgpu` (instancing, compute).
- The 06 VERDICT's pain-point list is the local hazard map (positionNode/instanceMatrix,
  view-space normalNode, `Fn` can't return node objects, addon asset gaps, no shipped
  types). Verify `@types/three` coverage of `three/webgpu`/`three/tsl` before committing;
  if poor, keep a *narrowed* local d.ts and record it here.

## Human feedback that would change this slice

Package name (`photoreal-renderer` vs `three-renderer`); whether `photoreal-crowd`
keeps a 60k stress mode (recommended: yes, it proved headroom in 06).
