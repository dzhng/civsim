# Canonical shoreline relief and continuous edges

Dry source features cannot inherit only coarse corner heights: those corners
may all be water around a small island. The conforming mesh accepts the canonical
height query and samples it at its own vertices. The regional diagnostic supplies
shared relief and coast distance; source-gradient normals remove topology-sized
lighting discontinuities. No second rendered water surface is introduced.

Adaptive partitions can otherwise create T-junctions: one polygon sees a midpoint
that its larger neighbour omits. Nonlinear elevation then opens a crack. A new
fixture reproduces a0.1km mismatch and now passes. Shared edge vertices are
retained; only polygons needing extra edge points receive a center fan. Sorted
row/column lookup avoids scanning the whole map for each edge. The count pass
includes those extra vertices/triangles before allocating output arrays.

This makes the full-source overview exceed the local32MiB helper default. Its
explicit build allowance is48MiB while the complete CPU/GPU/staging admission
assertion remains128MiB and passes. No total-memory ceiling is increased.
The helper's default for smaller tile requests is unchanged.

The bank images improve because cracks and large triangular shading jumps are
removed. Source-raster coastline steps remain visible. These are diagnostic
flat-material views; they do not complete whole-landscape water quality.

Fresh review prefers the new bank continuity with high confidence: rectangular
bands and long shading seams are gone. Softer angular shading patches and the
stepped source outline remain. No clear open water/land gap is visible, but the
CPU crack regression supplies the stronger continuity evidence. Four diagnostic
images repeat with zero differing RGBA pixels and no GPU/page errors. Independent
code review finds no actionable regression; its11 focused tests and TypeScript
check pass.
