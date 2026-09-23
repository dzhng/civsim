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

## Plain-base causal control

[Plain base](plain-base.png) disables only the erosion assignment in the archived
candidate, retaining the signed body, C1 height reconstruction and source cleanup.
It uses the filtered 2km capture's exact world and projection matrices, clay and
no shadows. [Capture telemetry](plain-base.json) records zero camera difference,
28,479 terrain triangles and no page or GPU validation errors. The snapshot is
new diagnostic evidence, not a changed production baseline; no repeat was run.
The reported center ray belongs to the route's original camera setup and is not
an alignment assertion for the forced capture camera.

The broad continuous wall remains without erosion. The lower-right thin pillar
and repeated sharp diagonal/zigzag features visible in the filtered image are
absent. Thus the filter composition adds those problematic features, while the
wall's continuity already exists in the base. This control does not establish
visual acceptance for either field.

The coastal fixture itself imposes a continuous Gaussian ridge:
`3 + 12 * exp(-((x - 12 - sin(y / 38) * 10) / 24)^2)` on land.
Its ridge position bends along y, but its amplitude has no along-ridge valleys.
Preserving that envelope naturally preserves continuity. The fixture remains
useful for sampling and coastal continuity; it cannot alone establish whether a
replacement produces useful branching and open valleys on campaign geography.
The next form assessment needs a fixed real regional clay view alongside these
numeric/sampling controls, and must distinguish source-imposed structure from
synthesis artifacts before rejecting or accepting either. No new algorithm,
parameter sweep or regional capture is part of this control.

The source-constructor cleanup also affects height-derived cover/light channels
on real campaign inputs, as the static review noted. It remains diagnostic only;
this synthetic fixture does not exercise that constructor. All production and
test changes were restored after capture. Reproduce from `candidate.patch`,
replace the local `shaped` assignment with `height`, and use the recorded camera
matrices without recentering on the changed terrain height.

Primary references: [the author's technique](https://blog.runevision.com/2026/03/fast-and-gorgeous-erosion-filter.html)
and [the pinned CPU reference](https://github.com/korbindeman/bevy_erosion_filter/blob/494b366960eec25604a56e05e56acdc2d6a62429/src/cpu.rs).
