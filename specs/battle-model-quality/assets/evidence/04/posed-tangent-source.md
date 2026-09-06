# Posed tangent source/CPU evidence

This pass establishes numerical source admission, not shader response or visual quality. No asset bytes, geometry, animation, snapshots, or renderer shaders changed.

## Gates

- Four focused Vitest files: 19 tests pass (`soldierSkin`, `appearanceBundle`, `soldierMaterial`, `soldierMaterials`). Full TypeScript check passes with the existing generated WASM artifacts available.
- Source checks pass: `posed-tangents`, `appearance-materials`, `appearance`, `engine-basis`, `gltf`, `vat`, `soldier-placeholders`, and deterministic `blender-candidates --check`.
- Old/new CPU comparison against `6cd34bc6`: all 60 placeholder mesh tiers, 5,040 poses and 1,391,040 posed vertices have byte-identical Float32 positions **and normals**. Tangents are the only new posed output.
- Complete source HTTP parity remains below 4.311e-7 metres; the real Blender human/mounted ancestry and engine-basis probes preserve tangent orientation and W.
- Removing sampled-frame admission makes the real-GLB collapsed-frame test fail. Removing runtime bind admission makes the loader test fail. Both hooks restored, both tests green.
- The overflow regressions failed before the Float32 guard: finite JavaScript `1e300` was accepted although GPU packing produces Infinity. Runtime and source now reject it.
- Independent Codex review `01a0754f-8eab-7ef0-8086-f395f59995b5` found only an omitted canonical runner entry. The integrating parent explicitly owns registering `posed-tangents.test.mjs` in `web/package.json`'s `bake:test`; that integration remains required. No numerical implementation finding remained.

## Changed-test ledger

| Test | Previous behavior | New behavior | Why it changed |
| --- | --- | --- | --- |
| `soldierSkin.test.ts`: four-joint skinning | Position `[1.25,.25,0]` and normalized normal checked; no tangent output. | Same position/normal plus normalized four-weight tangent and both W signs; flipping W leaves position/normal exactly unchanged. | Complete the CPU direction-frame contract without changing existing arithmetic. **moved** |
| `soldierSkin.test.ts`: relative parallelism (new) | No mapped-frame admission coverage. | Direction angles around the shared squared threshold `1e-12` reject/accept identically at magnitudes `1e-20`, `1`, `1e20`. | Reject directional collapse rather than small-but-valid authored vectors. **moved** |
| `soldierSkin.test.ts`: mapped/unmapped admission (new) | No slot-specific frame validation. | Mapped zero/parallel/opposite/nonfinite frames and W other than ±1 reject; unmapped zero frame remains accepted. | Only normal maps require a valid tangent frame. **moved** |
| `appearanceBundle.test.ts`: mapped bind admission (new) | No mapped bind gate on loaded content. | Every near/mid/far tier and separate atlas mesh rejects malformed mapped bind frames; degenerate unmapped frames and zero VAT matrices still load. | Runtime owns bind admission only; source owns sampled animation admission. **moved** |
| `engine-basis.test.mjs`: real human/mounted pose probes | Real source/engine position and landmark agreement. | Existing checks retained, plus posed tangent XYZ transformed through engine basis and unchanged handedness at each sampled pose. | Pin direction transport through real rotated source ancestry. **moved** |
| `posed-tangents.test.mjs` (new) | No complete-bake regression for animation collapsing a valid bind frame. | In-memory real GLB with valid bind and an exact opposing two-bone sample rejects when mapped; identical unmapped source bakes; W0 mapped bind rejects. | Sample validation reuses the existing bounds pose traversal. **moved** |
| `soldierMaterial.test.ts`: invalid normal scale | Nonfinite JavaScript values reject, finite ±1e300 accepted. | ±1e300 additionally reject before Float32 GPU packing. Existing AO assertions unchanged. | Prevent finite source values becoming GPU Infinity. **moved** |
| `appearance-materials.test.mjs`: source scale rejection | No finite-JavaScript/Float32-overflow case. | Real GLB material with normal scale 1e300 rejects. | Enforce the same numeric envelope at source and runtime boundaries. **moved** |

No test thresholds were weakened; no tests were deleted. No unit statistics changed.

## Choices for integration ledger

**Sound, high confidence — make materials required in the existing bounds helper.** When an appearance is baked, its material slots determine which vertices need valid direction frames. The bounds helper now receives those slots explicitly and checks each pose it already computes. The plan specified traversal reuse but not its function signature; an optional parameter would permit callers to silently skip the source admission rule. This constrains future bounds callers to provide the appearance's actual material list.

**Sound, high confidence — mutate a real fixture in memory for the collapse regression.** The test opens the existing Blender GLB and authors diagnostic weights, normals, tangents and a two-bone rotation only in test bytes. The bind directions are valid, while one sampled pose cancels them exactly. The alternative was a new checked-in art fixture or a hand-built fake importer result; this preserves the real byte-import/bake path without adding source art or another fixture owner. The exact old position/normal comparison separately covers the production roster.

The relative threshold, preservation of the existing normal formula, mapped-only admission, bind-only runtime checks, Float32 scale envelope, and material identity wording were explicitly assigned by the parent, not new discretionary product choices.
