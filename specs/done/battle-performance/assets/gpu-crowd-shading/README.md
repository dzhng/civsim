# Crowd shading discriminator

A scratch TypeGPU pipeline replaces only main mesh shading with opaque constant
colour. Mesh buffers, index counts, source position/depth algorithm, visibility,
poses, shadows and impostors remain. The compiler may also remove unused normal,
tangent and varying work; this is not an exclusive fragment-only timer. Constant
colour is diagnostic and cannot be accepted as a visual optimization.

At the same frozen workload and physical cameras as the layer controls, all12
ABBA blocks complete with50 selected GPU submissions each, unchanged draw and
triangle counts, no warnings/errors, and no missing selected queries. Root
inspected the full and flat-colour captures: the soldier geometry remains framed.

| Framing | Main GPU full → cheap mesh | Main mesh triangles |
| --- | ---: | ---: |
|200m tactical|13.91→8.76ms|15,845,822|
|200m low angle|13.70→8.75ms|15,945,302|
|600m wider|9.19→6.92ms|6,738,100|

Shading/normal/varying work is substantial. Geometry is also unusually dense for
these footprints, and small triangles can increase fragment work, so the next
controlled experiment uses existing L2 at L1 footprints with full materials.
Do not assume the cost is solely vertices or solely texture sampling. Shader
feature branches require actual material prevalence and parity proof before an
optimization; disabling normal maps or lighting is not the proposed result.

Intervals overlap and omission effects are not additive. This fixed tick30
workload does not replace the live contact benchmark or final shadow equation.
