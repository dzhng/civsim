# Connected drainage cut: rejected before rendering

One CPU-only hypothesis, no production edits, GPU work, source-schema change or parameter sweep.
Reproduce from the worktree root with `node throwaway/mountain-drainage.mjs`.
The script uses the existing `throwaway/campaign-field-real.json` and transpiles the
current production relief function. The result records SHA256 hashes of both inputs.
Full results: [metrics](metrics.json).

## Exact control

For each region (Alps -450,990; Italy -325,640), sample current relief on a 481 km
inclusive, 2 km-spaced grid (241² nodes; 480 km between extremes). A deterministic
priority flood, ordered by filled height then node index, constructs one parent
forest leading to perimeter outlets. Reverse accumulation assigns contributing
area. Retain paths with at least128 km² upstream area. Their radii increase as
min(18,6+.08*sqrt(area)) km: minimum6.905 km, about3.45 production cells.
Rasterize a Wendland C2 cross-section with maximum overlapping influence, then
sample that nonnegative mask with a cubic B-spline (16 source reads) to remove
hard raster maxima. Subtract at most30% of existing relief above its unchanged
foothill term. No jittered links, erosion iterations or additional noise.

Priority-flood elevations are used only for routing. They are NOT added to the
rendered surface. This distinction exposes the failure below: graph connectivity
does not imply a downhill valley in the actual candidate surface.

Evaluate the central240 km square at0.5 km spacing, retaining source envelope>2,
with120 km routing padding. Gentle-low is slope<0.2 and height below the same
control-derived p25 threshold for both fields. Derivatives use0.005 km separation;
mesh error uses actual2 km Float32 triangle reconstruction. Coast attenuation is
not exercised (inland=Infinity); no shoreline, water, city or visual acceptance is
claimed. The routing forest uses the regional perimeter as outlet, so this is not
proof of geographic hydrology. Nor does a four-neighbor gentle-ground component
metric constitute a visual judgment.

## Measurements

| Metric | Alps control → cut | Italy control → cut |
|---|---:|---:|
| Largest gentle-low patch, km² |550 →292|104.25 →48|
| Gentle-low components |57 →279|15 →56|
| Gentle-low total, km² |2980 →1896.75|265 →252.25|
| Gentle-low area after1 km erosion, km² |1766.25 →635|105.75 →23|
| p99 mesh absolute error, render km |.4021 →.6235|.2297 →.3068|
| Maximum mesh error, render km |1.7034 →2.0962|.7922 →.7922|
| p95 gradient |1.6136 →2.2440|1.0480 →1.1980|

Both derived masks repeat bit-exactly, raise no evaluated sample and have no
parent-cycle/outlet-order failure or downstream width decrease. Those correctness
checks are insufficient:1245/4802 Alpine and1622/4941 Italian retained links still
travel uphill on the candidate surface, with maximum rises2.196 and2.104 render
km respectively. The bounded cut did not breach the existing enclosing ridges.
Meanwhile, it made gentle ground smaller and more fragmented, increasing slopes
and sampling error despite the deliberately broad footprints.

Each region retains232,324 mask bytes. Typed construction arrays total2,207,078
bytes, excluding JavaScript heap/order arrays; local build measurement is about69ms
including candidate-link checks. These are scratch CPU measurements, not hardware
frame timings or a proposed runtime budget.

## Disposition

Reject. No visual seam is warranted by these results. The failed hypothesis is
that a connected, accumulated drainage mask subtracted from current folded
relief can create open valleys while preserving its peaks. Connectivity in the
routing data does not repair the original contour-ridge topography; the gentle
floor regressions argue against spending a tuning sweep on cut depth/width.
No production drainage owner, fallback mode or generated asset is retained.
