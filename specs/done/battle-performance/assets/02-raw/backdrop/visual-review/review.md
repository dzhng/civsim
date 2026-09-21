# Fresh image review

Inspected all 16 full actual/expected pairs at their native 640×400 size, covering both samples-1 and samples-4 and all eight named cases. Also inspected tight nearest-neighbor 3× paired crops of procedural surfaces, detail/backdrop boundaries, upper-right backdrop coverage, shifted detail and the horizon. Crop files place actual on the left, expected on the right. No implementation, report.json, browser, or prior judgment was read.

No concrete visible actual-versus-expected difference was identifiable at full size or in the inspected 3× crops. Relief motifs, speckle locations, extent of the central detail patch, background coverage, and horizon shape align. Decoded RGBA metrics independently show a maximum channel difference of 1/255 in every pair, affecting 0.136–0.614% of pixels. These are tiny numerical differences, not visible missing coverage or changed patterns in this evidence. Confidence: high for these static frames; no inference about motion or other cameras.

Shared limitations, visible in both sides:

- The composed cases expose an extremely abrupt yellow detail rectangle against dark green surroundings. This reads as a separately pasted terrain patch at full size. The crop confirms an unblended color and texture-frequency discontinuity, with no visible empty gap along the inspected boundaries. The shifted case preserves the same issue at its new position.
- The green backdrop has conspicuous bright yellow-green flecks over broad soft dark blotches. At full size it reads flat and stippled; 3× exposes block-shaped flecks and smooth blurred underlying forms. Yellow detail has similarly soft worm-like ridges and tiny grain. No unmistakable regularly repeating tile seam or periodic duplicate patch was identified; that does not establish non-repetition over a larger world.
- The backdrop terminates at a straight horizontal edge near y=35 in the overhead views and a clipped diagonal upper-right corner. In the horizon frame it forms a straight plateau near y=159 with sloping outer shoulders. These geometric ends are visible at full size and conspicuously stair-stepped in the 3× crops. Both versions cover the same areas; the shared edges make the world feel bounded.
- The horizon frame has a smooth blue-to-cream sky, a sharp land/sky cutoff, and little distinct distant terrain silhouette. It is clean of obvious holes in the shown frame, but looks like a flat bounded sheet rather than an expansive natural horizon.

Case coverage: backdrop shows identical-looking green surface/coverage; default and wide-detail show identical-looking isolated yellow surface/outline; composed and composed-wide show identical-looking overlay and transition; restore matches that visual composition; shifted shows identical-looking relocation/edge; horizon shows identical-looking low-angle plane and sky. These statements apply to both sample directories.

Artifacts: metrics.json contains decoded dimensions, changed pixel counts, channel MAE/max, and changed bounding boxes for each pair. examine.cjs records crop regions and metric method; *-tight3x.png are paired crops. Metrics use all four RGBA channels and are not perceptual scores.
