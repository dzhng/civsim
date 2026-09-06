# Anatomy candidate review

Target: a naturally proportioned adult body with continuous anatomical landmarks
and credible joints under bending. Armor and material polish must not conceal
silhouette defects. The supplied Rome II reference establishes the intended human
read; the untextured study isolates shape, not its final surface finish.

## Current verdict: not accepted

The `human-anatomy` production scene fixes1280×800, SwiftShader, lighting, camera,
crop and pose. Each tile is rendered twice and checked byte-for-byte. The
[contours capture](contours-capture.json) passes those behavior/repeat checks but
fails both old, unaccepted image baselines as expected after shape changes. No
baseline was blessed to hide the difference. See [close](contours-close.png),
[gameplay pitch](contours-gameplay-pitch.png), [upper body](contours-upper-body.png)
and [bent joints](contours-bend-side.png). Its exact source is
[retained here](contours-source.glb).

Fresh unprimed review found these high-confidence shape defects, corroborated by
the implementer's inspection:

- Sloping shoulder humps and weak armpit/deltoid transitions.
- Smooth hourglass torso with insufficient ribcage/pelvis landmarks.
- Rounded tube-like bent knees; soft elbows lacking a convincing joint contour.
- Slipper-like feet without enough heel, instep and forefoot distinction.

Hands remain a medium-confidence crop-level concern: broad palms ending abruptly
in thin parallel fingers. The lighting influences shading, but does not explain
away the silhouette findings. Bright dotted leg edges were not diagnosed as open
geometry from pixels alone. The source's manifold check remains a separate proof.

Earlier [initial](initial-close.png) and [reduced](reduced-close.png) studies show
the face and separated fingers becoming more readable. The intermediate
[refined](refined-close.png) study lost hand shape during remeshing and was
rejected. These are iteration evidence, not approved models.

The next foot-silhouette candidate replaces the vertically layered oval foot
with heel-to-toe sections describing heel, instep, forefoot and toe taper.
Its [full sheet](foot-profile-close.png), [focused feet](foot-profile-feet.png)
and [capture report](foot-profile-capture.json) retain the same fixture settings.
Root inspection finds a more readable heel and lower forefoot than the prior
[oval feet](contours-feet.png). Byte comparison confirms a changed production
capture. A fresh unprimed comparison agrees with high confidence: the longer
forefoot, thinner toe end, descending instep and distinguishable heel are less
wrong than the prior oval pads. Remaining findings are a smooth wedge-like toe,
swollen bent heel/ankle transition, and small rear-view angular projections to
inspect. Arch/sole detail is inconclusive at this lighting/framing. Retain this
direction for further sculpting, but this is not final anatomy acceptance. The
source weight checks and isolated-action export pass its clean build. Shoulder, pelvis,
elbow and knee work remains open afterward.07 still gates accepted topology.

The [first patella study](patella-close.png) and [bend crop](patella-bend-side.png)
add recognizable knee structure. A fresh neutral comparison favors it slightly
over the tube-like knee, but flags a sharp anterior corner/notch and a conspicuous
neutral-pose knob. The [softened study](patella-soft-close.png) and
[bend crop](patella-soft-bend-side.png) reduce that projection. Root inspected
the full sheet and crop. A fresh unprimed comparison favors the softened version
with moderate-high confidence: it removes the tacked-on ledge and neutral-pose
knob, but the bent knee remains broadly rounded with weak kneecap/upper-shin
distinction. Retain this better iteration without accepting the whole anatomy.
Both captured versions retain exact source/evidence here. The candidate baker's
exact-output check passes; no accepted snapshot was re-blessed.

The [torso relief experiment](torso-close.png) and [upper-body crop](torso-upper-body.png)
are rejected. Root and a fresh unprimed reviewer see an elongated sternum diamond
and artificial triangular chest/back shading rather than broad anatomical forms.
The prior surface is underdescribed but less wrong. The next trial reduces
sternum/spine grooves and chest/scapula relief; all lighting remains fixed. This
trial was captured as the [softened torso](torso-soft-close.png), with its
[upper-body crop](torso-soft-upper-body.png), [report](torso-soft-capture.json)
and [exact source](torso-soft-source.glb). Its frozen repeat and production-pose
checks pass; the two unaccepted initial snapshots differ, as expected. Root and
a fresh unprimed reviewer still reject the plate-like chest band and bright
geometric central patch. The prior patella-soft surface is slightly less wrong
(moderate confidence), although both retain inflated shoulder caps and abrupt
shoulder/chest grooves. The next candidate removes the raised relief and instead
broadens the anterior ribcage into the arm root. No anatomy baseline is accepted.

The [ribcage-root trial](chest-root-close.png) removes the central plate, but root
inspection of its [crop](chest-root-upper-body.png) still finds an oval thorax
separated from shallow arm roots. Its [capture](chest-root-capture.json) retains
the deterministic pose checks; [source](chest-root-source.glb) is archived.
Increasing the arm-root depth then produces more conspicuous shoulder ledges in
the [shoulder-cap trial](shoulder-cap-close.png) and
[crop](shoulder-cap-upper-body.png). This is rejected, not accepted as extra
anatomical detail. Its [report](shoulder-cap-capture.json) and
[source](shoulder-cap-source.glb) preserve the failed experiment. Source review
identifies a potentially exposed oblique loft end-cap; the next controlled study
first isolates the separate clavicular volume, then tests burying the arm's
closed start ring inside the thorax. Neither trial changes the rig or lighting.

Removing only the collarbone volume leaves the ledge in
[shoulder-union](shoulder-union-close.png). Extending the arm root medially in
[buried-root](buried-root-close.png) also leaves excessive shoulder bulk.
Reducing that bulk in [shoulder-taper](shoulder-taper-close.png) does not solve
the join: a fresh unprimed comparison favors the earlier patella-soft version
with high confidence. The tapered trial has a horizontal shelf, dark socket and
side-view bright attachment rim, visible even in the full sheet. Root agrees;
do not keep the missing collarbone bridge or enlarged cap as an improvement.
The next controlled candidate restores the prior shoulder volumes while keeping
only the buried starting ring. Each experiment retains its named capture report,
source GLB and detail crops here. No snapshot has been re-blessed.

The restored volumes with a buried root are captured in
[root-continuity](root-continuity-close.png). Widening only the shoulder-local
smoothing region then produces [shoulder-blend](shoulder-blend-close.png), its
[upper-body crop](shoulder-blend-upper-body.png) and
[gameplay sheet](shoulder-blend-gameplay-pitch.png). The
[capture report](shoulder-blend-capture.json) passes production-pose, shared-body
selection and exact frozen-repeat checks; the candidate baker's exact-output
check also passes. Initial unaccepted image baselines still differ.

Root and a fresh unprimed reviewer favor shoulder-blend slightly over
patella-soft, with moderate confidence: the chest/deltoid notch and bright ridge
soften without inflating the outer silhouette. Retain this direction, not final
anatomy acceptance. Long diagonal hollows, elongated deltoids and weak pectoral
structure remain. The side bend crop excludes the shoulder and cannot establish
shoulder deformation; current bend poses primarily exercise elbows and knees.
No new obvious elbow/knee defect is visible. All rejected chest/cap machinery
has been removed from the authoring source; only the buried ring and broader
local blend remain from this pass.
The [artifact hashes](artifact-hashes.json) identify retained source GLBs and
capture bytes; they certify provenance, not visual quality.

## Source/export correctness

Applying Blender's smoothing modifier invalidated a retained vertex-group
reference; reacquiring the owned group by name allows the contours build to
finish. The completed capture above proves that correction reaches the browser.

Source review also found that Blender's single-armature action option scans all
open-file actions, despite active-scene/selection filtering. The authoring source
now disables that option and rejects a pre-existing unrelated `bend` action name
before creating the candidate scene. Existing scenes are never deleted or renamed.
The exporter otherwise invents a neutral joint for unweighted vertices, so source
deform weights are explicitly checked before export. Those checks pass the
foot-profile clean-background build; exported normalization alone is not proof
of successful heat binding. A separate Blender run containing a foreign rig and
bone action also [passes](export-isolation.log): the GLB contains only `bend`, no
foreign rig node, and the original scene objects/transforms and assigned action
are unchanged. Its GLB is byte-identical to the clean-background output.
