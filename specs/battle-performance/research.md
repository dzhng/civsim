# Evidence, prior attempts and research

Inspected 2026-09-15 at baseline `c924e5ce9cac0a8abd5cd93de0d17df892facb3f`. These are code observations and historical reports, **not new hardware measurements**. The root worktree was clean before creating this branch. No production renderer code changed during planning.

## Current production owners

`web/src/battle/renderer.ts` imports `PhotorealBattleWorld` from `packages/photoreal-renderer/src/battle/battleWorld.ts`. This is Three.js WebGPU/TSL. `web/package.json` declares Three `^0.185.1`; exact resolved versions must be recorded from the lockfile during benchmarking. Campaign uses separate raw WebGPU infrastructure. Historical renderer-conversion prose is not an accurate map of today's battle imports.

| Priority | Trigger and concrete work | Current bound / uncertainty | Acceptance owner |
| --- | --- | --- | --- |
| P1 investigation | Pan crosses focus region; `battleGrassField.ts` completes sampling with `ring.applyPackedRecords(...,{incremental:false})`; `bladeFieldLayer.ts` copies and hashes packed records, constructs GPU runtime, swaps bindings and retires old runtime. | Sampling is already sliced with nominal 4ms budget and 16,384-cell chunks. Base and ring each cap at one million 16-float records: 64MB each before copies/auxiliary buffers. A bounded large commit can still hitch; actual record count/copy/upload duration needs tracing. | 01 telemetry, 04 residency |
| P1 investigation | Camera movement changes crowd demand; `crowdLayer.uploadFrame` clears/rebuilds class/audience lists, plans LODs, packs palette and instance attributes. Each populated bucket writes three vec4 attributes (48 bytes per bucket instance, plus palette/impostor data). | Work is O(source soldiers + submitted bucket entries), not proven quadratic. Bucket arrays already grow geometrically. Camera-only repetition, transient JS lists and high-water growth need measured attribution. | 06 state, 07 audiences |
| P1 investigation | Expanded visible population grows `SoldierPosePalette`; its upload callback can replace materials across group buckets. | Growth is capacity-triggered, not every camera frame. First visitation may compile resources; count growth events and isolate them from steady work. | 06 |
| P1 visibility | `shadowRig.resolveSunShadowMode` returns `single` by default on every adapter. One 1024² orthographic map fits the entire terrain. | Small shadow texel footprints plausibly explain weak tactical grounding; bias/receiver/caster issues are alternatives. Existing optional CSM is 2×2048 with 1500m max range. Stale comments about hardware defaults and bias are not evidence. | 08 coverage, 09 stability |
| P1 evidence gap | `world.ts` drains render/compute timestamp pools but publishes render timestamps only. | Intentionally documented as render-only; cannot support a total GPU claim. Async sample correlation and collector overhead must be measured. | 01 |
| P2 investigation | `battleWorld.drawInstances`, `setCamera`/grass update and `render` repeat some camera/shadow/grass preparations. | Calls alone do not establish expense. Tiny repeats may be noise; do not build a state machine just to eliminate cheap calls. | 01, 06 only if supported |
| P2 investigation | Wide/horizon view routes/draws large grass populations and more shadow meshes even when beauty uses impostors. | GPU routing, indirect draws, culling and projected-size detail already exist. Measure compute vs fill and shadow-only populations before choosing a replacement. | 05, 07, 08 |

Dismissed as blanket fixes: “add LOD hysteresis” (already exists), “turn on GPU grass routing” (already exists), and “fix dial-triggered grass activation” (already corrected). Existing controls do not prove all temporal defects solved. Renderer-stage costs may coexist with live simulation/HUD costs; collect both without changing sim behavior.

Additional Claude leads checked against source: `activeGrassVisibleRadiusM` chooses stepped radii from eye-height bands, separate from the existing detail activation hysteresis. Test these exact threshold crossings in 05; do not assume all grass transitions are continuous. `updateCpuMirrorTierCounts` is stats-only and **caps sampling at 200,000 records**, refreshing when dirty; reject the consultation's claim of an unconditional million-record full scan. Still measure its dirty refresh cost. The whole-map shadow audience can retain many offscreen soldiers and their pose work; a tighter valid caster volume might improve quality and reduce work together, but the extent of that saving remains unmeasured.

## Existing verification surfaces

- `web/scenes/battle/battle-perf-30k.mjs`: >=30k soldiers and >=500 scenery, 1280×800 CSS, paused sim and hidden HUD; static render-GPU median and pan/wheel frame pacing, authored 33ms limits. Preserve it. It is not a live normal-resolution 60fps guarantee.
- Existing command: `bun run --cwd web perf:30k` runs its hardware Chrome gate. Existing general command: `bun run --cwd web perf:renderer:hardware`.
- `battle-wheel-zoom`, `battle-camera-zoom`, `battle-lod`, `photoreal-shadows`, `battle-renderer-default`, and `renderer-lifecycle` are useful scene cases. The in-game benchmark and `battle-camera-performance` scene are **proposed**, not available at planning time.
- Tests include `web/tests/photorealShadows.test.ts`, `photorealCrowdLod.test.ts`, `grassField.test.ts`, `camera.test.ts`, `camera3d.test.ts`, `cameraRig.test.ts`, `battleCrowd.test.ts`. Inspect current APIs before writing behavioral tests.
- `web/src/ui/menu/Menu.tsx` and `web/src/menu/scene.ts` own menu rendering/callbacks. `web/src/battle/battleLoop.ts` owns real ticking; `quickBattleUrl.ts` explicitly describes initial configuration, not a running save. New benchmark should compose these owners.

## Preserved prior reports

[Previous zoom report](assets/research/prior-zoom-report.md) records 26–36% grass triangle reductions in selected views, but noisy host timings, no guaranteed FPS result and unresolved visual checks. Those percentages are historical for those profiles, not a prediction of new savings.

[Prior production library spike](assets/research/prior-production-spike.md), copied from worktree `/Users/david/dev/game-gpu-spike`, branch `codex/typegpu-vgpu-spike` at `96ef1014`: native/TypeGPU/vgpu replaced a weighted-joint shader kernel in actual battle/campaign rendering, retaining Three battle orchestration. Its reported mid/vista GPU medians were native 13.33/20.27ms, TypeGPU 12.58/20.67ms, vgpu 13.07/29.17ms; vgpu also failed close grass pacing repeatedly. The report explicitly does not isolate causality or establish an engine ranking. Preserve its caveat that TypeGPU interoperability used an experimental raw-buffer seam.

[Initial library study](assets/research/prior-library-study.md) documented a pinned-release vgpu compute/draw shared-uniform bind-group cache defect and a healthy separate-uniform control. Reproduce it on the selected current version; do not assume still broken or already fixed. Its narrow GPU timing did not demonstrate an automatic library speedup. Existing candidate worktrees `/Users/david/dev/game-gpu-typegpu` and `/Users/david/dev/game-gpu-vgpu` are reference inputs only; do not mutate or merge them as part of planning.

`specs/done/living-meadow/slices/02-spike-evolve-vs-port.md` records a previous unmatched fresh grass port; use its workload fairness lessons, not its old recommendation as a veto. Inspect any code reused from historical spikes against today's production contracts.

The archived report copies retain original text for provenance; internal links refer to their original source trees. Their old handoffs/push permissions are superseded for this task by this README, not executable instructions. Copy any additional historical evidence actually used into this spec rather than relying solely on another mutable worktree.

## Primary-source research (checked 2026-09-15)

- [TypeGPU pipelines](https://docs.swmansion.com/TypeGPU/apis/pipelines/): typed render/compute pipelines and command encoding can express a real orchestration comparison, including underlying WebGPU interop. This does not promise faster shaders. Start from an official example and pin the API version before the full fixture.
- [TypeGPU getting started](https://docs.swmansion.com/TypeGPU/getting-started/): TypeScript shader authoring has build integration; include bundler/toolchain overhead and supported API boundaries in complexity accounting.
- [Vercel vgpu source](https://github.com/vercel-labs/vgpu): resolves the ambiguous library name and provides source/examples for pipeline/resource reproduction. Inspect the precise selected release's cache/resource behavior instead of generalizing the old defect.
- [Three CSMShadowNode](https://threejs.org/docs/pages/CSMShadowNode.html): native Three WebGPU cascade integration exposes coverage/split controls. Compare the current installed source and scene behavior, because docs/default comments can drift. Cascade count and reach are quality/cost variables, not a solution by themselves.

WebGPU specification retrieval failed in this planning session; no claims depend on that failed fetch. Before implementing low-level query/indirect-buffer contracts, consult the current normative spec and the installed browser/Three implementation. Primary-source docs establish available mechanisms; local hardware experiments establish which mechanism wins here.
