# Native grass component control

This is a frozen-input component result, not full battle parity or performance evidence. Production sampling and the actual Three blade layer provide the packed records, resolved policy, mesh topology and oracle. Native code owns GPU routing and all three blade draws. CPU residency, live world integration, terrain context and directional shadow maps remain outside this control; the lighting input explicitly uses shadow visibility 1.

The five cases cover stationary blades, wind, near/mid depth prepass, mask plus wedge routing, and distance thinning. Every indirect command and visible membership set matches the Three GPU readback exactly; each list is unique. Sorting is confined to readback comparison and never changes the GPU append order. All images are finite and nonempty. Double disposal and continued access to borrowed attachments/environment pass. Browser warnings, errors and page errors are empty.

The acceptance bound was fixed before the final rerun: HDR RGB error at most 1/255 except at most three localized silhouette/overlap precision pixels per 480×320 crop. This is an explicit pixel exception, not an aggregate RMSE gate. Native depth prepass must preserve its own beauty-only image exactly. Final differing-pixel counts are 2, 1, 1, 0, 1 for base, wind, wind-prepass, mask-wedge and thinning respectively. The source-prepass diagnostic remains separately reported.

## Depth precision

Before invariant clip position, native prepass lost 72 covered pixels relative to native beauty-only; Three lost 38 relative to its own beauty-only. Neither changed surviving RGB. The paired prepass images disagreed at 90 pixels. With `@invariant` position, native prepass and beauty-only are exactly equal in every HDR component. Three still loses 38 pixels. We preserve that source result rather than deliberately reproducing holes. The same invariant treatment is required in future TypeGPU/vgpu grass ports; Three feasibility remains a separate investigation.

`pre-invariant-report.json` and `pre-invariant-actual.png` preserve the earlier diagnostic. `report.json` is the final acceptance run. The final PNGs use the same sRGB display conversion for both implementations. The 100×100 crops at (180,140) are enlarged fourfold by nearest-neighbor sampling.

Direct inspection and the independent, unprimed image critique found no visible difference in the full pair or enlarged crops. The critic identified shared black gaps, broad flat blade masses, tonal merging and pixel stepping. These isolated grass images do not establish acceptable landscape composition; the background deliberately removes terrain. See `visual-critique.txt` for the unedited assessment.

## Reproduction and source identity

Run from the repository root, using the pinned web dependencies and hardware Chrome flags in `web/renderer-probe-lib.mjs`:

```sh
web/node_modules/.bin/tsc -p apps/battle-perf-lab/src/raw/tsconfig.json --noEmit
web/node_modules/.bin/vite build --config apps/battle-perf-lab/src/raw/grass.vite.config.mts
web/node_modules/.bin/vite preview --config apps/battle-perf-lab/src/raw/grass.vite.config.mts --port 5197
# In a second terminal, after preview is ready:
node apps/battle-perf-lab/src/raw/verify-grass.mjs
```

The final typecheck, build and verifier passed. No benchmark was run. Base commit: `fcd9f462c7293f5f5ec76e0f1587284f32a2fb27`; the enclosing commit identifies the grass implementation and harness. Three is pinned to 0.185.1. Root-owned composed lighting dependencies were copied unchanged for verification and intentionally excluded from this component commit. SHA-256 identities:

| Source | SHA-256 |
| --- | --- |
| `src/raw/environment.ts` | `98954e605d5b6f2e516d69a0532a286600593f468e4cb748b5d08e6451b210c4` |
| `src/shaders/standardPbr.ts` | `06b0ac58ddf1de91657bc1295e359c23f08608b320a2301854d19188bb4b5727` |
| `src/shaders/dfgLut.ts` | `80854b9eec326a15422d82619f5d14f1c0f34110cfc390eb376e3509e85dcb04` |

Paths in the table are relative to `apps/battle-perf-lab`. Grass uses geometric roughness zero because the source geometry normals are constant; its authored lighting normal is not the geometry normal used by Three's derivative roughness term. The composed PBR/PMREM/haze interface required no changes.
