# Shared local pose snapshots

The [local-pose owner](../../../../../../packages/soldier-assets/src/localPose.ts) evaluates the source rig used by baking and the controller. A pose stores local translation, quaternion rotation and scale per joint; blending and the bounded rider mask operate on those local values before parent transforms and inverse binds produce skin matrices. There is no second interpolation implementation or world-matrix blending path.

Snapshots are independent arrays. Blend weights zero and one preserve the exact chosen endpoint; phase one always samples the clip end, including looping clips. The timeline owns wrapping, interruption history and reset policy. This pass supplies the evaluator, not that controller or GPU playback.

## Precision and ownership decision

**Sound, high confidence — preserve source precision in CPU snapshots.** When baking evaluates a rotation, it currently keeps translation/quaternion/scale values as JavaScript doubles until composing a Float32 matrix. Rounding those values into Float32 snapshots first would change already accepted bake bytes. Local snapshots therefore use packed Float64 T3/R4/S3: 80 bytes per joint per frozen lane. Derived joint matrices remain Float32. This was explicitly approved by the parent; eventual GPU Float32 packing and measured runtime budgets remain with slices 06/07. The alternative early rounding was rejected for a measured preservation requirement, not an assumed visual tolerance.

## Verification and review

`node packages/soldier-assets/bake/local-pose.test.mjs` passes from the repository root. It checks fractional translation, exact interruption-source endpoints, snapshot independence, STEP key boundaries, explicit loop endpoints, shortest-arc quaternion sign equivalence, masked replacement and local rotation preserving a child's reach. Equivalent quaternion signs compare within Float32 matrix precision; exact endpoint snapshot equality remains byte-strict.

The real mounted candidate 41 is evaluated from its retained rig and source geometry. All 10 independent Blender samples, including rider-over-gait composition, pass over 8,640 tier vertices; maximum error is `3.916562555692296e-7m`, below the existing source tolerance. No source fixture or generated asset was rewritten.

Full existing `bake:test` and TypeScript checks pass. Placeholder, Blender candidate and material-swatch deterministic checks remain byte-exact after the baker switches to the shared evaluator. The existing source no-op admission tests also pass after using the shared local sampler.

Independent review `01a07596-d1ae-75f1-8be4-6d3116ab239a` found the CPU implementation and focused tests sound. Its sole P2 is test registration: the integrating parent owns `web/package.json` and explicitly agreed to add `node ../packages/soldier-assets/bake/local-pose.test.mjs` to `bake:test` when merging. That integration obligation is not waived by the successful manual run. No GPU or visual-quality acceptance is claimed.

## Changed-test ledger

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| `local-pose.test.mjs` | No shared runtime pose evaluator or direct snapshot/composition regression suite. | Checks interpolation, exact frozen endpoints, independent arrays, local hierarchy and all mounted Blender sample positions. | Establish the CPU prerequisite for exact interrupted timelines. **moved** |
| `vat.test.mjs`, `gltf.test.mjs` | Imported math helpers from the bake module. | Import the same math from the shared owner; numerical assertions unchanged. | Remove the duplicate owner without compatibility re-exports. **moved** |

The remaining bake tests keep their existing assertions and exact generated output. No animation, material, geometry, simulation or screenshot baseline changed. The initial shortest-arc test used byte equality for equivalent rotations; it was corrected to Float32 numerical tolerance after a measured `4.44e-16` normalization difference, not a pose discrepancy.
