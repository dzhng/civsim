# Main crowd geometry is a material cost opportunity

This diagnostic keeps one prepared canonical-contact world and tactical camera.
It alternates original / middle / original / middle / original geometry without
reloading assets. Only main-view L0 buckets borrow their existing L1 base vertex
attributes and index buffers; per-instance data, shader materials, shadow
geometry and far impostors stay unchanged. Five-second warm intervals precede
each eight-second sample. The temporary buffer sharing is not production resource
ownership and no geometry is disposed during the experiment.

Actual main admissions and consumed cameras match in every arm. Main mesh draw
work changes from **43,197,662 to 5,942,118 triangles**, counted from each bucket's
actual index count times instance count. This excludes impostors and does not use
Three's aggregated scene statistic. Return controls restore the exact triangle
total. Canonical state hash, shadow tier histogram, grass record hash and grass
submitted triangle count also match. This proves a real change in geometry work
while retaining the measured audience and other feature counts.

| Arm | Main geometry | Observed GPU union median | Main interval median |
| --- | --- | ---: | ---: |
| 0 | Original | 48.98 ms | 42.98 ms |
| 1 | Existing middle | 27.24 ms | 21.40 ms |
| 2 | Original | 43.60 ms | 39.13 ms |
| 3 | Existing middle | 23.70 ms | 18.95 ms |
| 4 | Original | 44.12 ms | 39.37 ms |

The repeated reversals establish a large cost opportunity under this shared-host
stationary workload. They do not quantify the eventual quality-preserving gain.
Existing middle meshes have known visual defects at larger sizes; changed surface
coverage and shading contribute alongside vertex/triangle processing. This is not
pure vertex-cost attribution, a backend comparison, a quiet-host run, or live
performance acceptance. GPU interval union is not physical GPU busy time; stages
may overlap. Summaries filter to in-window frame submission IDs and report missing
or incomplete tail coverage explicitly.

The next implementation direction is calibrated detail at the measured size
bands, starting with the high-count infantry classes. Improve candidate geometry
where existing tiers lose equipment or armor, retain the original close mesh,
and validate a bounded interval in canonical poses and dense camera transitions.
Do not copy this all-zoom substitution into production. Keep independent shadow
representation, unchanged army content and the full-resolution framebuffer.
