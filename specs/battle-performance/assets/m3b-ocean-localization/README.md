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
  fragment WGSL while reproducing the original beauty numbers. The next bounded
  review compares realized shader operations and interpolants, not only TSL.

## Review limits and next step

The initial Claude source review is retained, with its limits: it could not read
compressed reports in its restricted tool session. Root supplied the missing
artifact analysis. Its claims that spatial RGBA8 distribution would pick a cause
outright, or that subpixel reprojection was excluded, are not established and are
not accepted. Floating-point amplification remains a hypothesis, not justification
for reblessing. There is no FXAA in this post path; bloom is disabled in the check.

Claude Opus now reads the captured WGSL directly, with no GPU work or edits. Root
will verify a concrete finding before delegating a narrow fix. Ordinary ocean
appearance, the original absolute threshold, full-scene quality and final battle
performance acceptance remain unchanged/open.
