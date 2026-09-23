# Terrain material ownership

A tiled world owns one configured terrain material. Tile admissions replace geometry and fog attributes; they do not rebuild the shared shader graph. Eviction releases geometry, and world disposal releases the material once.

The isolated comparison records matching hardware frames and a reduction from33.33ms to16.67ms p95. The merged world repeats15 composition/anchor/vegetation/shoreline snapshots with zero differing pixels, passes all490 web tests and typechecking, and independently passes hardware traversal at16.67ms p95 with15 admissions. Residency plateaus and DPR2 checks pass. Full UI/scenery acceptance remains separate.

The independent code review found no actionable defects. The integration preserves the shoreline/fog allocation contract and adapts the diagnostic material to the same lifetime. Existing visual output is unchanged; these checks do not close the landscape-quality gap.

Raw measurements and comparison evidence are retained in this folder. The rejected fracture-noise shortcut worsened frame time and is absent from production code.
