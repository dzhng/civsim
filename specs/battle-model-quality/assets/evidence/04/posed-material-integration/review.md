# Posed material integration

04c is complete. This is surface-transfer acceptance, not soldier art, animation
quality or final-distance acceptance.04d still owns the six-swatch standard-loader
closure and human material-transfer checkpoint.

## Implementation and review

The existing weighted matrices pose tangent XYZ alongside normals; authored W
stays categorical. CPU far posing preserves existing positions and normals exactly.
Near and far share one fragment surface owner; the raw consumer applies the same
frame convention to its retained lighting model. Mapped directions drive all raw
lighting terms, while unmapped rendering stays on its previous path.

Both directions normalize at vertices, then tangent orthogonalization occurs at
fragments. The source baker checks mapped bind and sampled frames during its
existing bounds traversal; runtime loading checks bind frames only. Interpolated
unit directions that nearly cancel use finite geometric fallbacks. Authored map
scale remains XY-only, including zero, and must fit Float32. Bounded normalization
keeps large finite scales from overflowing.

Actual generated shader inspection exposed lazy conditional-node work leaking
weighted tangent inputs into fragments and overflowing baseline inter-stage
limits. Arithmetic selection between finite values removes that work and keeps
derivative/image reads unconditional. Shared world-position and packed scalar
varyings leave the mapped near shader at12 user locations plus front-facing.
Neither GPU limits nor existing visual/performance thresholds were raised.

Shape review retained one Three surface owner and the existing CPU pose owner;
the far posed-data type now derives from that owner instead of repeating fields.
The final independent review found no actionable defect and ran typecheck, unit
tests, lint and production build. Its sandbox could not open the bake suite's
local server; the full bake suite passed separately in the integrating workspace.
The source and retained raw lanes have their own focused reviews.

## Integrated gates

```sh
bun run --cwd web typecheck
bun run --cwd web test --run
bun run --cwd web bake:test
VERIFY_GPU=1 VERIFY_URL=http://localhost:5174 node web/scene.mjs battle-model-normal-frame battle-model-image-properties soldier-materials
VERIFY_GPU=1 VERIFY_URL=http://localhost:5174 node web/scene.mjs battle-model-workbench battle-model-far-properties blender-production-candidates soldier-materials campaign-models
VERIFY_URL=http://localhost:5174 bun run --cwd web perf:30k
```

- 46 Vitest files /219 tests pass. Source admission, exact-byte image transport,
  engine-basis parity and deterministic placeholder/candidate/card checks pass,
  including the newly registered posed-tangent and six-swatch source tests.
- Merged near/far/raw directional checks pass. Existing checker, workbench,
  mounted, raw and campaign screenshots remain exact. The new raw posed-normal
  snapshot is strict; no inherited snapshot was re-blessed.
- Missing/decode image replacement still retains102 textures,111 scene nodes,
  all20 appearances and the last good pixels.
- Apple Metal3 hardware,1280×800,30,560 soldiers,150 GPU samples at each stop:
  mid median9.67ms/p9515.35ms; vista median11.12ms/p9511.55ms. Pan rAF p9519.08ms,
  zoom sweep21.74ms, wheel19.4ms and close grass19.29/19.22ms all pass unchanged
  33ms limits. This is the existing paused-simulation renderer gate, not07's live
  animated asset-budget proof. Owned failed diagnostic browsers were terminated
  during startup; no parallel capture ran during the measurements.

`scenes.json`, `preserved-scenes.json` and `30k-hardware.log` retain the merged
results. The [source report](../posed-tangent-source.md),
[Three directional report](../posed-normal-three.md) and
[raw acceptance](../raw-normals/acceptance.md) own the independent oracles,
mutation evidence and changed-test ledgers. The raw visual pair and unprimed
critique confirm a localized shading response with unchanged geometry, explicitly
not finished-model quality. The numerical Three probe claims no aesthetic verdict.

## Changed-test summary

The temporary assertions that normal images were visually inert now require real
response. Independent posed-frame, handedness, scaling and collapse controls pin
what that response means. Source/runtime tests additionally reject unusable mapped
frames and scales that overflow GPU storage. No simulation rule, unit statistic,
save behavior or gameplay assertion changed. Detailed ledgers are linked above.
