# Ocean residual localization — unresolved

Production shaders and thresholds remain unchanged. These are deliberately
modified diagnostic builds, not candidate fixes or performance measurements.
The original beauty check still fails3 of6 cases; duplicate horizon cases confirm
repeatability. All runs have no browser errors/warnings and release tracked water
resources. [Summary](summary.json) identifies each experiment; full reports and
shader/runner archive retain the primary data.

## Observations

- Decoding the existing RGBA8 reports finds only1-code channel differences,
  scattered across sky and water. All six cases have5995–7270 changed pixels.
  This quantized map does not identify the worst HDR pixel or select a cause.
- Reporting-only instrumentation reproduces the original residual exactly and
  records its location. Overview time3.25: x498,y14, red .4755859375 versus
  .470947265625. Horizon time0 and repeat: x300,y163, green .66943359375 versus
  .6650390625. Reporting did not change any shader or gate.
- Roughness0.3 on **both** renderers reduces the peak and passes the numerical
  threshold, but horizon time0 still differs .003662109375 at the same pixel.
  This is not the production roughness and is not an accepted appearance change.
  Sensitivity to roughness is demonstrated; it does not identify the root cause.
- Encoded unlit world normals on both water surfaces leave .00341796875 at the
  same horizon time0 pixel; other cases are at most .0009765625. This bypasses
  water lighting (including source material fog). PBR/PMREM alone cannot explain
  this diagnostic residual. It does not prove all beauty errors share one cause,
  and changing shader outputs can change compiler behavior.
- A counterfactual source vertexNode using a uniform canonical combined projector
  does **not** solve the comparison: horizon peaks grow to .0068359375 and
  .0107421875. Do not adopt that reference change or use it to relax the gate.
- Intercepting createShaderModule captures native ocean and actual Three vertex/
  fragment WGSL while reproducing the original beauty numbers. The captured
  modules support comparison of realized shader operations and
  interpolants, not only TSL.

## Review limits and next step

The initial Claude source review is retained, with its limits: it could not read
compressed reports in its restricted tool session. Root supplied the missing
artifact analysis. Its claims that spatial RGBA8 distribution would pick a cause
outright, or that subpixel reprojection was excluded, are not established and are
not accepted. Floating-point amplification remains a hypothesis, not justification
for reblessing. There is no FXAA in this post path; bloom is disabled in the check.

The shader review identifies a concrete difference: raw uses a combined canonical
projection and invariant vertex position; Three uses separated operations without
invariance. Matching mathematical formulas does not guarantee identical floating
point results across compiler contexts. Its speculative world-space error estimates
are not established by the data.

## Projection and invariance experiment

The [projection summary](projection-summary.json), compressed full reports and
runner archive retain a controlled follow-up. All beauty measurements preserve
the original material and absolute threshold; the source projector and shader
invariance are explicit diagnostic changes, not an adopted oracle correction.

| Reference vertex calculation | Overview t0 / t3.25 maxAbs | Horizon t0 / t3.25 maxAbs |
| --- | --- | --- |
| Original | .0029296875 / .004638671875 | .00439453125 / .00244140625 |
| Combined projector only | .00244140625 / .004638671875 | .0068359375 / .0107421875 |
| Invariance only | .00341796875 / .00439453125 | .00439453125 / .001953125 |
| Combined projector and invariance | .000732421875 / .000732421875 | .0009765625 / .0009765625 |

[RGBA8 identity comparison](projection-pixel-identity.json) confirms the raw
images are byte-identical between the original and joint experiment in every
case. Reference changes affect102–204 channel bytes per image, at most one code
value. This checks stored display bytes, not full HDR identity.

Horizon repeats match their first cases. Both changes together pass all six cases;
either alone fails. Removing native invariance alone also fails and worsens the
horizon. All runs have empty browser error/warning lists and zero tracked water
buffers after disposal.

An unlit fractional-world-coordinate probe reads linear HDR directly, bypassing
postprocessing. Its blue .25 sentinel distinguishes water from sky. At the two
original problematic water pixels, the joint change makes sampled fractional XY
exactly agree; projector-only does not. Fractional coordinates wrap every metre:
they establish a coordinate discrepancy, not its unwrapped absolute distance.
Large global errors in this diagnostic can occur at the wrap discontinuity and
are not beauty failures.

This supports projection/interpolation as the cause of the localized discrepancy
in these cases. It does not prove all composed-scene residuals have that cause.
A fresh read-only review supports a declared aligned component comparison; its
implementation proposal is narrowed below.
Do not ship global shader string interception or silently replace the original
end-to-end comparison with the passing diagnostic. Ordinary ocean appearance,
original source residual, full-scene quality and final performance remain open.

## Independent review disposition

Accept the matched-input component experiment and preserve native invariance.
The review confirms the pinned Three builder has no first-class invariance option.
A per-material, per-owned-renderer builder hook can be evaluated in the lab, with
generated-shader checks and independent source material construction. No global
GPU API interception, library upgrade or native projection change is justified.

Reject the proposed module-global camera uniform: separate worlds/cameras must
not overwrite each other's projection. The lab can own its reference uniform and
fill it from the existing canonical camera function. Reject adding an experiment
option to production water factories when the returned material can be configured
by the lab. Reject changing the aggregate passed flag to ignore the original
failures: aligned and original outcomes must remain separately named, and default
coverage must not get easier.

The reviewer calls this categorically not a port defect; that conclusion is too
broad. The experiment explains these localized cases, not every shader operation
or composed scene. Likewise animated fragment output can change while vertex
displacement is broken: a motion-image difference alone does not prove the swell
geometry survived a custom vertex node. Require a displacement-sensitive witness,
not only a count of shader sin terms. A deliberate raw shading perturbation must
also fail the aligned comparison. Preserve original library-derived camera tests,
identity-transform constraints, per-camera uniform isolation, lake coverage and
resource disposal. No M3b visual exit is claimed by this read-only decision.

## Draft coverage witness rejected

The first aligned-reference draft classifies water coverage by thresholding beauty
RGB against the same image without water. That is not a geometry-only measurement:
lighting changes can cross the threshold at a fixed surface. The retained
[counterexample](coverage-counterexample.json) executes the actual draft helper
with one fixed pixel changing only its red channel, .003 to .005, and receives
reported moved coverage1. It records the source hash; the script is retained.

Replace this witness with direct geometry/coverage/depth evidence independent of
beauty lighting. A deliberate vertex-flattening mutation must fail it. This is
separate from the raw shading perturbation that must fail aligned beauty. No
passing draft color-mask test closes displacement fidelity. Original image gates
and production rendering remain unchanged.
