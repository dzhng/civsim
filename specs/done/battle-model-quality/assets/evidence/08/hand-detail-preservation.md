# Preserve authored hand detail — provisional candidate

## Controlled diagnosis

The saved high-resolution sculpt from `b2102c54` was exported in an isolated
Blender session, with nearest-deform weights only for the diagnostic skin. It
used the existing exporter, candidate baker and production sheet helper with
the same neutral material, camera, caption and environment. The sculpt has
170,796 vertices/341,588 triangles versus 4,502 vertices/9,000 triangles in the
reduced candidate. This is a neutral-shape diagnostic, not a performance asset
or independent deformation-quality proof.

The [high-resolution sheet](grip-highres-hand-detail.png) and
[crop](grip-highres-front-crop.png) still have pointed curled tips. Thus reduction
alone does not create that defect. Rear knuckle separation is clearer than in
the [reduced curl](grip-curl-hand-detail.png), so reduction also loses detail.

The next controlled trial excluded distal hands from whole-body relaxation,
feathered from the wrist while leaving finger curves, voxel size and reduction
unchanged. Its [sheet](grip-unrelaxed-hand-detail.png) and
[crop](grip-unrelaxed-front-crop.png) show fuller, blunter fingertips. Independent
three-way review preferred that direction, while retaining U-shaped-prong,
large-palm and weak-thumb-opposition failures.

Finally, the reduced copy marks distal-hand vertices as zero-weight in Blender's
Decimate group, and adds incident hand faces to the provisional body allowance.
The resulting [sheet](grip-preserved-hand-detail.png),
[crop](grip-preserved-front-crop.png), [close](grip-preserved-close.png),
[gameplay](grip-preserved-gameplay.png) and [head](grip-preserved-head.png) are the
current working candidate. The output has **20,504 triangles per tier**, with
26 bones. This is not a measured runtime envelope or a shipping LOD.
The [comparison telemetry and source hashes](hand-detail-evidence.json) pin the
native front crop and each candidate; pixel differences locate change, not quality.

Blender's [collapse implementation](https://raw.githubusercontent.com/blender/blender/main/source/blender/bmesh/tools/bmesh_decimate_collapse.cc)
excludes edges incident to zero-weight vertices; the installed Blender run
successfully used that configuration. Exact one-for-one retention of all protected
vertices was not separately measured. The allowance is approximate: global
decimation can still alter non-hand topology, which is why whole-body/head
captures accompany hand detail.

## Final independent verdict

**Retain as a slightly less-wrong working candidate, moderate confidence.**
Fuller fingertip pads and readable curled digits improve on the masked 9k mesh,
but the gain is modest and costs substantially more geometry. It does not accept
anatomy, equipment contact, LOD, performance, or the full feature.

Remaining failures: parallel U-shaped fingers with regular spacing and abrupt
palm transitions; a long smooth thumb; small bright/angular features at finger
roots and thumb inner edge; coarse shoulder/clavicle form. The side hand tile is
body-occluded and supplies no profile evidence. Neither a nominal cylinder nor
bare-hand curvature proves contact with a real sword or shield.

Independent source review found no bone, animation or weight-contract regression.
The temporary relaxation/reduction groups are removed before automatic armature
weighting. Manifold, finite, normalized, at-most-four-influence checks remain.
The exact candidate bake check passes. The [highres diagnostic report](grip-highres-capture.json)
passes while creating unaccepted diagnostic images; the [relaxation report](grip-unrelaxed-capture.json)
and [preserved report](grip-preserved-capture.json) fail only their four changed
unaccepted snapshots. No tolerances or accepted baselines changed. CLI review was
attempted but the installed CLI rejected its configured model; independent review
was used, not reported as a CLI pass.

Diagnostic scene/catalog files were moved back into ignored scratch or removed
after capture. No diagnostic production path survives. Equipment must be rebaked
and fitted to the retained body after integration; the grip axis/center intent
from the prior curl pass is unchanged, but actual clearances need measurement.

## Decision record for integration

**Local hand preservation instead of a fixed whole-body 9k target — sound,
medium confidence, provisional.** When a small fingertip and a broad torso both
enter the same smoothing/reduction pass, the old process can erase the fingertip
while keeping an apparently valid body. The authoring process now excludes the
distal hands from relaxation and configures their vertices against collapse;
the body retains a provisional allowance and the preserved hand faces are added.
The alternative would keep the same total count and force the newly protected
hands to consume triangles previously used elsewhere. The plan delegated
topology choices but did not specify how to allocate detail. This decision affects
future retopology and requires budget/LOD work before production promotion; it is
reversible in the authoring script and does not establish an accepted count.
