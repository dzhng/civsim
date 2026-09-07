# Open helmet refit to the integrated head

Candidate-only 09 fitting pass on base `53d5c746`. Anatomy 08, provisional 07
budgets and the overall heavy soldier are not accepted by this checkpoint.
The parent integration lane owns the latest mail composition and human Preview
checkpoint. These matched images keep the base revision's mail unchanged.

## Source diagnosis and change

The old bowl was a closed loft: all 388 bowl/body triangle pairs came from its
horizontal bottom disk at z1.680. Both curved cheek surfaces also genuinely
entered the head (214 left / 220 right pairs); these were not cap artifacts.
The old rim hid the eyes and the guards read as partly buried leaves in profile.

Only `blender-heavy-kit.py` helmet construction changes. The bowl is now a
subdivided, physically thick shell with an open underside, a crown-only cap and
an annular rim. Its rim is 15mm higher and crown approximately 29mm lower; its
width/depth follow the fixed new head. Guards move forward/outward and extend
under the rim. Source fitting projects any too-close outer vertices to 6mm from
the head for the bowl and 3mm for the guards before the existing 3mm solidify
step: nominal inner clearances are 3mm for the bowl and 1.5mm for centered-thickness
guards. This is a geometric padding
allowance, not a new runtime collision or renderer mechanism.

The first overly dense crown trial failed the existing tangent-frame bake gate.
It was rejected; 32 circumferential control segments and one subdivision level
produce a tangent-safe shell. The final helmet grows from 2,908 to 6,144 triangles;
the complete candidate has 88,888 triangles in each identical provisional tier.
No tier/budget admission is implied.

## Controlled evidence

[Before source probe](before-fit.json) and [candidate probe](after-fit.json)
evaluate all 448 quarter-frame samples across ready, walk, run and bend. Candidate
helmet/body triangle intersections are zero in every sample; rigid head weights
sum exactly to 1. A center upward ray now reaches the inner crown at z1.793668,
instead of the old disk at z1.680. This demonstrates an actual central opening,
not filtered or hidden collision results. Minimum signed vertex clearances are
2.985mm bowl, 1.453mm left guard and 1.434mm right guard, so zero triangle
crossings do not conceal fully embedded components.

Every non-helmet editable mesh has identical position, normal, topology, weight
and material-name hashes, including the body and all garment/scabbard/footwear
objects. Exported skeleton, animation, material and appearance JSON are byte
identical to a rebake of the saved pre-helmet source. No head, motion, material,
renderer or production catalog source changes occur. Existing cameras remain
unchanged; the final capture inherits the parent's additional formation fixture.

The saved baseline is the parent's rebuilt heavy `.blend` with integrated head,
not the tracked heavy artifact that still preceded that rebuild. It was exported
with the same anatomy exporter and baked with the same appearance options.
Source GLB SHA-256 is
`e6c5e6a5694d33861212b9d47f60f34549c4a52e2ab622b23b839fbe4d742da6`;
the matched before export is
`b0486264635eabdea0628d1b816860f44ba321df4af8700220710925767648e9`.
The existing `heavy-kit` scene supplies every full production capture. Initial
run 10055 generated unaccepted worktree sheets, not blessed baselines. Subsequent
before and final runs compare against those first-trial sheets, so changed image
failures are expected; repeated frozen crops and production pose submission remain
the technical controls.
The rebaked before head sheet is also byte-identical to the parent's independently
archived run 55291 head sheet.

Attachment diagnosis used a bounded scratch call to the existing candidate-sheet
helper with its unchanged default cameras plus ready. Run 6140 passes all
57 production/frozen-repeat checks ([diagnostic record](diagnostic-checks.json)).
It is a diagnostic, not a substitute for the final full scene. Permanent scene
coverage was never reduced.

The final capture inherits exactly the two fixture files from parent commit
`a537d378`, adding 16-soldier formation and gameplay-formation views for ready,
walk and run. The parent independently verified that this extension leaves all
original static and 53 gait-frame images unchanged. These additional formation
images are supplemental context, not a matched old-mail before/after comparison
or budget admission. Their shared fixture diff already exists in the root lane.

Final full run **9875** records **638 passing checks and eight expected image
comparison failures** against the first unaccepted trial. All production pose
submissions, repeated frozen crops and page-error checks pass, including both
formation sheets. The final head, close, gameplay-pitch and ready PNGs are
byte-identical to diagnostic 6140, so the final independent image verdict applies
to these full-run images. No baseline is blessed; generated harness sheets move
to scratch after the durable evidence is archived.

Command from the worktree root (Vite serves 5197):
`VERIFY_GPU=1 VERIFY_URL=http://127.0.0.1:5197 SCENARIO_REPORT_JSON=../specs/battle-model-quality/assets/evidence/09/helmet-refit/capture.json node web/scene.mjs heavy-kit`.
Reports: [candidate](capture.json), [before](before/capture.json).

The [pixel controls](pixel-controls.json) record native raw-RGBA changed pixels
for head-detail, close, gameplay-pitch and ready; hand-detail remains identical.
Review surfaces are [head](head-detail.png), [2x crops](head-crops-2x.png),
[neutral/bent kit](close.png), [gameplay pitch](gameplay-pitch.png) and
[ready](ready.png), with matched images in `before/`.

## Reviews and limits

Independent source review found no actionable defect. It checked outward bowl
winding, upward crown cap, open underside, fit-before-thickness order, retained
rigid head binding and non-helmet controls. The triangle increase remains a
provisional budget cost. The required CLI review could not execute because its
configured model requires a newer CLI; [log](codex-review.log) records that
failure. No reset, installation or model change was attempted. The independent
read-only collaboration review is the explicit fallback, not a claimed CLI pass.

The first fresh visual critique strongly preferred the lower crown and open eye
region, but identified triangular temple gaps and guards weakly attached at their
upper corners. Inspection confirmed them. A bounded follow-up seats the upper
guard ends under the bowl and reduces their stand-off. The initially raised flat
ends then crossed the rounded rim; wrapping them to the oval and lowering their
ends beneath the lip removes the inappropriate flat-tab construction. Rejected
[gap](rejected-gap-crops-2x.png) and [exposed-tip](rejected-tip-crops-2x.png) crops
retain the reasons for those iterations.

Final unprimed review (`helmet_formation_fresh_review`, orchestrated by the parent)
prefers the after image with high confidence: shorter dome, exposed eye region,
and curved guards rather than pointed hanging slivers. It found no clear skin
penetration, floating attachment or layering failure. Sharp guard outlines and a
thin rear strip still look slightly appliquéd (moderate-confidence polish concern,
not demonstrated geometry failure). Full-body and gameplay views show no new
defect but cannot prove fine attachment. Retain this bounded fitting improvement;
do not interpret that verdict as overall art acceptance. The faint clay eyes
remain an unchanged 08 anatomy/surface limitation.

That reviewer also independently reread the final source and found no concrete
defect: open underside/capped crown, fit after subdivision before thickness and
valid square-root domain. Vertex/local-face-normal fitting does not prove
continuous shell clearance or physical guard-to-bowl contact. The sampled source
checks and images reveal no corresponding failure; this limitation remains
explicit rather than being converted into a continuous-fit guarantee.

The fit allowance, lower crown and raised rim are reversible source-authoring
choices within the delegated helmet refit. They do not establish a general
equipment-clearance policy or alter frozen anatomy. No architecture decision,
test behavior, simulation behavior or quality threshold changes. Skills directed
matched production evidence, a fresh visual review and the source-control audit.
