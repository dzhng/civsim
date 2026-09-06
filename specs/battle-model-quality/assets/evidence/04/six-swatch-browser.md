# Six-swatch production/standard-loader comparison

Scope: material transfer, not finished surface art, thickness, anatomy or final LOD quality. From `web/`, run `VERIFY_GPU=1 node scene.mjs battle-model-material-swatches` against the configured verification server. The parent owns package-hook registration and integrated hardware acceptance.

The scene loads candidate42 through the real workbench. The stock GLTFLoader asset enters the **same** world under the existing glTF-to-engine rotation. Crowd instances are temporarily suppressed; source geometry is installed into the same scene, camera, lights, shadows and post-processing. There is no oracle-only environment or material correction. The fixture remains above contact-darkening height and contains no faction mask. Only front-facing surfaces are compared: stock versus custom backface policy is deliberately not covered here.

## Measurements

Seven matched cases: textured phases0/0.5/1 at front/oblique views, then scalar-only phase0.5/front. The source SHA256 matches the independent Blender evidence. Stock SkinnedMesh positions agree with that evidence within `3.384654378544993e-7m`, checking60vertices for each case.

Across every pair, all world pixels differ by at most two RGB codes; bent and scalar cases differ by at most one. Each material's projected triangle-interior samples differ by at most one. This tiny comparison allowance covers the measured stock/VAT arithmetic and image-path quantization differences; **the regression snapshot remains zero tolerance**. The only excluded full-frame rectangle is the explanatory caption band above the geometry, because column labels intentionally differ. Material-interior checks remain independent of that caption exclusion.

Removing all authored images on both paths leaves the scalar material factors intact and changes every material's production interior by more than10RGBcodes. This is a deliberate diagnostic control, not a substitute for the independently scoped channel tests. Restoring the original production surface after source rendering and reload produces the exact original screenshot bytes. Strict reruns return `0 px differ`; no GPU/page errors.

The [paired baseline](../../../../../web/shots/models/battle/material-swatches/paired.png) includes explicit renderer and spatial material-order labels. Label changes were inspected after the fresh visual critique without changing geometry, camera or materials. The [strict run output](./six-swatch-strict.log) retains the measured values.

## Review and visual verdict

Independent code review `01a07569-604c-7bd2-98ad-d4a51ff01d41` found no actionable defect. It confirmed genuine same-world comparison, independent stock geometry evidence, non-vacuous texture response, restoration and measured tolerances. Only this scene and its evidence/baseline belong to this pass; parent-owned Three shader files were verification copies, not committed here.

Fresh image critique `01a07569-b795-77a3-8d6a-0e02bb5871cc` inspected the full sheet and enlarged bent crop from outside the project. Its [verbatim findings](./six-swatch-critique.txt) are retained. The two columns preserve shape and highlight placement. Medium-confidence perceived warm-color shifts are bounded by the measured one-to-two-code differences. Shared kinked/thin geometry is the explicitly authored diagnostic, not character-quality acceptance. The metallic band also exists in the source/scalar reference: this pass proves its transfer, not that it is desirable final material styling. Dark swatches and the pale scalar control should not be mistaken for final surface readability approval.

**Verdict:** production faithfully transfers this source fixture within the measured bound; neither paired renderer is visibly less wrong for the scoped variable. The image-enabled result is more informative than the scalar control, and both are retained. The integrating parent still owns04d consumer/performance closure.

## Changed-test ledger

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| `battle-model-material-swatches` (new) | No same-world six-material stock-loader comparison. | Source hash and source pose evidence, seven paired world/interior comparisons, six image-response controls, exact restoration, strict annotated contact sheet. | Close the missing material-transfer integration proof. **moved** |

No existing test was removed or relaxed; no runtime, asset or simulation behavior changed.

## Choices

**Sound, high confidence — use the stock loader inside the existing workbench world.** When the pair changes renderer, only the soldier geometry/material path changes. The alternative separate oracle world would introduce different lighting or post-processing and obscure whether a discrepancy came from transfer. This seam was explicitly assigned by the parent.

**Sound, high confidence — keep whole-image and per-material evidence together.** A mostly unchanged background could conceal missing surface response in an average metric. Whole-world maximum differences catch unrelated changes; per-material interior samples and map-disabled controls prove each visible material contributes. No generic image-analysis framework was added.
