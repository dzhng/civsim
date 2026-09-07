# Combined worn-garment checkpoint

Retain the supported lining/mail construction as an intermediate, not completed
equipment or anatomy. The target is a naturally hanging, layered heavy soldier
against the supplied Rome II reference. Longer sleeves and a split hanging hem
improve coverage over the prior short shirt; raised shoulders and stiff panels
still need refinement. No production appearance or budget is accepted.

## Composition boundary

The editable root assembly receives only `Tunic`, `Mail shirt` and `Waist belt`
from the isolated garment candidate. The belt changes weights, not shape or UVs.
The other32 modular meshes retain positions, weights, faces and UVs. Root hands,
helmet, body, skeleton and saved actions are retained; the full fitting recipe
is not rerun over unrelated equipment.

Donor Blender SHA256:
`1cdf2ab5515059e6d8e5e0c6393378184213de8a6800ceff5bb16b804046eb7e`.
Combined exported GLB SHA256:
`cd332a02074e31944f46c0b3c2adadbc6e4eace004c339f4b2f230458e9ab35a`.
The cleaned recipe and its semantic regeneration boundary are documented in the
[authoring review](../garment-form/review.md).

[Export controls](integrated/controls.json) compare the combined export against
the retained root, not against the older donor's body. Bind rig and animations
are exact. Six nongarment material primitives retain geometry, normals, UVs,
indices, colors and faction masks. Leather influences change only for the belt;
seven nongarment tangent scalars differ by at most0.000100017. This is not a
byte-identical export claim. The prior and candidate source hashes are in that
report; its first path describes the prior file before installation.

## Production evidence

The unfiltered production `heavy-kit` scene completed1080 checks,150 snapshots,
zero failures and zero page errors. This includes the original static/detail
sheets,53 in-place gait frames in four views, and136 moving-world frames.
[Capture](integrated/capture.json) records the exact run. Newly created image
files are unaccepted candidate evidence, not blessed regression baselines.

The matched neutral-clay control completed152 checks with no failures. It uses
the same combined geometry, rig and actions through the production candidate
loader, with only materials/faction masks neutralized. Its temporary catalog
does not replace the historical surface fixture or create a runtime pathway.
[Clay checks](integrated/clay/checks.json) and the adjacent native sheets record
this boundary.

The [pixel comparison](integrated/pixels.json) uses committed prior root captures,
not stale `diff/*-actual.png` files. Ready changes63,182 pixels, close149,589 and
gameplay-pitch131,945 at identical dimensions. The figures locate real renderer
movement; they do not measure correctness against Rome II.

## Visual verdict and limits

The integrating reviewer inspected all24 material and24 clay garment poses,
whole ready, clay close and gameplay formation, plus run-side travel frames
00/04/08/12. Coverage and waist continuity improve; the shoulders still look
padded, the skirt straight/stiff and the mail rings oversized and regular.
These sampled views do not establish full locomotion quality or continuous
collision clearance.

A fresh unprimed reviewer inspected the reference; matched prior/current ready,
close and gameplay-pitch; current formation and garment poses; clay close and
garment poses; all six magnified crops; and consecutive run-side travel00–07.
It preferred the new garment with high confidence and found no garment defect
blocking intermediate retention. It independently identified stepped shoulder
pieces, a rigid upper-back seam, regular cylindrical skirt and abrupt ring
direction/scale at joins. Formation remained legible but mannequin-like. In its
eight travel frames the garment stayed attached without an obvious large hole;
the skirt looked partly carried by the thighs. Its verdict explicitly excludes
timing, foot contact and between-frame clipping.

Keep shoulder transitions and hanging weight open under09, surface scale under10,
and grounding/rhythm under11. The hand study is separate and is not promoted by
this garment checkpoint. No scope, simulation, save, balance or default gate
changes accompany this assembly.

The delegated integration reviewer additionally inspected every28 walk and25 run
in-place frame in all four views, and all136 travel frames in order at native
scale. No brief garment coverage failure, belt interruption, back spike or
detached shoulder layer was observed. In-place crops covered head through skirt,
not feet; travel crops retained the whole body. Raised shoulders and stiff split
panels remained visible during knee lift. This is complete sampled garment
deformation coverage, not GIF rhythm, foot-contact or continuous collision
acceptance. The integrating reviewer's own coverage remains stated above.

A separate read-only static arm assessment used current material/clay close and
hand-detail sheets plus native deep-bend crops. No gross elbow collapse, detached
wrist or obvious penetration blocked provisional first-pair authoring. Angular
inner elbows, pinched wrists and simplified forearms remain under08. Side hand
tiles are occluded by the body/belt: they cannot establish a two-handed pike grip.
Medium-phalanx must have its own unobstructed contact views and refit obligations.
Starting that editable row does not accept the shared anatomy or current hands.

## Review checkpoint

Source review merged the garment recipe without replacing the newer helmet.
It removed an opaque unused tuple field/alias and gave belt rows one owner shared
by the cinch. The existing belt decision is recorded once in the choices ledger;
lining correspondence is the additional construction decision. No dependency,
renderer, test behavior or new production harness is added. CLI second review
remains unavailable with the installed CLI/model combination; parent source
review and unprimed visual review are the stated fallback, not a CLI pass.

Preview opened the combined ready, clay garment poses and gameplay formation at
09:17UTC for non-blocking human review. No response arrived within five minutes;
the intermediate-retention decision follows the explicit technical and visual
evidence above, not assumed user approval. Only those three documents were
closed at09:22UTC. Strict `heavy-kit.mjs --check`, the complete `bake:test` chain
and `web` typecheck passed after recipe integration.

Duplicate lane crop/animation-sheet derivatives were moved recoverably to
`throwaway/garment-lane-redundant-evidence`; native before/after construction
sheets, controls and review GIFs remain. Integrated captures retain the complete
production sequence. Temporary clay catalogs and first-created unaccepted
baseline files were likewise moved to scratch, not promoted into the harness.
