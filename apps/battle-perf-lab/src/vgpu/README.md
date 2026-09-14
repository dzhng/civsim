# vgpu candidate preflight

This candidate is **unrankable** until every pass in the shared battle fixture is implemented. The small compute/draw check validates library resource reuse; it is not a battle renderer or an engine performance result.

The dependency belongs to `web/package.json` and `web/bun.lock`. `identity.ts` records the exact release and upstream commits. The [official release source](https://github.com/vercel-labs/vgpu/tree/1c36ab82fcb38dc23dd3a1665ea086accd1d4e79) owns the API; the inspected published package namespaces compute cache owners separately from draw owners. The hardware preflight passes both shared and separate uniforms on Apple Metal / Chrome 153, including both updated values and pixel checks, with no validation errors. The historical defect was not reproduced; [the retained report](../../../../specs/battle-performance/assets/02-vgpu/preflight.json) records the observation.

`runtime.ts` owns one vgpu device/surface/frame lifetime, consumes the shared fixture's viewport contract, and reports device errors. The library owns compute, buffers, bindings, draw submission and readback. Native WebGPU access in the probe is limited to validation/error observation; no native encoder or hidden Three renderer supplies an advertised vgpu operation.

`preflight.ts` exercises compute before draw with a shared uniform and a separate-uniform control. Both update the uniform and verify GPU compute values and rendered pixels. The shader makes the uniform visible in fragment color as well as vertex depth, extending the historical reproduction with an observable draw-value check. Each case disposes its own runtime. Missing battle passes remain enumerated in the candidate identity.

The private Vite config imports the production config without editing it. From the repository root:

```sh
web/node_modules/.bin/tsc --noEmit -p apps/battle-perf-lab/src/vgpu/tsconfig.json
web/node_modules/.bin/vite build --config apps/battle-perf-lab/src/vgpu/vite.config.mts
web/node_modules/.bin/vite preview --config apps/battle-perf-lab/src/vgpu/vite.config.mts --host 127.0.0.1 --port 4182 --strictPort
```

With that preview running, `node apps/battle-perf-lab/src/vgpu/verify.mjs` performs the hardware check and writes results/pixel captures under `specs/battle-performance/assets/02-vgpu/`. Serialize this check with other GPU runs. A failed healthy control is inconclusive; never patch around it with raw rendering and call the result vgpu.
