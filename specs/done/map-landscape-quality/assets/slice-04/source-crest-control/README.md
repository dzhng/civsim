# Regional source-crest control

This diagnostic removes only the source crest modulation in `TerrainField`.
The accepted shared `campaignRelief` remains unchanged. It separates source
ownership from the earlier signed-base/C1/filter experiment, which changed
several shaping stages together. The reproducible [patch](candidate.patch)
applies with `git apply --unidiff-zero` and replaces the modulated range height with `5 + min(ridgeD, 6) * 3.9`.

Both stages use base b6d14453 plus the sky-ray fix b7424839. The Alps and Italy
captures use existing regional presets, 2km geometry, neutral clay, hidden
vegetation, no shadows and time zero. Candidate world and projection matrices
are forced to their respective measured baseline matrices; both maximum camera
differences are exactly zero. All four browser captures report no page or GPU
validation errors. The new snapCheck images are diagnostic evidence, not blessed
production baselines; no repeat was run. Center-ray telemetry uses each route's
original height-following pose and is not an alignment assertion for the forced
capture camera.

[Alps before](before/alps.png), [Alps candidate](candidate/alps.png),
[Italy before](before/italy.png), [Italy candidate](candidate/italy.png).
Two-times crops retain central range details for review. Raw pixel changes are
61.87% in Alps and 39.04% in Italy, with mean per-channel differences of 2.04 and
0.82 on the 0–255 scale. These establish that the candidate reached rendering;
they do not measure visual quality.

Source construction also derives cover/light channels from height. Clay hides
those channels and vegetation, so this comparison cannot approve their changed
production behavior. No interpolation, relief algorithm, coast-mask logic,
city-apron logic, physical/gameplay terrain, test or fixture changes are made.
Removing one source noise evaluation per mountain node adds no query owner,
cache or schema; no frame-performance improvement is claimed.

Fresh regional review prefers the Alps candidate slightly for smoother central
junctions, but finds no meaningful overall gain; Italy is a tie. Walls, fins,
shelves and fluting persist. No new blocker was identified. This is not mountain
form acceptance.

The real-data CPU comparison finds identical land/render masks, moisture and
shore bytes, and zero water heights. Source rock/forest values change: Alps mean
absolute rock delta 3.49/255 (maximum 78), forest 1.10 (maximum 37); Italy rock
2.40 (maximum 50), forest 0.60 (maximum 27). City-apron construction is unchanged,
but its surrounding source change passes through smoothing: the largest sampled
city-height difference is +1.748 at Domavium (+1.742 at Iuvavum). These are visual
source units, not physical elevations. Thus this simplification is not behavior
preserving. Seven existing surface/woodland tests pass without edits. The CPU
probe uses the real loaded raster in a browser with GPU disabled.

The final [natural before](natural-before.png) / [natural candidate](natural-candidate.png)
Alps pair also has exactly matching camera matrices and no reported errors.
Direct inspection finds the same dominant walls and contour structure, with
cover/tree placement changes but no clear visual benefit. This pair supplements
the fresh clay review; no separate natural-only fresh review or acceptance is
claimed.

Rejected: the slight clay preference does not justify the measured cover and
city-height movement. Source code is restored; only evidence remains. Slice 04
stays open. A future single-owner relief-profile experiment should preserve the
existing source so its effect can be judged independently. No new profile is
implemented here.
