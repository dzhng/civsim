# City and geographic composition with accepted water

The merged city pass preserves its geometry and interactions. Disabling only the
source-shore water response reproduces all four city snapshots exactly on their
hardware backend and both geographic snapshots exactly on their original software
backend. All input replacement, picking, fog, removal and reinsertion checks pass.
Merged CPU verification passes 505 tests and typechecking.

The first geographic comparison used hardware against software baselines; it
produced widespread tiny precision differences (RGBA mean absolute difference
0.114 Italy / 0.225 Alps) even with old water. The matched software control resolves
that ambiguity at zero differing pixels. Backend mismatch is not an accepted
regression or a reason to relax thresholds.

Fresh independent full-frame and 2× crop comparison accepts the merged water as
less wrong, with no new city, road or border occlusion. Deep water and turquoise
shallows improve separation. Existing Attalea wall/coast overlap and angular
close shorelines remain; this integration does not claim complete landscape art.

Change ledger: the three real-city and two geography baselines adopt the already
accepted source-shore response. The synthetic city fixture remains exact. No
snapshot threshold changes. Candidate and matched-control reports are preserved
here; strict repeats pass with zero differing pixels on each baseline's original backend.
