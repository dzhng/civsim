# Garment construction studies

Target: a mail shirt over a thinner tunic, with continuous shoulders and readable
open cuffs and hanging hems. Neutral clay isolates shape; color and mail rings
cannot compensate for padded or disconnected geometry.

## Filled-volume studies: rejected

The [union](garment-union-close.png) and [rounded union](garment-rounded-close.png)
studies join closed torso/sleeve volumes. The rounded version adds subdivision
before joining and raises the shoulder coverage. Both retain the original body,
rig, equipment, camera and production material/environment. Their GLBs and
capture reports are archived alongside these images.

[Exact pixel comparison](garment-comparison.json) against the fitted candidate
shows 193,617 changed close-view pixels and 167,490 changed gameplay pixels for
the rounded study. This establishes visible change, not improvement.

Main inspection and independent unprimed review agree: smoother connections do
not fix the construction. The rounded study has a padded cylindrical skirt,
bulbous sleeve segments and thick horizontal tiers. The earlier fitted version's
slight hem flare is more plausible. Neither is accepted, and the rounded study
is not retained as an overall improvement. Gameplay framing still reads as
rounded primitives rather than layered clothing.

The next source trial uses a connected surface with sleeve openings sewn into
the torso, then adds thin physical thickness. This replaces the filled-volume
construction rather than adding more smoothing. It must still pass actual
body-clearance, deformation and silhouette review; changing topology alone is
not evidence of quality.

## Connected open surface: working direction retained

The [current close sheet](garment-ordered-close.png),
[gameplay sheet](garment-ordered-gameplay.png), [head detail](garment-ordered-head.png)
and [3× nearest-neighbor torso crop](garment-ordered-garment-crop.png) show the
connected garment. The crop is x235,y145,190×230 in the close sheet; it supplements
the full framing. Against the earlier fitted kit, 135,756 close pixels and
116,039 gameplay pixels change at identical settings.

Independent source review caught non-monotonic projected sleeve angles in the
first sewn trial: two cuff edges reversed direction and folded the surface.
The current construction advances uniformly around each cuff in torso-boundary
order. The reviewer confirmed positive30° traversal, including closure, on both
sides. No smoothing or normal recalculation is used to conceal the reversed loop.

The final fresh visual review and main inspection retain this as the less-wrong
**working direction only**. It reads as one shirt rather than separate shoulder
caps. Still failing: inflated shoulder slope, geometric stacked hems, rigid cuff
steps, overly circular collar and inadequate garment response under deep bend.
Helmet/cheek fit and hand/weapon contact remain separate unresolved gear defects.
Nearest-body-vertex weights remain provisional, not proof of armpit deformation.

The [capture report](garment-ordered-capture.json) passes weighted submission,
fresh frozen repeat and page-error checks; its three unaccepted baseline image
comparisons fail intentionally and remain red. The exact candidate bake check
passes. The candidate has38,292 triangles, including inner garment surfaces;
this is source-shape evidence, not a measured budget or accepted LOD. Source and
export hashes are in [artifact hashes](artifact-hashes.json).

Source review keeps garment construction in the kit authoring script and uses
the existing weight/export owners. No runtime, schema, shader, dependency or
simulation change is introduced. The CLI review attempt failed because its
configured model requires a newer CLI; independent source review supplied the
loop-order correction instead. No CLI pass is claimed. The final source cleanup
removes six unused armhole vertices per garment. Its exported bytes changed;
the [fresh recapture](garment-clean-capture.json) proves all three actual sheets
are byte-identical to the reviewed ordered candidate. No image was re-blessed.

Choice audit: mesh topology and sculpting are delegated by09. This pass chooses
a connected thin surface instead of joined solids, with no new persistent
contract or runtime owner. Existing provisional garment-weight and candidate-only
decisions remain unchanged. The source-only geometry diff is73 added/17 deleted
lines; generated assets and review evidence account for the remaining paths.
