# Six-swatch source proof

Source acceptance only; the parent-owned matched-light standard-loader/production scene, raw/far checks and visual critique still own 04d closure. These are diagnostic surfaces, not finished soldier art.

The existing source fixture contained a gray surface and checker shield, not the six required materials. The new Blender script authors six identical segmented strips with skin, cloth, leather, mail, wood and metal slots. Its small images are locally computed neutral material signals, with no baked lighting or external asset/service. A shared base atlas holds neutral colors, a directional normal atlas and packed ORM image exercise transported channels, and slot factors distinguish roughness, metallic response and normal strength. It deliberately does not claim a convincing mail weave or leather finish.

## Reproduction and evidence

Run Blender with `--background --factory-startup --python-exit-code 1 --python packages/soldier-assets/bake/blender-material-swatches.py`, then `node packages/soldier-assets/bake/material-swatches.mjs`. Existing export/Blender-evaluated landmark helpers are reused; importing them no longer launches the human/mounted generators. Those source files and candidate outputs remain unchanged.

`material-swatches.test.mjs` and `material-swatches.mjs --check` pass. Repeated Blender export reproduces the GLB and baked files byte-for-byte; the saved `.blend` retains editable provenance, not a byte-stability claim. Independent Blender world-position evidence yields:

```json
{"samples":4,"checkedVertices":720,"maximumError":3.8015516667271555e-7,"minimumHeight":0.7100000381469727,"materialSlots":6,"imageChannels":3}
```

The actual source material factors, image bytes and samplers are asserted, not only their counts. All baked frames also remain above engine height 0.5, avoiding production contact darkening during the stock-loader comparison. A deliberate bind-only pose mutation fails at `bend-6/cloth/2`, error `0.027329600799662818m`; restoring actual sample selection returns green. Existing human/mounted candidate checks and engine-basis landmark tests pass.

Blender warns that the ORM composition includes more than one image node; these nodes deliberately refer to the same image with identical samplers. The exported material-set admission and exact-byte checks prove no conflicting image/sampler escapes. No warning was suppressed.

Independent review `01a07559-f00a-79c2-a73a-dcd8bcd50a43` found only generated Python bytecode beside the source. The script now disables bytecode emission; the temporary cache was moved to ignored scratch. The reviewed numerical/source scope found no remaining defect. The parent owns registration of the source test and deterministic candidate check in the existing package hooks.

## Integration seam

Candidate catalog: `/assets/soldiers/candidates/material-swatches/catalog.json`, appearance 42. Original GLB is retained at `swatches/source/tier-0.glb` under that catalog directory. All three explicitly supplied diagnostic tiers use that source; no final LOD claim. The existing landmark schema is retained in `assets/test/material-swatches/swatches.landmarks.json`.

The source uses glTF Y-up; the canonical engine conversion is `[x,-z,y]`. The clip is `bend` over one second, peak bend at half a second. Spatial left-to-right order is skin, cloth, leather, mail, wood, metal; exported slots are alphabetically ordered, so consumers should use names rather than assume slot order. The manifest owns all-pose framing bounds. Front normals point toward Blender -Y before the inherited ancestor rotation.

## Change ledger

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| `material-swatches.test.mjs` (new) | No six-material source or bent surface transport gate. | Asserts actual slot factors, exact embedded bytes/samplers, Blender pose agreement at four samples/all three tiers, all-frame height isolation and deterministic bake. | Add the missing source half of the six-swatch acceptance contract. **moved** |

No prior test, threshold, simulation statistic, asset format or renderer behavior changed.

## Choices for parent ledger

**Sound, high confidence — keep neutral palette in the shared atlas.** Blender's per-slot image multiplication creates distinct exported images. The fixture instead paints each slot's region of the same small atlas and retains independent scalar roughness/metallic/normal factors. This lets the actual Blender exporter satisfy the agreed one-image-per-channel envelope without special importer handling. The plan delegated local surface authoring, but did not specify how Blender should preserve the shared-image identity.

**Sound, high confidence — reuse source evidence through an import-safe fixture module.** The new source generator calls the existing GLB exporter and Blender landmark mapper. A main-entry guard prevents import from rebuilding unrelated fixtures. This keeps the independent source oracle in one owner without introducing a generic fixture framework. The parent explicitly approved this seam and the separate diagnostic catalog.
