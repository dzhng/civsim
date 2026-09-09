# Cylindrical curl direction — candidate only

Target: natural adult digits curled toward a cylindrical handle, with an opposing
thumb and visible finger separation. Bare-hand geometry cannot prove equipment
contact. This pass changes finger/thumb centerlines and ring orientation only;
palm, wrist, other anatomy source, bones, animation and export logic stay unchanged.

## Fixed framing and comparison

The original whole-body neutral/deep-bend and head sheets remain unchanged in
their camera settings. A supplemental native right-hand sheet uses pitch 1.4,
zoom 1500 and target [-.5732,-.051,.9024], four original bearings, neutral pose,
1280×800 viewport/DPR 1 and the same production daylight/SwiftShader path. Crops
are x320, y96, 640×640 per tile. The side tile is occluded by the body and provides
no hand evidence; the front/rear/three-quarter tiles remain usable. It is not a
replacement for the original gameplay camera or proof of a supported gameplay zoom.

[Before](grip-before-hand-detail.png) and [after](grip-curl-hand-detail.png) show
the same frozen framing. Their [before crop](grip-before-front-crop.png) and
[after crop](grip-curl-front-crop.png) use x225,y145,205×245 within the sheet,
enlarged 2× nearest-neighbor. 22,295 of 50,225 native crop pixels changed. That proves
the new geometry reaches production rendering, not anatomical correctness.

The [close](grip-curl-close.png), [gameplay](grip-curl-gameplay.png) and
[head](grip-curl-head.png) sheets retain full regression scope. Although other
anatomical source is unchanged, global remeshing/reduction can alter its resulting
topology; those image differences are retained rather than hidden by hand-only
comparison.

## Fresh verdict

**Retain the cylindrical curl as a less-wrong working direction; do not accept
the hand, grip contact, anatomy slice or equipment row.** Independent unprimed
review preferred the curl with high confidence: fingers now turn toward the
palm and the thumb opposes them rather than projecting as a thin spike.

Still failing: sharp triangular fingertip hooks, bulky palm relative to short
visible digits, mitten-like rear silhouette, and a smooth crescent thumb without
convincing joint definition. The global 4mm remesh, relaxation and provisional 9k
reduction may erase authored digit detail; inspect the sculpt versus deform mesh
before another centerline-tuning pass. 9k is not an accepted quality cap.

The design cylinder has nominal radius 17mm. In Blender's metre/Z-up coordinates,
its center is (±.5732,-.051,.9024) and axis is (±.80,0,.60), mirrored by side.
This is fitting intent, not measured clearance after remeshing. Future weapon
and shield handles must be fitted to the actual exported surface and recaptured.
Bent-hand native views need the bone-transformed center rather than silently
reusing this neutral target.

## Technical evidence

The [before report](grip-before-capture.json) records original source at the new
native camera. The [curl report](grip-curl-capture.json) retains all structural
weighted-pose, alias-selection and frozen-repeat checks; only the four changed
unaccepted image comparisons fail. Blender's manifold/normalized≤4 influence
checks and the exact candidate bake check pass. No accepted baseline is changed.

Independent source review found consistent curl axes and camera center, no
unintended rig/body authoring change, and no blocking source-contract failure.
The thumb's fixed across axis makes its sections oblique to its tangent; the
comment now describes ring depth rather than claiming fully normal sections.
Actual natural shape remains the visual gate above.
