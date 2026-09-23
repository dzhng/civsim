# Natural elevation composition control

Rejected. The filtered5× DEM with the existing city-clearance policy does not
improve overall natural composition enough for bounded acceptance. Production
terrain, loader, worker and source contracts remain unchanged.

This pass holds the existing ground material, environment, placement seed and
climate/biome fields fixed, and compares accepted procedural terrain with the
same4km-area-filtered2km DEM already archived in
[the elevation investigation](../elevation-control/README.md). There are no new
form algorithms or scale variants. The DEM keeps the0.5 base and5× exaggeration,
then applies the reused city clearance and existing coastal attenuation.

## City policy and scope

The source constructor's exact8km snapped-city mask, chamfer distance and12–34km
clearance calculation is reused. An independent evaluation of the unmodified
constructor block produces bit-identical Float32 outputs across286,254 native
source nodes for varied heights and wet/land flags;14,776 test nodes change.
The lowland floor is2.2. At query time the native-grid keep factors are bilinearly
sampled, and heights above2.2 are tapered toward2.2. Lower heights stay unchanged.
This proves the pre-blur policy step, not equality with the original constructor's
later blur/roughening or final rendered heights. The compressed keep field and
CPU oracle script are retained as diagnostic reproduction inputs.

The temporary lab-route injection uses the actual `CampaignCityLayer`, its
standard authored city model and shared final-surface seating/contact logic.
Model radius is extracted from the production entity-frame function. Real map
nodes yield41 city models in Alps and59 in Italy in both stages. It is a natural
composition diagnostic, not the complete gameplay UI: labels, roads and army
crowds are not claimed covered. The unchanged ecology algorithm admits different
trees as terrain slopes change:2216→2477 in Alps and1110→1318 in Italy. Seed and
source climate are fixed; individual tree membership is not.

## Frames and telemetry

The retained [Alps before](before/alps.png)/[candidate](candidate/alps.png) pair
uses the existing regional center and zoom2.5. The Italy pair also used zoom2.5;
the closer Alps pair used zoom7.5 at the same center/pitch for an approximately
240km-scale supplemental framing. Those redundant rejected-probe images and
all crops were removed during closeout; their metrics and verdicts remain.
The close supplement did not replace the regional controls. Each candidate uses its baseline's exact camera world
and projection matrices; all three deltas are zero. All six captures report no
page or GPU validation errors. Capture snapshots are diagnostic evidence, not
blessed production baselines or strict repeats. The captured mesh remains2km.
Changed pixels are96.43%,59.41%,99.96%; these establish a real change, not quality.
The removed close crops showed the city/tree/terrain junction assessed below.

## Fresh verdict and disposition

[Independent CLI critique](critique.md) prefers before in Alps and Italy with
high confidence, and before in close Alps with moderate confidence. Candidate
adds smaller branches but reduces the regional ranges to a corrugated low belt,
flattens Italy's shore relief and exposes repetitive shelves/trenches up close.
Gentler ground around the close city is only a low-confidence gain; trees hide
the city base so improved contact cannot be established. Both fields retain
material/scenery integration problems against the reference.

Direct inspection agrees with the repeated green crest edging and lost regional
relief. The measured DEM direction has demonstrated geographic branching, but
this combined presentation does not satisfy the natural-view target. No runtime
loader adoption, full-quality claim, city-contact acceptance or additional
parameter sweep follows. A future decision must separate height presentation,
clearance effects and material/planting readability from data topology; this
report does not prescribe another implementation variant.

The capture and apron scripts are scratch reproduction utilities intended to be
staged back in `throwaway/` at their original paths, using the archived DEM inputs
and existing web dependencies. They inject local pre-baked data into the review
browser only; they are not an alternate production terrain backend.
