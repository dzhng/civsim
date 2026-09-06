# Local-palette numerical bounds revalidation

Arithmetic target: shared local-palette kernel `6949db51` with the explicit zero/subnormal-cosine right-angle branch. The prior `c8e8b3d8` kernel's unguarded atan2 call is not covered at that endpoint. This is a source/CPU proof, not another GPU visual or performance acceptance.

## Depth-independent retained poses

CPU scalar interpolation now clamps only a floating-point result beyond its two endpoints. Mathematically this is the same convex interpolation; endpoint copies remain unchanged. Translation and scale sampling and frozen interruption blends share this owner. There is no maximum interruption-depth assumption. Each component remains inside its authored interval, so the translation envelope uses the component box, not the exact vector convex hull. Scale already uses the maximum absolute component. Masks select admitted joint locals.

Thirty million adversarial finite scalar trials did not reproduce an existing source overshoot. This is an explicit invariant strengthening, not a claimed observed bug fix. The new box-envelope test was observed red when restored to the previous vector-key norm envelope; it is a strengthened conservative contract, not a claim that actual motion reaches every box corner.

## GPU interpolation and normalization

Let `u=2^-23`, `gamma(n)=nu/(1-nu)`. WGSL permits either adjacent float; unlike CPU Float32 storage it does not promise nearest-even. With input norm at most M, one `a+(b-a)*w` stage has absolute error at most `(5u+6u²+2u³)M`: subtraction and multiplication contribute `(4u+2u²)M`, then the final add contributes its rounding against the ideal convex result. One CPU Float32 packing (relative error at most u/2) and three stages (sample, base, upper) are bounded by `1+gamma(16)`. The same scalar factor applies to scale; translations use the vector norm. Sixteen smallest-normal absolute terms, divided by `1-16u`, cover flushed scalar intermediate results; translation uses their sqrt(3) norm. TRS coefficient construction still has its separate gamma(6) allowance; hierarchy/skin gamma terms also use the portable u.

Finite endpoints alone are insufficient: the source producer also admits each T/S component span plus twice its prior-stage drift through outward Float32 arithmetic. This rejects `b-a` overflow before any finite convex-result argument is used. The existing positive hierarchy/skin operator bounds similarly reject unrepresentable products and sums.

The [WGSL accuracy rules](https://www.w3.org/TR/WGSL/#accuracy-of-builtin-functions) permit correctly rounded basic arithmetic, division error of2.5ULP and inverse-square-root error of2ULP. Length inherits sqrt(dot), and sqrt inherits reciprocal inverse-square-root. Thus, for a safely normal nonzero four-vector, the final normalized length is at most

`(1+2.5u)(1+2u) / ((1-2.5u)*sqrt(1-gamma(7)-eta7/1e-6))`,

where eta7 is the seven-operation absolute flush allowance. The denominator explicitly covers dot underflow using the lower squared result magnitude; two smallest-normal terms cover component division underflow. All evaluation rounds outward. Normalization resets this error at each blend; multiplying it by interruption count or blend count would be incorrect. Endpoint bypasses instead retain the admitted source quaternion norm plus CPU Float32 packing. The rotation operator envelope takes the larger of those two cases.

The shared source/decoded quaternion predicate admits norm deviation at most1e-4. This is essential to the relative normalization proof, not a claim covering malformed tiny rotations. Current source extrema are0.9999999477226734 and1.0000000702293736. With that envelope, the near-parallel branch has an order-one result. In the other branch, cosine is at most.9995; allowing dot error, `|b-a*cosine|` exceeds.02. For normal cosine the permitted atan2 error keeps the angle above.01 and below1.572; zero/subnormal cosine instead takes the mathematical pi/2 endpoint. This guard is necessary because WGSL explicitly leaves atan2 accuracy unbounded there. On that interval the degree11 sine polynomial divided by its argument exceeds.63, including rounded Horner evaluation. At least one coefficient is therefore above.003, and shortest-arc inputs cannot cancel it: the result norm exceeds.001. Squared norm is far above the flush range.

Hierarchy/inverse-bind/weighted-skin operation counts are unchanged, but their basic error unit now covers portable directed rounding too. Model-local centers stay unchanged; world placement remains the renderer's transform. Root motion is preserved. Current-device empirical passes did not establish this cross-device bound. This proof does not certify arbitrary later shader rewrites.

## Measured effect and test ledger

All23 package manifests and mirrored web manifests change radius only. Geometry, materials, skeletons and animation bytes are unchanged. [All radii](gpu-bounds-radii.json) record the final portable allowance: maximum ratio1.0000774681333846; production maximum1.0000381546711428 (shock cavalry). This is not a measured frame-time cost;07 still owns allocation/culling/performance and15/28 readability.

| Test | Previous coverage | Added contract |
| --- | --- | --- |
| Animated bounds | Continuous quaternion arcs and masked poses | Component-box corner rather than exact vector-hull assumption; tiny malformed quaternion rejected by shared source admission. |
| Retained CPU locals | Finite source blends and interruption examples | Ten thousand repeated near-end/opposite-sign/wide-range blends stay within each preceding pair of endpoints; exact endpoint copies retained. No claimed old overshoot. |
| Interpolation delta overflow | Finite endpoint/final-radius admission | Individually finite T endpoints ±3e38 are rejected because their GPU subtraction overflows. Observed red: missing expected exception; green after expanded-span admission. |

The existing masked controls and source vertices remain supplemental evidence, not the analytic proof. No browser baseline was changed.

The initial independent review passed; the author's subsequent primary-spec audit found the directed-rounding and atan2-domain portability gaps. Corrected-proof review `01a07605-0c3e-7533-a310-e1692d9b4ed0` accepted that argument but found the delta-overflow admission defect above. It was reproduced and fixed, not dismissed. The full source bake suite, typecheck and252web tests pass. The original compatible local-animation oracle checks8,302,608vertices at the unchanged1.8506258364033728e-6m maximum; mounted86,400vertices remain2.388837865275353e-7m. Kernel GPU verification belongs to its owner's evidence; none was run in this source worktree.

Focused follow-up review `01a0760b-614b-7102-8844-a0d3a8d3b693` returned clean after independently checking expanded-span admission, the regression and all current roster/candidate bake checks. Integration must retain the parent-owned local-animation quaternion predicate and merge its new sampled-frame admission loop; this pass changes the numerical envelope, not the animation format.
