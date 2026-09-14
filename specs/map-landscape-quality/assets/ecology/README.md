# Battle ecology eligibility

[The spatial control](irregular-forest.svg) plots tree roots over the same U-shaped
physical forest mask. Green cells are forest; red dots are trees outside it.
Both sides call the production placement function with the same input and seed.
The control uses commit `503be00e`; [measured counts](placement-control.json)
record 139 outside trees before and none after, with 240 total on each side.
This is spatial evidence, not a substitute for final forest appearance review.

The extracted feature retains source cells because its centroid and equal-area
radius cannot reconstruct holes or long arms. The world lattice belongs to the
shared CPU terrain owner; forest membership, species, slope eligibility and the
per-forest count cap remain battle policy. Candidate identity depends on world
coordinates and seed, never the current feature list order or window origin.
Explicitly authored features without source cells continue to mean a disc.

The shared normal sampler must divide by actual sample separation at boundaries.
Clamping the sample positions while dividing by a full central interval halves
edge slopes. Both tree and existing grass eligibility need the same correction;
there is no private tree gradient implementation.

## Change ledger

Seven new CPU cases pin concave membership and long-arm coverage; water/road/wall/
clearing exclusion; local steep-slope exclusion; deterministic identity under
feature reordering; authored discs; overlapping scatter windows; and planar
boundary normals. The original placement fails the first four placement cases.
The new sampler corrects steep-edge grass eligibility as well; existing grass
and terrain feature suites remain green. No existing assertions were weakened.

Full CPU verification: 434 tests across 76 files, typecheck and production build.
Independent code review found no actionable defects. Whole slice 07 remains
pending for campaign distribution, regional scale and final composed visuals.


The existing hardware-requested Chrome `battle-seating` run passes every physical
seating and visible-soldier check across all three maps (15,560 soldiers each),
with no page errors. Its three exact snapshot comparisons fail against the
committed baselines, last changed in `42051695`; no PNG was repinned. The
[run ledger](seating-run.json) records exact counts and baseline provenance.
There was no same-hardware pristine seating control, so those differences are
not claimed as ecology regressions or as proved pre-existing failures. Final
composed visual acceptance remains pending with the rest of slice 07.

Merged checkpoint at the current shared terrain/crown owner: all461 tests across81 files and TypeScript pass. A second independent Codex review found no actionable defects. Physical seating evidence remains the earlier hardware run above; final composed visual acceptance is still unverified and no battle baseline is repinned.
