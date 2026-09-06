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

## Relaxed hand study

[Hand-curl](hand-curl-close.png) replaces straight fingertips with a curved
resting shape. Its [front](hand-curl-hand-front.png) and
[bent](hand-curl-hand-bent.png) crops are compared with the matching
[prior front](shoulder-blend-hand-front.png) and
[prior bent](shoulder-blend-hand-bent.png). Full sheets have different hashes;
production pose and byte-stable repeat checks pass in its
[capture](hand-curl-capture.json), and the exact candidate bake check passes.

Root and a fresh neutral reviewer favor the curl direction slightly (moderate
confidence): the prior splayed rake-like fingertips become more compact. The
bent hand, however, loses readable finger separation and resembles a flattened
mitten. Both versions have an overly spread straight thumb projecting toward the
torso. The next isolated trial reduces thumb spread. These small raster crops
do not prove finger intersections, joint anatomy or a weapon grip; no hand or
whole-body acceptance is claimed.

[Thumb-relax](thumb-relax-close.png) reduces only the thumb's spread relative to
the curled fingers. Root and a fresh unprimed reviewer prefer its more compact
resting silhouette (moderate confidence), especially in the
[bent crop](thumb-relax-hand-bent.png). The prior sideways spur becomes less
conspicuous. The [front crop](thumb-relax-hand-front.png) still shows a thin
pointed thumb and jagged fingertips; palm/webbing and three-dimensional grip
quality remain unproven. Retain the direction, not hand acceptance. The
[production capture](thumb-relax-capture.json) and exact candidate bake check
pass their pose/repeat/export contracts; initial unaccepted baselines differ.

## Native head detail and lip structure

Target: a relaxed adult mouth should have distinct but integrated upper/lower
lips and a readable closure, without a protruding beak. The new four-bearing
head-detail camera supplements, rather than replaces, both whole-body cameras.
It uses the same frozen production route, neutral pose and daylight; no lighting
or material retune. [Before](head-detail-before.png) captures the thumb-relax
source, with its [report](head-detail-before-capture.json).

Widening the pre-union mouth trough from2 to5mm leaves the
[lower face nearly blank](mouth-form-head-detail.png). Its positive lip bulge
and negative trough share a center, so simply widening the trough also removes
lip volume. A [protected-smoothing trial](mouth-protected-head-detail.png) keeps
that mouth region out of global relaxation, but still does not produce a useful
mouth. The mask was discarded. Moving the same relief
[after body relaxation](mouth-post-head-detail.png) makes a small separation
visible, but does not resolve the form. These are rejected studies, not accepted
baselines; their capture reports and exact source GLBs are retained alongside
the shots under matching experiment names.

[Distinct lip forms](lip-forms-head-detail.png), with separate upper/lower
volumes and a closure line, are genuinely more readable than the blank mouth;
see matched [earlier crop](mouth-form-face-crops.png) and
[lip-form crop](lip-forms-face-crops.png). A fresh unprimed reviewer independently
prefers this structure but rejects its sharp projecting steps and small pursed
center. Root agrees: the profile is too puckered. The eyes, broad wedge nose and
weak ears remain schematic too. The candidate's
[close](lip-forms-close.png), [gameplay](lip-forms-gameplay-pitch.png) and
[capture report](lip-forms-capture.json) preserve pose/repeat checks, but fail
the unaccepted image baselines. The exact candidate bake check passes.

The [softer trial](lip-soft-head-detail.png) reduces projection and broadens
transitions. Its [crop](lip-soft-face-crops.png) has a more restrained profile,
but a second fresh reviewer identifies the loss of mouth separation and corners.
Root agrees: both trials need work. The full head sheet differs by16,512 pixels
from lip-forms (which differs by127,437 from mouth-form); these are real rendered
changes, not quality scores. The [capture](lip-soft-capture.json) and exact bake
check pass their structural/repeat contracts while image baselines remain red.

A [deeper seam](lip-seam-head-detail.png) alone remains too faint. The
[rounded lip trial](lip-rounded-head-detail.png) restores some volume with broad
transitions; its [crop](lip-rounded-face-crops.png) differs from lip-forms by16,297
pixels across the full head sheet, and from mouth-form by124,935. Root and a
fresh unprimed reviewer prefer it over the projecting shelves, with moderate
confidence. Its relaxed profile is less wrong, but mouth separation is still
weak; this is the next working source, not accepted natural facial form.

The [close](lip-rounded-close.png) and
[gameplay](lip-rounded-gameplay-pitch.png) sheets retain the whole-body/deep-bend
views. The [capture report](lip-rounded-capture.json) passes pose, alias and
repeat checks; only the three unaccepted image baselines fail. The exact bake
check passes. Source and generated Blender/GLB/candidate artifacts now agree.
Eye form, nostrils, ear structure and lower-face readability remain unresolved,
alongside the previously recorded body/grip issues. No face/body acceptance or
production promotion follows from these studies.

Source/harness review finds one lip-shape owner after relaxation, before reduction
and export; the discarded protection mask leaves no compatibility mechanism.
The additive head camera preserves both original cameras, poses and exact-repeat
checks. The CLI second-opinion attempt fails before review because the installed
CLI cannot use its configured model. An independent read-only agent reviews the
settled source/harness diff with no actionable defect, while explicitly requiring
the source rebuild before claiming matching artifacts. That rebuild and bake
check now complete for the retained rounded trial.

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
