# Raw posed normal-map acceptance

## Scope and verdict

The target is authored tangent-space direction following the weighted pose, instance yaw and corpse roll, while retaining the exact unmapped rendering path. This accepts normal-map consumption in the retained approximate raw lighting model, not finished soldier art or standard-PBR parity.

The final `soldier-materials` scene passed on SwiftShader, with all five strict snapshots at zero differing pixels. The four inherited snapshots were not changed. Typecheck and the focused `skinnedPipeline` unit test passed. Independent Codex code review found no actionable issue in shader behavior, oracles, unmapped preservation or resource lifecycle; it independently ran typecheck, not browser tests. Its lint run reported only the inherited `battleAudio.ts` no-this-alias warning.

`normal-final.json` records the browser checks. The full image pair uses identical 1280×800 viewport, DPR, camera, class 40, bend phase 0.5, scalar colors and lighting; only the normal texture flag/data differ. `unmapped.png` is A and `mapped.png` is B. The constant locally authored map is a directional diagnostic, not a skin/armor texture.

## Visual judgment

Full images and the body/shield crop were inspected. B is cooler/darker on the torso and shield while the bent arm retains its surface changes; geometry and framing remain fixed. The independent unprimed verdict is preserved verbatim in `critique.txt`: no clear new defect, but image evidence alone cannot distinguish lighting from material-color changes. CPU lighting oracles establish the cause. Existing block geometry and disconnected fixture limbs remain; neither image satisfies the user's eventual model-quality target.

For this scoped direction-consumption target, B is less wrong because A ignores authored normal direction. This is not a claim that the diagnostic blue-gray shading is aesthetically preferable. Full-frame distance is 0.00913, body/shield crop distance 0.07562; crop mean luminance falls 6.24634 codes. These locate the intended change, not an acceptance threshold. Grayscale, edge and difference artifacts remain in `comparison/`.

## Choices and limits

- Use the existing packed tangent vec4, same four-weight matrix as the normal, retain W, normalize posed XYZ before interpolation. No vertex/VAT format or inverse-transpose policy change.
- Normalize the interpolated tangent before relative projection; reject near-zero original interpolation before normalization so cancellation residue cannot become a spurious unit direction. The shared squared threshold is 1e-12.
- Mapped N drives diffuse, specular and rim. Unmapped slots retain vertex-interpolated light/rim exactly. Normal scale changes XY only, including scale zero; negative Z is not discarded.
- Zero interpolated N returns the authored geometric face direction outright. Raw `cross(dpdy(P), dpdx(P)) * frontSign` is pinned empirically on front/back quads. Collapsed T or decoded map returns geometric N. Huge finite scale uses largest-component normalization, avoiding squared-length overflow.
- Synthetic cancellation uses admitted per-vertex frames and the public raw factory, separate from the valid Blender pose controls. Zero decoded normal comes from a supported linearly filtered two-pixel PNG, not a float-texture bypass.
- Test-only route inputs expose phase, yaw, alive and death variant; defaults are unchanged. No new GPU resource ownership or draw-count policy was introduced.
- The CPU-vs-GPU yaw and corpse oracles distinguish smooth interiors from silhouette raster rounding. Corpse interior tolerance is four byte codes, with whole-image mean below .01. A real SwiftShader compute probe measured `sin(4.6)=-.9935179948806763` versus JS `-.9936910036334644`, and roll `.24116674065589905` versus `.2411356193459764` (3.11213e-5 radians). Final interior error is 3, mean .004676. This narrow independent-oracle allowance does not alter any screenshot threshold.

## CHANGE LEDGER

| Test | Previous behavior | New behavior and mechanism |
| --- | --- | --- |
| normal image transport | Uploaded normal image but required dormant shading | Retains the 4×2/three-mip transport assertion; opposing XY normals now change 38,953 body-region pixels through actual raw lighting |
| posed-normal snapshot | Absent | New strict screenshot pins the bent Blender diagnostic; all four previous snapshots unchanged |
| zero scale | No shading consumption | Opposing XY become pixel-identical at zero scale; a separate negative-Z control matches a −N geometric oracle |
| negative scale | Absent | Negative XY scale matches the opposing direction within one code without flipping Z |
| extreme scale | Absent | 1e6 and 3e38 approach the same visible tangent-plane direction within one code, without overflow |
| mirrored UV | Absent | Mirrored V plus W sign and mapped Y reversal preserve output within one code |
| weighted bend | Absent | Actual weighted GPU tangent pose matches independent CPU-preposed attributes, zero code error |
| instance yaw | Absent | GPU yaw matches CPU-left-rotated VAT; smooth interior error 1, whole-image mean .001179 |
| corpse roll | Absent | Same pose equivalence with the measured trig allowance above; interior error 3 |
| mapped shield lighting | Absent | Rigid shield interior matches CPU mapped-normal override exactly, pinning diffuse/specular/rim together |
| collapsed interpolated N | Absent | Front and back match independently authored geometric-normal controls exactly, also with scale zero |
| collapsed interpolated T | Absent | Returns the geometric normal exactly |
| decoded zero | Absent | Linear PNG sample decodes to zero and returns geometric normal exactly |

All new tests are requirement/control tests, not historical bug assertions. Deliberate mutations prove mechanism sensitivity: omitting tangent skinning makes the CPU bend oracle fail by 37 codes; forcing W=1 makes the mirror control fail by 64; leaving diffuse/rim geometric makes the shield oracle fail by 51. Reports are retained. The handedness mutation run additionally recorded an intentional device-destroy page error in the synthetic helper; that teardown call was removed before the final green run. All shader mutations were restored. No threshold was weakened to pass those failures.
