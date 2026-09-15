# Stateless directional erosion investigation

Rejected after the close-clay resolution diagnostic. No regional capture,
production code, source change, dependency or baseline is retained.

The candidate replaces the source's old crest modulation with its geographic
range-distance envelope, then applies a signed-noise body and two slope-directed
erosion octaves under the shared relief owner. Coast coverage and city-apron
construction are unchanged. The candidate patch contains the implementation and
its required upstream notices; it is reproduction evidence, not a supported
renderer mode.

## Findings

The first composition exposed a correctness failure: the erosion kernel consumes
a slope direction, but bilinear source height has discontinuous gradients.
Across a source-cell boundary at 16,73.04, height jumped 9.821km in exaggerated
render units. A red regression pinned that failure before local 16-sample
Catmull–Rom reconstruction repaired it. The corrected source sampler preserves
all source-node heights and provides analytic gradients; other source channels
retain their existing bilinear sampler. The measured seam gap falls below
0.000001km at the same tiny query separation.

The corrected height is continuous, but visual acceptance still fails. The
fresh comparison relayed by the integrating agent found improved upper-left
connected spurs and summit, alongside a continuous tall central wall, diagonal
steps, a lower-right thin pillar and pinched summit. It found no broad foothills
or open valleys and did not accept the candidate.

The final diagnostic freezes the filter and compares 2km with 1km mesh spacing,
with shadows off. Actual camera world and projection arrays match exactly, and
both captures have no GPU validation or page errors. Finer geometry smooths
spurs and several jagged edges, but the long wall and thin pillar remain. This
separates undersampling from the remaining intrinsic form failure. No parameter
sweep or regional expansion follows.

## Cost and numeric controls

The pinned upstream Rust implementation was compiled independently using cached
local dependencies. With only its numeric types widened to match JavaScript,
five kernel samples differ by at most 2.22e-16 and two-octave heights match
exactly. Scalar campaign noise remains unchanged; analytic-noise derivatives
agree with finite differences within 6.47e-10. Required notices are retained in
[erosion.NOTICE](erosion.NOTICE).

The C1 candidate needs 16 source-height samples and 32 local phase-cell evaluations
per height query, with no graph or persistent field cache. Over 10,201 fixture
queries, the old field takes 3.68–3.85ms, the new plain base 3.48–3.59ms and the
filtered field 14.47–14.83ms. These are CPU microprobe timings, not hardware frame
rates. Source arrays remain unchanged at the consumer, queries are deterministic
and coastal attenuation remains zero at the shore.

Catmull–Rom reconstruction adds no hard overshoot clamp. The fixture's global
maximum stays 14.9999km; local corner-range overshoot reaches 0.2436km and minimum
undershoot reaches-0.6365km in coastal/water cells, where the geographic envelope
and wet coverage exclude it. Other real-source overshoot is not claimed verified.

At 9,870 identical sample positions on the fixture's right tile,2km mesh error
against the continuous field is mean 0.0848km/p95 0.323km/max 2.356km. At 1km it is
mean 0.0280km/p95 0.102km/max 1.164km. That tile grows from 12,800 to 51,200 triangles;
its isolated build rises from 136ms to 410ms. The complete captured fixture grows
from 28,479 to 105,752 triangles. More geometry does not establish the missing
landform quality.

## Review boundary

Eight focused tests and both TypeScript checks pass after the C1 repair. Tests,
source and helper changes are removed with the rejected candidate. No physical
terrain, gameplay generation, combat, movement or save code changes.

Independent static review found one integration issue: the source crest removal
also affects the old campaign surface, which bypasses the replacement relief,
and changes height-derived light/rock/forest channels. It therefore cannot be
shipped ahead of production migration, and any future version must account for
those cover effects. No further C1/analytic-gradient/source-immutability defect
was found. Rejection resolves the unshipped integration issue without adding a
compatibility path.

The reusable lesson is an input contract: directional synthesis needs a continuous
source-gradient field. Passing that contract alone does not establish believable
mountain structure at the intended mesh resolution.

## Uncaptured causal control

The plain signed base without erosion was timed on CPU but was not captured.
The candidate patch reproduces the complete clean-source/C1-base/filter state.
Replacing only the local `shaped` assignment with the existing base `height`
provides the next causal control; reuse the recorded camera matrices rather
than recentering on its changed height. No such variant is implemented here.

Primary references: [the author's technique](https://blog.runevision.com/2026/03/fast-and-gorgeous-erosion-filter.html)
and [the pinned CPU reference](https://github.com/korbindeman/bevy_erosion_filter/blob/494b366960eec25604a56e05e56acdc2d6a62429/src/cpu.rs).
