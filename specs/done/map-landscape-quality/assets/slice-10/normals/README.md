# Instance scale and lighting

Position scales horizontally by instance size and vertically by instance height.
Normals must use the inverse transpose of that transform before yaw rotation.
The common horizontal factor cancels during normalization, so only normal Z
needs the size/height ratio. Uniform-scale instances retain the old arithmetic.

The fixture compares the production instance path with geometry whose positions
and normals are independently transformed with Three Matrix4/Matrix3 on the CPU.
Tall and wide props fail before the correction (18,192 and 80,737 changed pixels),
while uniform props match exactly. After correction, residual differences are
small quantization differences: tall maximum3/channel sum3,596; wide maximum2/sum
10,896 across4,096,000 channels. The initially authored zero-difference cross-path
assumption was too strict for differing CPU/GPU arithmetic order. The comparison
now bounds maximum channel error3 and mean error below0.004; production snapshots
still repeat with strict zero differing RGBA pixels. A before-code control must
also fail this precision bound before the pass is accepted.

No environment, palette, geometry, planting or physical terrain behavior changes.
This is a correctness checkpoint before environment tuning, not completion of10.

The matched old-code control also fails the precision bound: tall maximum38 and
channel sum271,673; wide maximum24 and sum1,442,003. Thus the bound distinguishes
the bug from arithmetic quantization. Fresh visual comparison finds no new
holes, clipping or changed silhouettes; wide rock faces have more consistent
lighting. The static review does not stand in for the independent transform check.

Final fixture repeat passes all three production snapshots with zero differing
RGBA pixels, all transform comparisons within the measured precision bound,
and clean GPU validation. Existing regional/tree snapshots must be refreshed
separately because their deliberately nonuniform instances now light correctly.

Independent code review confirms the inverse-transpose calculation and independent
baked-reference fixture; typecheck passes. No additional correctness finding was
reported. The regional review window was non-blocking; the retained correction
follows the transform evidence and fresh visual review without changing lighting
presets to compensate for the previous error.

All six affected regional/seating snapshots repeat exactly after refresh. The
existing campaign and battle tree-LOD sequences remain unchanged and pass their
coverage/return checks. No GPU/page errors occur. All 479 CPU tests and typecheck
pass. The shared correction is accepted; environment tuning remains open.
