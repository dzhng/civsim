# Heavy infantry equipment fitting — incomplete candidate

Target: recognizable heavy infantry from the supplied Rome II reference through
rounded helmet/shield and layered garments, with physically connected equipment.
Neutral clay deliberately excludes mail texture/material judgment. The anatomy,
skeleton and bend clip remain the provisional08 source; none is accepted here.

## Evidence and verdict

The first locally authored kit is in [close](heavy-first-close.png),
[gameplay](heavy-first-gameplay.png) and [head](heavy-first-head.png) sheets.
The [controlled comparison](heavy-first-comparison.json) excludes captions and
compares the same neutral four-view region to the rounded-lip unclothed candidate:
294,073 of1,382,400 pixels changed. This proves equipment reached the production
route, not that the equipment is good. The reference is an unmatched photographic
target; pixel similarity to it is not a quality metric.

First unprimed critique found open tube-like shoulder cuffs, rigid flange-like
skirts, unresolved scabbard suspension and an open sword grip. The helmet and
shield were recognizable curved forms. A bounded fitting revision buried sleeve
roots inside the torso and removed the oversized overlap cuffs. See the current
[close](heavy-fitted-close.png), [gameplay](heavy-fitted-gameplay.png),
[head](heavy-fitted-head.png) and [upper crop](heavy-fitted-upper.png).

**Verdict: the revised shoulder silhouette is less wrong, but the complete kit
fails geometry/attachment acceptance. Retain as editable working source only.**
No first-pair row or slice is complete, no active baselines are blessed, and no
phalanx or material work follows this failed row yet.

Final fresh critique/source review identified these next-pass defects:

- Chest-to-sleeve transitions still expose scalloped shoulder patches; use a
  continuous garment construction rather than intersecting capped volumes.
- Skirt layers read as thick rigid rings, with wavy rear hem and strong diagonal
  folds under bend. Garment articulation is not established by copied weights.
- Shield handgrip is physically disconnected: board back is at y=-.120m while
  the forwardmost grip surface is y=-.052m, leaving6.8cm without supports.
  Both follow the same hand bone, so the gap persists in motion.
- Sword fingers do not enclose the handle. This is an08 grip requirement exposed
  by09 equipment; attachment proximity does not satisfy contact.
- Helmet bowl/rim has a visible center-front notch/intersection.
- Scabbard lacks readable belt suspension. Footwear is a closed upper silhouette,
  not credible sandal straps. Shield orientation under the inherited bend is not
  an accepted combat pose.

These are high-confidence failures except scabbard readability/footwear styling
and possible bent-leg overlap, which need their own focused inspections. The
shared body remains separately reviewable; dressing it does not accept anatomy.

## Technical boundary

The source script appends the committed08 authoring scene, keeps equipment as
separate editable objects, and joins only export copies. Shared anatomy owns
the rig, weights and bend action. Garments initially copy nearest-body weights;
rigid equipment follows named existing bones. The shared exporter owns glTF
settings; only destination/name are parameterized. Export copies are triangulated
because Blender cannot produce tangents for the loft end-cap ngons.

The candidate bake uses the normal appearance contract with identical inspection
tiers, no presentation mapping and only appearance0. It never replaces the
production catalog. Identical tiers and the provisional triangle count are not
an LOD/budget admission.

The [first report](heavy-first-capture.json) passed all rendering/repeat checks
while creating initial unaccepted images. The [revised report](heavy-fitted-capture.json)
fails exactly the three changed image comparisons; weighted submission and fresh
frozen repeats pass. [Anatomy recapture](anatomy-regression.json) retains the
original scene's checks, including both class aliases. Typecheck and both candidate
bake `--check` commands pass. CLI review was attempted but rejected the configured
model as unsupported by the installed CLI; it did not pass. Independent source
review supplied the shield-gap finding above.

Source-shape review kept one shared candidate sheet helper and thin named scene
registrations, avoiding duplicated cameras/capture assertions. No runtime shader,
simulation, save, lighting or production catalog code changed.

The final [shared-helper recapture](shared-helper-regression.json) runs both
named scenes after extraction:89 of92 checks pass; only the same three heavy
image comparisons fail. All three anatomy images are byte-identical to the
committed08 rounded-lip evidence, and the heavy close capture is byte-identical
to the reviewed fitted candidate. No tolerance or baseline was changed.

Changed-test behavior: the anatomy scene keeps its original camera, pose,
weighted-submission, exact-repeat and alias-selection checks, now in one private
helper. The new heavy scene exercises the same checks for appearance0 without
inventing a second identical class alias. These are candidate inspection gates,
not acceptance of cloth deformation or grip contact.

## Merged verification

Root integration f5a57d1b runs both bake `--check` commands, typecheck and the
combined named scenes on port5174. [Merged report](merged-capture.json):89/92
checks pass. Here the three failures are the older unaccepted *anatomy* baseline
comparisons; the new heavy baselines were initially created, not accepted.
Direct byte comparison confirms all three actual anatomy sheets equal the
committed rounded-lip evidence and all three heavy sheets equal the reviewed
fitted evidence. The different local baseline history explains the different
failure names; no image or tolerance was blessed. Root inspected all heavy views.

The curated heavy close/upper/reference set was opened in one Preview window for
non-blocking feedback. The working decision remains incomplete geometry, with
continuous garments and weapon contact next; no silence can waive those defects.
