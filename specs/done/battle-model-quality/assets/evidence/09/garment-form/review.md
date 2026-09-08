# Worn garment construction candidate

This is a construction candidate checkpoint, not accepted09 quality. It compares
a fixed soldier body, rig, clips, materials, daylight and cameras while changing
the lining/mail construction and the explicitly rescoped waist-belt weights. The
target is a covered, layered, gravity-shaped garment that improves the whole
soldier, not merely a close-up detail. Root owns final composition and Preview.

## Decisions and evidence

- Lining and main mail use corresponding subdivided vertices, normals, polygon
  topology and weights. Thickness preserves the indexed outer surface, and the
  full thickened topology is asserted before weights are copied. This replaces
  ambiguous searches between neighboring garment layers.
- Separate set-in sleeves replace the failed welded underarm gusset. Their
  overlap is an actual construction joint, with clavicle/upper-arm skinning;
  torso and vented skirt panels have their own continuous weight fields. This
  is a modeling choice, not evidence of historical tailoring accuracy.
- Longer sleeves and split hanging mail remove the broad cream bands. The
  independent diagnostic13 critic found meaningful individual-soldier coverage
  and silhouette improvement, modest formation improvement, and little change
  in recognition at the higher gameplay camera.
- That critic rejected diagnostic13: visible moving underarm skin wedge,
  detached-looking shoulder caps, jagged neck contours and a left shoulder-blade
  bump. Both versions still looked stiff, with insufficient convincing bunching.
  These are real limitations, not waived because the candidate is less wrong.
- Diagnostic14 limits torso fitting to trunk-supporting body triangles, excluding
  arm-dominated donors. The four folded torso armhole intersections disappeared
  in rest and the four sampled poses; native opposite-contact material crops
  also lost the broad skin wedge. Narrow jagged seams and collar artifacts remain.
- Diagnostic15 interpolates the supporting shirt's smooth normals instead of
  offsetting along discontinuous triangle normals. Clearance is not enlarged.
  The collar and back point remain visible: the lower nearest-distance metric
  did not establish a visual fix. Against14, 14,390 clay-pose pixels changed.
- CPU source picking separates the back point from the collar hypothesis. In
  diagnostic15's rear ready tile, pixel(260,249) hits runtime heavy-mail
  triangle81720 at world(.12545,.09644,1.45333), corresponding to modular main
  shirt triangle3489. Skin is behind at y.05732, lining at y.08715. The same
  region in deep bend at pixel(263,315) hits neighboring main shirt triangle3490.
  These rays use the production chart camera, ready0/bend.5 and the native
  screenshot crop offset(320,96). Local vertex3304 is displaced forward/down,
  with strongly discontinuous adjacent face normals. Main body-fit normal
  interpolation removes that displacement and diagnostic16 removes the visible
  point. No point-specific smoothing was applied. An initial unnecessary sleeve
  interpolation failed the tangent gate; restricting the correction to the torso
  retained the existing sleeve fitting and passed strict export.
- A new unprimed diagnostic16 review again preferred the longer coverage, but
  rejected the segmented shoulder/collar joins and newly identified a belt
  interruption during running. Root inspected all 24 material and all 24 clay
  views plus ready and key native crops and agreed; this was not a motion-rhythm
  acceptance. The shoulder construction required a further revision.
- The belt issue justified an explicit scope extension to belt weights, not belt
  geometry. The old belt copied roughly73–77% thigh influence at the side waist,
  despite sitting entirely on the pelvis bone's span. Copying that bad field to
  the shirt was discarded before capture. Instead the belt binds to the pelvis,
  and a local garment cinch band shares that support, fading into the existing
  torso/skirt fields. Diagnostic17 restores the visible running belt boundary;
  inspected scabbard joins still meet the belt. Root independently compared all
  four opposite-run views in clay/material against16 and agreed. Final complete
  animation review follows below.
- Diagnostic18 broadens the supported mail reinforcement across the sleeve
  attachment. A fresh unprimed critic inspected the reference, whole soldiers,
  all material/clay loaded views and key paired crops. It preferred B by a
  meaningful whole-soldier margin: longer sleeves, fuller torso and split skirt
  read substantial mail rather than a short shirt. It found no unequivocal
  integration-blocking hole, exposed body clip or detached layer in those views.
  Rounded shoulder caps and abrupt layer corners still look assembled; the run
  skirt remains flat/stiff, and the frozen ring pattern remains large and regular.
  These are retained refinements, not claims of finished armor realism.

## Verification boundaries

Before the intentional waist extension, the source probe preserved all 33
non-garment mesh hashes. It now preserves the other32, bind bones and action
curves, with belt weights the sole declared exception. All160 belt positions,
polygon indices and UVs match exactly (geometry hash
`2a5195f5145f216282ef6c1811c00596edd00eb64cdf386d3cd6a351ee5a3a49`).
All three final exported tiers have finite, nonnegative four-slot weights, with
maximum normalization error 1.379e-7. These checks do not establish physical
clearance or visual quality.
The dense source sample covers 62 poses, not a continuous collision proof.

The final unfiltered capture uses the existing production candidate-sheet and
snapshot checks. Heavy completed645 checks with12 expected old, unaccepted image
differences; static matched clay completed42 with7 image differences. Loaded
clay completed102 with no behavior/repeat error, but its custom unfiltered
snapshot key was new: this is not a historical-baseline pass. All fresh frozen
repeats passed. Final ready, material loaded and clay loaded PNGs are byte-exact
to the images inspected by the diagnostic18 critic. No baseline or art budget
has been accepted. Diagnostic9 may have overlapped another GPU job and is only
framing/geometry evidence; later diagnostics and the full capture were explicitly
serialized.

The author inspected all28 walk and25 run frames in order, each in four native
640px views. No new brief flank gap, belt interruption, back spike or detached
shoulder layer was seen. Sleeve and waist boundaries stay continuous; vented
panels move continuously but remain stiff, especially with the raised run knee.
Whole formation sheets at both camera pitches retain the larger mail silhouette,
without a new obvious exposed gap. This is sampled garment-deformation evidence,
not locomotion-rhythm, continuous collision or world-travel acceptance. The
[walk](review/walk-slow-review.gif) and [run](review/run-slow-review.gif) GIFs are
slowed review artifacts; root owns integrated playback and Preview.

The final source review removed an unused tuple field/alias, named the retained
garment surface fields and gave belt section rows one owner shared by the cinch.
Regeneration preserved all geometry, normals, UVs, indices, colors, masks and
weights, and all non-mesh JSON exactly. Twelve tangent scalars per tier differed
by at most0.000100017 from export rounding. Therefore the exact captured18 assets
were restored and retained; cleanup is not claimed to regenerate a byte-identical
GLB. [Source controls](source-controls.json) preserve the initial/final source
hashes, unchanged-part hashes, separate belt geometry control and those scalars.
Root composition must transplant only Tunic, Mail shirt and Waist belt into its
newer source, preserving its hands, helmet, body and actions rather than rerunning
an unrelated full fit. Historical surface fixtures were restored after matched
clay capture; no new production harness or renderer path is part of this pass.

Local CLI review was unavailable because its version did not support the active
model. Parent/independent source review is the fallback, not a claimed CLI pass.
