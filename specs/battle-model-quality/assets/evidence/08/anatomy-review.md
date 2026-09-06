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
