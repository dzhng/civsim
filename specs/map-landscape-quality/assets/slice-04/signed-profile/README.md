# Signed relief-profile control

Rejected after the two fixed-camera real regional clay comparisons and fresh
independent image critique. All production code is restored; no baseline,
source-field, biome, fixture or test changes are retained.

The candidate changes only the profile under the existing shared relief owner.
It replaces the zero-contour ridge response and its squaring with the existing
signed gradient noise mapped to height. Domain warp, 60/28/13km scales, octave
weights, geographic envelope, interpolation, coastal attenuation and ecological
query ownership remain unchanged. Apply the reproduction-only
[patch](candidate.patch) with `git apply --unidiff-zero`.

## Visual result

Before images are the accepted-source/accepted-relief controls from the preceding
[source-crest investigation](../source-crest-control/README.md):
[Alps](../source-crest-control/before/alps.png) and
[Italy](../source-crest-control/before/italy.png). The unchanged sky fix is present
in both stages. Candidate [Alps](candidate/alps.png) and
[Italy](candidate/italy.png) use exactly those recorded world and projection
matrices, existing regional presets, 2km geometry, neutral clay, no vegetation,
no shadows and time zero. Both maximum matrix differences are zero, with no
reported page or GPU validation errors. Center-ray telemetry belongs to the
route's original height-following pose, not the forced camera. These snapCheck
captures are diagnostic evidence, not accepted production baselines; no repeat
was run.

Raw changed-pixel fractions are 80.29% for Alps and 49.57% for Italy; mean channel
differences are 10.02 and 4.17 on the 0–255 scale. They establish a real change,
not visual quality. Two-times crops preserve the corresponding central features.

The [fresh critique](critique.md), run independently through Codex CLI by the
integrating agent, prefers before in Alps with high confidence and Italy with
moderate–high confidence. Candidate replaces identifiable summits, saddles and
branching ridges with broad rounded masses and parallel flutes. Italy loses
small spurs and valley openings into an elongated wall. Neither region gains
convincing foothill continuity. Direct inspection agrees: smoother sampling
trades away readable mountain structure. No parameter sweep follows.

## Numeric boundary

A CPU probe isolates the profile on a constant 15-unit source envelope at
226,728 regional-coordinate samples. Candidate profile range is 0.361–0.879,
versus 0.313–0.928 before; height range is 12.82–29.34 versus 10.83–31.12.
At a fixed interior position in each 2km grid triangle, interpolation error
falls from mean 0.0866 / p95 0.245 / maximum 1.368 to
0.0214 / 0.0561 / 0.1766. Maximum adjacent 2km height step falls from 4.494 to
1.603. These are empirical constant-envelope sampling results, not global
height bounds, real-source interpolation guarantees or hardware frame timings.
Deterministic queries, unchanged source bytes and zero shoreline height pass.
Seven existing surface/woodland tests pass without edits.

The improved sampling metric does not establish better landform. Keeping the
source fixed correctly isolated the relief profile; this particular direct
noise-height replacement still fails the visual target. Slice 04 remains open.
