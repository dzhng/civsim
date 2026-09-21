# Matched multisample diagnostics

These are correctness probes, not performance results or an accepted water fix.
The numeric reports retain comparisons, point samples, shader observations and
errors. Large encoded image strings remain in their original scratch reports;
[the manifest](manifest.json) records source and omitted-string hashes so the
reduction is explicit. [Runners](runners.tar.gz) retain the diagnostic transforms.

The sample-count report observes source renderer and actual scene pass at four
samples, with compatibility mode false. The earlier displacement probe had zero
samples. Candidate c702e002 fixes that probe to the requested four samples; the
beauty residual remains unchanged. Flattening the aligned displacement now gives
exactly zero coordinate motion at all three poses, while source motion remains
nonzero. This validates that mutation check without claiming full geometry parity.

The matched direct-coordinate probe uses depth and four samples on both targets,
bypasses postprocessing and lighting, and still differs at grazing-view points.
Its aligned overview maximum is 0.0009765625; horizon maxima are 0.448486328125
and 0.4912109375. These are fractional-coordinate differences, not unwrapped
world displacement: wrapping can amplify a small coordinate change. They narrow
the investigation to a difference present before lighting, without proving its
precise cause. The earlier unmatched-target run is excluded and retained under
`throwaway/ocean-msaa-position/unmatched-target-invalid/`.

Explicit centroid interpolation makes aligned horizon beauty errors worse:
0.06201171875 and 0.0361328125, against 0.03466796875 and 0.02587890625 before
that experiment. It is rejected. Every report here has empty error and warning
lists. No original source gate, threshold or production shader changed.
