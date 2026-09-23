# Live geographic lines

The target is continuous, depth-tested roads and faction borders seated on the
same displayed terrain, with wide coastal border tips ending on land. Terrain,
water, lighting and entity art are frozen for this checkpoint.

Existing CPU builders retain connectivity, ribbon shape, color and clearance.
The physical layer replaces geometry when inputs change and samples only affected
presented domains after a terrain admission. Border geometry now has a neutral CPU
owner, shared by both renderer paths. Long border strips are subdivided along and
across their width, then clipped at the existing water classifier before seating.

The sparse attempt left rectangular gaps through mountain relief. Dense sampling
removed these; fresh critique then identified wet coastal tips, leading to the
clipped candidate. The before/after crops and comparison JSON retain the visual
change. Compared with sparse, the final candidate changes3166 Italy pixels and8793
Alpine pixels. Own inspection finds improved continuity and trimmed coastal ends,
without changing road junctions or landform.

This is a live-input and contact checkpoint. It does not complete11: full-region
geometry is still resident, iteration still scans the complete vertex collection
before filtering changed domains, and full hardware/culling/atmosphere acceptance
remains. Regional grouping is the next bounded performance pass; preserve these
same images while reducing that work. Sharp joins remain the existing boundary
style and are visible in close crops.

## Verification scope

The initial merged composition, moving visibility and DPR1/DPR2 tile-anchor
controls remained pixel-identical. Final CPU suite:500 tests across91 files,
including unchanged default raw builder consumers. Both regions show visible
geography and restore exact pixels after input removal/replacement. No GPU/page
errors in the accepted capture run. The final repeat is exact in both regions; final unprimed critique accepts contact
and clipping, with minor existing steep-road widths/crest occlusion. See
[repeat](repeat.json) and [critique](critique-final.md). Independent code review
found no actionable regression and also ran both typechecks plus all500 tests.

New tests cover actual builder clearance on a sloped surface, unchanged distant
uploads, replacement/disposal, border sampling between distant ridge waypoints,
and a diagonal coastline trimming a wide border. Existing test expectations and
baselines are not weakened. The two new regional baselines guard the new route;
older sparse/dense unclipped images are historical review evidence only.
