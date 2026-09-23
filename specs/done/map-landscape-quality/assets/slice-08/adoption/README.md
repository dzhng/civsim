# Source shoreline adoption

The production campaign landscape builder now emits the source-conforming mesh.
The worker and diagnostic route use it directly; the route no longer constructs
a second coast field or relief surface. Fixed 2 km relief sampling supplies dry
height at every final vertex. Final albedo and signed shore distance are sampled
at final world coordinates, independent of topology. Wet coverage remains a
separate byte array; packed material channel 9 is binary for this geometry pass.
Depth and animated water response remain slice 09 work.

The coast distance lattice remains world-aligned and shared. Its spacing is the
smaller of 2 km and the source pixel spacing: a new 1 km island regression demonstrated
that the old 2 km lattice could preserve coverage while flattening the island to
water level. This refinement restores dry relief without a second transform.
Campaign territory/road land semantics still include rivers; rendered wet coverage
includes those rivers independently.

The builder accepts a caller's remaining typed generation allowance. Regular XY
lookup storage, coast scratch, counted conforming mesh and final shore array are
included before output allocation. The worker transfers optional triangle ranges
and coverage buffers rather than silently cloning them. Reported generation bytes
exclude shared source snapshots, JS scratch and GPU storage; the terrain owner
separately reserves its actual CPU/GPU/upload peak.

Actual full-source overview measurements rejected 16 km cells at 157,754,065 B of
initial CPU/GPU/staging reservation.32 km cells reserve 128,670,706 B, below the
unchanged 134,217,728 B ceiling, and admit coastal detail. Steady after one detail
is 99,987,678 B. The traversal therefore uses 32 km overview cells. Source shoreline
resolution remains intact; the reduced resolution applies to the broad interior.
The initial reservation leaves only 5.55 MB of headroom, so slice 09's added GPU shore
attribute must be measured before adoption. `allocation.json` includes the earlier
regular-height scratch (subsequently removed); initial GPU/upload and steady
numbers are unchanged. Its deliberate rejection reservation 224,106,786 B is a
negative test, not accepted allocation.

A bank-side regression reproduced wet normals tilted by a dry-side first hit at
coincident XY. Morphing now preserves level water normals and does not import the
opposite coverage side's normal. Relief still morphs to the presented coarse
surface and coverage does not change.

This is functional adoption, not final shoreline visual acceptance. Source-scale
outline steps and remaining angular bank faces remain open. No claim is made that
the whole campaign has switched from the legacy renderer; this builder serves the
new production campaign world and its lab callers during the migration.

## Full working set remains open

Independent Codex review ran 42 focused tests and TypeScript checks, then found
that the real traversal's 24-tile Alps working set fails on its ninth admission.
The initial and one-tile tests above therefore do not establish full traversal
acceptance. A 64 km overview reaches ten tiles before failure, so flattening the
interior further is not a useful correction.

A conservative future shore-attribute probe allocates an extra float on CPU, GPU
and staging in addition to the existing shore source array. At 32 km overview,
six nearest tiles fail on the first Italy replacement; five fail during the
distant stop; four complete Alps→Italy→distant→return at 133,720,778 B peak.
These limits are measurements, not adopted settings: the 24-tile cap remains.
The integrating pass is removing duplicate campaign RGB and unused tint arrays
before remeasuring the full working set. The review finding is open until that
integrated measurement passes. Capturing the diagnostic shoreline alone cannot
close this allocation finding.

CPU validation:493 tests passed in 89 files, and TypeScript checking passed.
A later focused pass after removing discarded regular height/normal/color work
passed 24 tests. The wet-normal and narrow-island regressions were both observed
failing before their fixes. Visual captures and traversal acceptance are separate.
